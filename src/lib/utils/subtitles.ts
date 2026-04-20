/**
 * Subtitle engine — shared between audiogram and video subtitle modes.
 * Pure functions only. No imports from audiogram-specific files.
 * This module can be extracted to a standalone app without rework.
 */

import placeholderConfig from '$lib/config/subtitlePlaceholders.json';

// --- Data models ---

export interface WordTimestamp {
	word: string;
	start: number; // seconds
	end: number;   // seconds
}

export interface SubtitleSegment {
	start: number;
	end: number;
	text: string;
	words: WordTimestamp[];
}

export type SubtitleTemplate = 'flow' | 'focus';
export type FontSize = 'small' | 'medium' | 'large';
export type MaxLines = 1 | 2;

export interface SubtitleStyle {
	template: SubtitleTemplate;
	fontSize: FontSize;
	maxLines: MaxLines;
	verticalPosition: number;    // 0–1, proportion from top of canvas
	textColor: string;           // hex, default #FFFFFF
	spotlightEnabled: boolean;
	spotlightColor: string;      // hex, default #FFD700
	outlineEnabled: boolean;
	outlineColor: string;        // hex, default #000000
	shadowEnabled: boolean;
	shadowColor: string;         // hex, default #000000
	shadowOpacity: number;       // 0–1, default 0.5
	textAlign: 'left' | 'center' | 'right';
	boldEnabled: boolean;
	uppercaseEnabled: boolean;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
	template: 'focus',
	fontSize: 'medium',
	maxLines: 2,
	verticalPosition: 0.82,
	textColor: '#FFFFFF',
	spotlightEnabled: true,
	spotlightColor: '#FFD700',
	outlineEnabled: true,
	outlineColor: '#000000',
	shadowEnabled: false,
	shadowColor: '#000000',
	shadowOpacity: 0.5,
	textAlign: 'center',
	boldEnabled: true,
	uppercaseEnabled: false,
};

// --- Font size mapping ---

const FONT_SIZE_RATIOS: Record<FontSize, number> = {
	small: 0.035,
	medium: 0.05,
	large: 0.07,
};

// --- Core engine functions ---

/**
 * Returns the segment whose start/end window contains currentTime, or null.
 */
export function getActiveSegment(
	segments: SubtitleSegment[],
	currentTime: number
): SubtitleSegment | null {
	for (const seg of segments) {
		if (currentTime >= seg.start && currentTime < seg.end) {
			return seg;
		}
	}
	return null;
}

/**
 * Wraps text to respect the maxLines ceiling.
 * Returns an array of lines (length <= maxLines).
 */
export function wrapSegmentText(
	text: string,
	charsPerLine: number,
	maxLines: MaxLines
): string[] {
	const words = text.trim().split(/\s+/);
	const lines: string[] = [];
	let currentLine = '';

	for (const word of words) {
		if (lines.length >= maxLines) break;

		const testLine = currentLine ? `${currentLine} ${word}` : word;
		if (testLine.length > charsPerLine && currentLine) {
			lines.push(currentLine);
			currentLine = word;
		} else {
			currentLine = testLine;
		}
	}

	if (currentLine && lines.length < maxLines) {
		lines.push(currentLine);
	}

	return lines;
}

/**
 * Derives how many characters fit per line from canvas width and font size.
 * Internal to the engine.
 */
export function calculateCharsPerLine(canvasWidth: number, fontSize: FontSize): number {
	// Approximate: Inter at medium size ~0.55 * fontSize width per char
	const fontPx = canvasWidth * FONT_SIZE_RATIOS[fontSize];
	const charWidth = fontPx * 0.55;
	// Use 90% of canvas width for text
	return Math.floor((canvasWidth * 0.9) / charWidth);
}

/**
 * Draws the subtitle block for the active segment onto a 2D canvas context.
 * Handles both Flow and Focus rendering.
 * Called from renderFrame() in the export pipeline and during live playback preview.
 */
