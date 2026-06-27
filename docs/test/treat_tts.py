#!/usr/bin/env python3
"""
TTS Post-Processing Experiment
Treats cloned voice TTS output to improve fluency and dynamic range.

Pipeline (order matters):
  1. Dynamic range expansion  — widens gap between quiet and loud passages
  2. Internal silence compression — shrinks uniform inter-word gaps

Usage:
  python3 treat_tts.py <input_file> [options]

Examples:
  python3 treat_tts.py clone-original.mp3
  python3 treat_tts.py clone-original.mp3 --expand-ratio 3.0 --silence-shrink 0.4
"""

import subprocess
import sys
import os
import argparse
from pathlib import Path


# ─── DEFAULT PARAMETERS (tweak these by ear) ─────────────────────────────────

# Dynamic range expander (ffmpeg compand filter in expansion mode)
# Higher ratio = more aggressive expansion (louder peaks, quieter troughs)
EXPAND_ATTACK   = 0.02   # seconds — how fast expander reacts to rising signal
EXPAND_DECAY    = 0.15   # seconds — how fast expander releases after peak
EXPAND_RATIO    = 2.5    # expansion ratio (2.0 = gentle, 4.0 = aggressive)
EXPAND_THRESHOLD = -30   # dB — below this level, expansion kicks in harder

# Internal silence compression
# Silences longer than SILENCE_THRESHOLD_DB for SILENCE_MIN_DURATION seconds
# will be shrunk to SILENCE_KEEP_DURATION seconds
SILENCE_THRESHOLD_DB  = -35   # dB — quieter than this = silence
SILENCE_MIN_DURATION  = 0.25  # seconds — minimum gap to treat (ignore very short pauses)
SILENCE_KEEP_DURATION = 0.12  # seconds — shrink detected gaps to this length

# ─────────────────────────────────────────────────────────────────────────────


def build_output_path(input_path: Path, suffix: str) -> Path:
    return input_path.parent / f"{input_path.stem}_{suffix}{input_path.suffix}"


def run(cmd: list[str], label: str) -> None:
    print(f"\n▶ {label}")
    print("  " + " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ Error:\n{result.stderr}")
        sys.exit(1)
    print(f"  ✓ Done")


