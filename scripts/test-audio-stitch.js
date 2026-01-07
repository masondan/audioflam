/**
 * Audio Stitching Test Script
 * 
 * Tests whether YarnGPT audio segments can be stitched together seamlessly.
 * Generates two sentences separately, then concatenates them.
 * 
 * Usage: 
 *   1. Create a .env file with YARNGPT_API_KEY=your_key
 *   2. Run: node scripts/test-audio-stitch.js
 *   3. Listen to the output files in scripts/output/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env file
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        for (const line of envContent.split('\n')) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length) {
                process.env[key.trim()] = valueParts.join('=').trim();
            }
        }
    }
}

loadEnv();

const YARNGPT_API_KEY = process.env.YARNGPT_API_KEY;
if (!YARNGPT_API_KEY) {
    console.error('Error: YARNGPT_API_KEY not found in .env file');
    process.exit(1);
}

// Test sentences - designed to flow naturally together
const SENTENCE_1 = "The Minister of Finance announced new economic measures yesterday.";
const SENTENCE_2 = "These policies are expected to reduce inflation by three percent over the next year.";
const FULL_TEXT = SENTENCE_1 + " " + SENTENCE_2;

const VOICE = "Idera"; // One of: Idera, Regina, Tayo, Femi

const OUTPUT_DIR = path.join(__dirname, 'output');

async function generateAudio(text, filename) {
    console.log(`Generating: "${text.substring(0, 50)}..."`);
    
    const response = await fetch('https://yarngpt.ai/api/v1/tts', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${YARNGPT_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: text,
            voice: VOICE,
            response_format: 'mp3'
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`YarnGPT API error: ${response.status} - ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const outputPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
    console.log(`  Saved: ${filename} (${audioBuffer.byteLength} bytes)`);
    
    return audioBuffer;
}

/**
 * Simple MP3 concatenation (raw - will have click artifact)
 */
function concatenateBuffers(buffer1, buffer2) {
    const combined = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    combined.set(new Uint8Array(buffer1), 0);
    combined.set(new Uint8Array(buffer2), buffer1.byteLength);
    return combined.buffer;
}

/**
 * Stitch audio using ffmpeg with trim + crossfade
 * Trims the end of first clip (removes click artifact) and applies crossfade
 */
async function stitchWithFFmpeg(file1, file2, outputFile, trimEnd = 0.1, crossfadeDuration = 0.05) {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Get duration of first file to calculate trim point
    const probeCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${file1}"`;
    
    try {
        const { stdout } = await execAsync(probeCmd);
        const duration = parseFloat(stdout.trim());
        const trimmedDuration = duration - trimEnd;
        
        // Trim end of first file, then crossfade with second
        // atrim trims to specified duration, acrossfade blends the two
        const cmd = `ffmpeg -y -i "${file1}" -i "${file2}" -filter_complex "[0:a]atrim=0:${trimmedDuration},asetpts=PTS-STARTPTS[a1];[a1][1:a]acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri" "${outputFile}"`;
        
        await execAsync(cmd);
        console.log(`  Trimmed ${trimEnd}s from end of first clip, applied ${crossfadeDuration}s crossfade`);
        return true;
    } catch (error) {
        console.error('FFmpeg error:', error.message);
        console.log('\nNote: ffmpeg is required. Install with: brew install ffmpeg');
        return false;
    }
}

async function main() {
    console.log('\n=== YarnGPT Audio Stitching Test ===\n');
    console.log(`Voice: ${VOICE}`);
    console.log(`Sentence 1: "${SENTENCE_1}"`);
    console.log(`Sentence 2: "${SENTENCE_2}"`);
    console.log('');

    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    try {
        const file1Path = path.join(OUTPUT_DIR, '2-sentence-1.mp3');
        const file2Path = path.join(OUTPUT_DIR, '3-sentence-2.mp3');
        
        // Check if audio files already exist (skip API calls if so)
        if (fs.existsSync(file1Path) && fs.existsSync(file2Path)) {
            console.log('--- Using existing audio files (delete scripts/output/ to regenerate) ---');
        } else {
            // Generate full text as baseline (control)
            console.log('--- Generating baseline (full text in one call) ---');
            await generateAudio(FULL_TEXT, '1-baseline-full.mp3');
            
            console.log('\n--- Generating sentence 1 ---');
            await generateAudio(SENTENCE_1, '2-sentence-1.mp3');
            
            console.log('\n--- Generating sentence 2 ---');
            await generateAudio(SENTENCE_2, '3-sentence-2.mp3');
        }
        
        const audio1 = fs.readFileSync(file1Path);
        const audio2 = fs.readFileSync(file2Path);
        
        console.log('\n--- Concatenating segments (raw) ---');
        const stitched = concatenateBuffers(audio1, audio2);
        const stitchedPath = path.join(OUTPUT_DIR, '4-stitched-raw.mp3');
        fs.writeFileSync(stitchedPath, Buffer.from(stitched));
        console.log(`  Saved: 4-stitched-raw.mp3 (${stitched.byteLength} bytes)`);
        
        console.log('\n--- Stitching with trim + crossfade (ffmpeg) ---');
        const file1 = path.join(OUTPUT_DIR, '2-sentence-1.mp3');
        const file2 = path.join(OUTPUT_DIR, '3-sentence-2.mp3');
        const crossfadedPath = path.join(OUTPUT_DIR, '5-stitched-trimmed.mp3');
        // Trim 100ms from end of first clip (removes click), then 50ms crossfade
        const success = await stitchWithFFmpeg(file1, file2, crossfadedPath, 0.1, 0.05);
        
        if (success) {
            console.log(`  Saved: 5-stitched-crossfade.mp3`);
        }
        
        console.log('\n=== Test Complete ===');
        console.log(`\nOutput files saved to: ${OUTPUT_DIR}`);
        console.log('\nCompare these files:');
        console.log('  1-baseline-full.mp3        → Full text in one API call (control)');
        console.log('  4-stitched-raw.mp3         → Raw concatenation (has click)');
        console.log('  5-stitched-crossfade.mp3   → With 50ms crossfade (should be smooth)');
        console.log('\nListen for:');
        console.log('  - Click artifact (should be gone in crossfade version)');
        console.log('  - Natural flow between sentences');
        
    } catch (error) {
        console.error('\nError:', error.message);
        process.exit(1);
    }
}

main();