export function drawSubtitle(
	ctx: CanvasRenderingContext2D,
	segment: SubtitleSegment,
	style: SubtitleStyle,
	canvasWidth: number,
	canvasHeight: number,
	currentTime: number
): void {
	const fontPx = canvasHeight * FONT_SIZE_RATIOS[style.fontSize];
	const charsPerLine = calculateCharsPerLine(canvasWidth, style.fontSize);
	const lines = wrapSegmentText(segment.text, charsPerLine, style.maxLines);

	if (lines.length === 0) return;

	ctx.save();
	const fontWeight = style.boldEnabled ? 700 : 400;
	ctx.font = `${fontWeight} ${fontPx}px 'Inter', sans-serif`;
	ctx.textAlign = style.textAlign;
	ctx.textBaseline = 'top';

	const lineHeight = fontPx * 1.3;
	const totalHeight = lines.length * lineHeight;
	const blockY = canvasHeight * style.verticalPosition - totalHeight / 2;
	const centerX = canvasWidth / 2;

	if (style.template === 'focus') {
		drawFocusSubtitle(ctx, segment, style, lines, centerX, blockY, lineHeight, fontPx, currentTime);
	} else {
		drawFlowSubtitle(ctx, segment, style, lines, centerX, blockY, lineHeight, fontPx, currentTime);
	}

	ctx.restore();
}

// Helper functions for text alignment and transformation
function getTextStartX(
	canvasWidth: number,
	textAlign: 'left' | 'center' | 'right',
	totalLineWidth: number
): number {
	switch (textAlign) {
		case 'left':
			return canvasWidth * 0.05; // 5% padding from left edge
		case 'center':
			return (canvasWidth - totalLineWidth) / 2;
		case 'right':
			return canvasWidth * 0.95 - totalLineWidth; // 5% padding from right edge
	}
}

function transformText(text: string, uppercaseEnabled: boolean): string {
	return uppercaseEnabled ? text.toUpperCase() : text;
}

function drawFocusSubtitle(
	ctx: CanvasRenderingContext2D,
	segment: SubtitleSegment,
	style: SubtitleStyle,
	lines: string[],
	centerX: number,
	blockY: number,
	lineHeight: number,
	fontPx: number,
	currentTime: number
): void {
	// Find active word: word.start <= currentTime < word.end
	// If in a gap, use the most recently completed word
	let activeWordIndex = -1;
	for (let i = 0; i < segment.words.length; i++) {
		const w = segment.words[i];
		if (currentTime >= w.start && currentTime < w.end) {
			activeWordIndex = i;
			break;
		}
		if (currentTime >= w.end) {
			activeWordIndex = i; // hold last completed word
		}
	}

	// Build a flat word list from lines for colour mapping
	const allWords = segment.text.trim().split(/\s+/);
	let wordIdx = 0;

	for (let li = 0; li < lines.length; li++) {
		const lineY = blockY + li * lineHeight;
		const lineWords = lines[li].split(/\s+/);

		// Apply uppercase transformation if enabled
		const transformedLineWords = lineWords.map(word => transformText(word, style.uppercaseEnabled));
		const transformedLineText = transformedLineWords.join(' ');
		
		// Render word by word to apply spotlight colour
		// We need to measure and position each word manually
		const totalLineWidth = ctx.measureText(transformedLineText).width;
		let wordX = getTextStartX(centerX * 2, style.textAlign, totalLineWidth);

		for (let wi = 0; wi < lineWords.length; wi++) {
			const word = lineWords[wi];
			const isActive = wordIdx === activeWordIndex;
			const wordColor = (isActive && style.spotlightEnabled) ? style.spotlightColor : style.textColor;

			applyTextEffects(ctx, style, fontPx);
			ctx.fillStyle = wordColor;

			if (style.outlineEnabled) {
				ctx.strokeStyle = style.outlineColor;
				ctx.lineWidth = 2.5;
				ctx.textAlign = 'left';
				ctx.strokeText(word, wordX, lineY);
			}
			ctx.textAlign = 'left';
			ctx.fillText(word, wordX, lineY);

			const wordWidth = ctx.measureText(word + ' ').width;
			wordX += wordWidth;
			wordIdx++;
		}

		resetTextEffects(ctx);
	}
}