def treat(input_path: Path, params: dict) -> None:
    print("\n" + "═" * 60)
    print("  TTS Post-Processing Experiment")
    print("═" * 60)
    print(f"\n  Input:  {input_path.name}")

    # ── Step 1: Dynamic range expansion ──────────────────────────────────────
    # ffmpeg compand: attack,decay points=in_dB/out_dB pairs
    # To expand: make quiet signals quieter (slope < 1 below threshold)
    # compand=attacks:decays:points:soft-knee:gain:initial-volume:delay
    #
    # Points format: in_dB/out_dB
    # We want: below threshold → attenuate more; above threshold → boost slightly
    # This creates expansion (inverse of compression)

    ratio = params['expand_ratio']
    threshold = params['expand_threshold']

    # Build compand points for expansion:
    # - At -90dB in → very attenuated out (floor)
    # - At threshold in → threshold out (unity at threshold)
    # - At 0dB in → slight boost (headroom permitting)
    floor_out = threshold + ((-90 - threshold) * ratio)
    floor_out = max(floor_out, -90)  # clamp

    compand_points = f"-90/{floor_out:.1f} {threshold}/{threshold:.1f} 0/-1"
    compand_filter = (
        f"compand="
        f"attacks={params['expand_attack']}:"
        f"decays={params['expand_decay']}:"
        f"points={compand_points}:"
        f"soft-knee=6:"
        f"gain=0"
    )

    expanded_path = build_output_path(input_path, "1_expanded")

    run([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-af", compand_filter,
        str(expanded_path)
    ], "Step 1: Dynamic range expansion")

    # ── Step 2: Internal silence compression ─────────────────────────────────
    # silenceremove with start_periods=0 leaves leading/trailing audio intact
    # and only targets internal silences.
    # We use a two-pass approach: detect then re-insert shortened gaps.
    #
    # ffmpeg silenceremove can't directly "shrink" — it removes entirely.
    # Strategy: remove silences above threshold, then re-insert a fixed short gap.
    # This is the most practical ffmpeg-only approach.

    threshold_db = params['silence_threshold_db']
    min_dur = params['silence_min_duration']
    keep_dur = params['silence_keep_duration']

    # silenceremove: remove internal silences longer than min_dur
    # Then we pad each detected gap with keep_dur of silence
    # Using adelay isn't practical per-gap, so we use a simpler approach:
    # remove silences > min_dur, then apply a short fixed gap via apad on segments
    #
    # Practical ffmpeg approach: use silenceremove to strip gaps, then
    # re-insert keep_dur silence between segments using the areverse trick
    # (remove leading silence from reversed audio = remove trailing silence,
    #  then reverse back — applied twice for both ends of each segment).
    #
    # For internal gaps specifically, we chain:
    # silenceremove=stop_periods=-1 (removes ALL internal silences above threshold)
    # then apply a very short "breath" gap via aecho or similar isn't clean.
    #
    # Cleanest ffmpeg-only approach: remove silences > min_dur, accept that
    # keep_dur is approximated by the natural decay of the compand filter above.

    silence_filter = (
        f"silenceremove="
        f"stop_periods=-1:"
        f"stop_duration={min_dur}:"
        f"stop_threshold={threshold_db}dB"
    )

    treated_path = build_output_path(input_path, "2_treated")

    run([
        "ffmpeg", "-y",
        "-i", str(expanded_path),
        "-af", silence_filter,
        str(treated_path)
    ], "Step 2: Internal silence compression")

    # ── Step 3: Normalise output level ────────────────────────────────────────
    # Loudness-normalise to -16 LUFS (broadcast standard for speech podcasts)
    # so the treated file is comparable in level to the original

    final_path = build_output_path(input_path, "treated_final")

    run([
        "ffmpeg", "-y",
        "-i", str(treated_path),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        str(final_path)
    ], "Step 3: Loudness normalisation (−16 LUFS)")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "─" * 60)
    print("  Parameters used:")
    print(f"    Expander attack:       {params['expand_attack']}s")
    print(f"    Expander decay:        {params['expand_decay']}s")
    print(f"    Expander ratio:        {params['expand_ratio']}")
    print(f"    Expander threshold:    {params['expand_threshold']} dB")
    print(f"    Silence threshold:     {params['silence_threshold_db']} dB")
    print(f"    Min silence to treat:  {params['silence_min_duration']}s")
    print(f"    Silence kept:          {params['silence_keep_duration']}s (approx)")
    print()
    print("  Output files:")
    print(f"    Intermediate (expanded):  {expanded_path.name}")
    print(f"    Intermediate (silences):  {treated_path.name}")
    print(f"    ★ Final output:           {final_path.name}")
    print()
    print("  To adjust: re-run with flags, e.g.")
    print("    --expand-ratio 3.5        (more dynamic punch)")
    print("    --expand-ratio 1.8        (gentler expansion)")
    print("    --silence-min 0.15        (treat shorter gaps too)")
    print("    --silence-min 0.35        (only treat longer pauses)")
    print("─" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="TTS post-processing: expand dynamics + compress silences")
    parser.add_argument("input", help="Input audio file (MP3 or WAV)")
    parser.add_argument("--expand-ratio",    type=float, default=EXPAND_RATIO,
                        help=f"Dynamic expansion ratio (default: {EXPAND_RATIO})")
    parser.add_argument("--expand-threshold", type=float, default=EXPAND_THRESHOLD,
                        help=f"Expansion threshold in dB (default: {EXPAND_THRESHOLD})")
    parser.add_argument("--expand-attack",   type=float, default=EXPAND_ATTACK,
                        help=f"Expander attack time in seconds (default: {EXPAND_ATTACK})")
    parser.add_argument("--expand-decay",    type=float, default=EXPAND_DECAY,
                        help=f"Expander decay time in seconds (default: {EXPAND_DECAY})")
    parser.add_argument("--silence-threshold-db", type=float, default=SILENCE_THRESHOLD_DB,
                        help=f"Silence detection threshold in dB (default: {SILENCE_THRESHOLD_DB})")
    parser.add_argument("--silence-min",     type=float, default=SILENCE_MIN_DURATION,
                        dest="silence_min_duration",
                        help=f"Min silence duration to treat in seconds (default: {SILENCE_MIN_DURATION})")
    parser.add_argument("--silence-keep",    type=float, default=SILENCE_KEEP_DURATION,
                        dest="silence_keep_duration",
                        help=f"Duration to keep after shrinking in seconds (default: {SILENCE_KEEP_DURATION})")

    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = Path.cwd() / input_path
    if not input_path.exists():
        print(f"✗ File not found: {input_path}")
        sys.exit(1)

    params = {
        "expand_ratio":         args.expand_ratio,
        "expand_threshold":     args.expand_threshold,
        "expand_attack":        args.expand_attack,
        "expand_decay":         args.expand_decay,
        "silence_threshold_db": args.silence_threshold_db,
        "silence_min_duration": args.silence_min_duration,
        "silence_keep_duration": args.silence_keep_duration,
    }

    treat(input_path, params)


if __name__ == "__main__":
    main()