function drawFlowSubtitle(
	ctx: CanvasRenderingContext2D,
	segment: SubtitleSegment,
	style: SubtitleStyle,
	lines: string[],
	centerX: number,
	blockY: number,
	lineHeight: number,
	fontPx: number,
	currentTime: number
): void {
	const FADE_DURATION = 0.15; // seconds

	// Build word-to-timestamp map from segment.words
	const wordTimings = segment.words;

	// Build flat word list from lines
	const allWords = segment.text.trim().split(/\s+/);
	let wordIdx = 0;

	for (let li = 0; li < lines.length; li++) {
		const lineY = blockY + li * lineHeight;
		const lineWords = lines[li].split(/\s+/);

		const lineText = lines[li];
		const totalLineWidth = ctx.measureText(lineText).width;
		let wordX = centerX - totalLineWidth / 2;

		for (let wi = 0; wi < lineWords.length; wi++) {
			const word = lineWords[wi];
			const timing = wordTimings[wordIdx];

			if (!timing || currentTime < timing.start) {
				// Word hasn't started yet — invisible
				const wordWidth = ctx.measureText(word + ' ').width;
				wordX += wordWidth;
				wordIdx++;
				continue;
			}

			const elapsed = currentTime - timing.start;
			const isFading = elapsed < FADE_DURATION;
			const alpha = isFading ? elapsed / FADE_DURATION : 1;
			const isCurrentlyFading = isFading;

			const wordColor = (isCurrentlyFading && style.spotlightEnabled)
				? style.spotlightColor
				: style.textColor;

			ctx.globalAlpha = alpha;
			applyTextEffects(ctx, style, fontPx);
			ctx.fillStyle = wordColor;

			if (style.outlineEnabled) {
				ctx.strokeStyle = style.outlineColor;
				ctx.lineWidth = 2.5;
				ctx.textAlign = 'left';
				ctx.strokeText(word, wordX, lineY);
			}
			ctx.textAlign = 'left';
			ctx.fillText(word, wordX, lineY);

			resetTextEffects(ctx);
			ctx.globalAlpha = 1;

			const wordWidth = ctx.measureText(word + ' ').width;
			wordX += wordWidth;
			wordIdx++;
		}
	}
}

function applyTextEffects(
	ctx: CanvasRenderingContext2D,
	style: SubtitleStyle,
	_fontPx: number
): void {
	if (style.shadowEnabled) {
		const rgb = hexToRgb(style.shadowColor);
		const opacity = style.shadowOpacity ?? 0.5;
		ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
		ctx.shadowBlur = 4;
		ctx.shadowOffsetX = 1;
		ctx.shadowOffsetY = 1;
	}
}

function resetTextEffects(ctx: CanvasRenderingContext2D): void {
	ctx.shadowColor = 'transparent';
	ctx.shadowBlur = 0;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 0;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return { r: 0, g: 0, b: 0 };
	return {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16),
	};
}

// --- Segment editing functions ---

/**
 * Merges two adjacent segments.
 * Text joined with a space. Words arrays concatenated.
 * Timestamp spans from start of A to end of B.
 */
export function mergeSegments(
	segA: SubtitleSegment,
	segB: SubtitleSegment
): SubtitleSegment {
	return {
		start: segA.start,
		end: segB.end,
		text: `${segA.text} ${segB.text}`.trim(),
		words: [...segA.words, ...segB.words],
	};
}

/**
 * Splits a segment at a word boundary using word-level timestamps.
 * First segment spans segment.start to words[wordIndex].end.
 * Second segment spans words[wordIndex + 1].start to segment.end.
 */
export function splitSegmentAtWord(
	segment: SubtitleSegment,
	wordIndex: number
): [SubtitleSegment, SubtitleSegment] {
	const wordsA = segment.words.slice(0, wordIndex + 1);
	const wordsB = segment.words.slice(wordIndex + 1);

	const textA = wordsA.map(w => w.word).join(' ');
	const textB = wordsB.map(w => w.word).join(' ');

	const segA: SubtitleSegment = {
		start: segment.start,
		end: wordsA[wordsA.length - 1]?.end ?? segment.start,
		text: textA,
		words: wordsA,
	};

	const segB: SubtitleSegment = {
		start: wordsB[0]?.start ?? segment.end,
		end: segment.end,
		text: textB,
		words: wordsB,
	};

	return [segA, segB];
}

/**
 * After any text edit or style change, re-wraps all segment text against the
 * current character budget. Timestamps and word arrays are never modified.
 */
export function reflow(
	segments: SubtitleSegment[],
	style: SubtitleStyle,
	canvasWidth: number,
	_canvasHeight: number
): SubtitleSegment[] {
	const charsPerLine = calculateCharsPerLine(canvasWidth, style.fontSize);
	// reflow only validates wrapping — text content and timestamps unchanged
	return segments.map(seg => ({
		...seg,
		// Ensure text is clean (trim extra whitespace from edits)
		text: seg.text.trim().replace(/\s+/g, ' '),
	}));
}

/**
 * Builds a placeholder SubtitleSegment for the given template from config.
 *
 * Key design: the segment always contains ALL words from the placeholder text,
 * with evenly-spaced timestamps across PLACEHOLDER_CYCLE_DURATION. The
 * drawSubtitle() engine wraps the text into lines based on the current
 * fontSize/maxLines settings, but the word timestamps always cover the full
 * word list — so the animation cycles through every word regardless of how
 * many lines are visible at once.
 *
 * @param template - 'focus' or 'flow'
 * @returns A SubtitleSegment ready to pass to drawSubtitle()
 */
export function buildPlaceholderSegment(template: SubtitleTemplate): SubtitleSegment {
	const cfg = placeholderConfig.placeholders[template];
	const allWords = cfg.words;
	const wordDuration = PLACEHOLDER_CYCLE_DURATION / allWords.length;

	const words: WordTimestamp[] = allWords.map((word, i) => ({
		word,
		start: i * wordDuration,
		end: (i + 1) * wordDuration,
	}));

	return {
		start: 0,
		end: PLACEHOLDER_CYCLE_DURATION,
		text: allWords.join(' '),
		words,
	};
}

/**
 * The duration (in seconds) of one placeholder animation cycle.
 * AudiogramPage uses this to loop the placeholder currentTime.
 */
export const PLACEHOLDER_CYCLE_DURATION = 4.0;

/**
 * Draws a placeholder subtitle preview (no real segments loaded yet).
 * Uses template-specific text from subtitlePlaceholders.json.
 * Pass an animated currentTime (looping 0 → PLACEHOLDER_CYCLE_DURATION) to
 * show the template behaviour live on the canvas.
 *
 * The placeholder segment always contains all words; the engine wraps them
 * into lines based on the current style (fontSize, maxLines). This means
 * the animation always cycles through all words regardless of line count.
 *
 * @param ctx - Canvas 2D context
 * @param style - Current subtitle style (template, size, colours, etc.)
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param currentTime - Animated time (0 → PLACEHOLDER_CYCLE_DURATION, looping)
 */
export function drawPlaceholderSubtitle(
	ctx: CanvasRenderingContext2D,
	style: SubtitleStyle,
	canvasWidth: number,
	canvasHeight: number,
	currentTime: number = 0.25
): void {
	const segment = buildPlaceholderSegment(style.template);
	drawSubtitle(ctx, segment, style, canvasWidth, canvasHeight, currentTime);
}
