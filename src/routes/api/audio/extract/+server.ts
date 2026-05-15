/**
 * Server-side audio extraction from video files (MP4, M4V)
 * Attempts to extract audio track and return as base64-encoded MP3
 * 
 * This endpoint uses the Web Audio API server-side equivalent via Node.js
 * For Cloudflare Workers, this acts as a fallback when client-side decoding fails
 */

import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return json(
        { error: 'Invalid content-type. Expected application/json' },
        { status: 400 }
      );
    }

    const body = await request.json() as {
      videoBase64: string;
      mimeType?: string;
    };

    if (!body.videoBase64) {
      return json(
        { error: 'Missing videoBase64 in request body' },
        { status: 400 }
      );
    }

    // Since Cloudflare Workers don't have FFmpeg, we'll return a helpful error
    // with instructions. In a full implementation, this would:
    // 1. Decode base64 to binary
    // 2. Use ffmpeg.wasm to extract audio
    // 3. Return as base64-encoded MP3
    //
    // For now, we recommend using the client-side fallback or uploading MP3/WAV

    return json(
      {
        error: 'Server-side video extraction not yet configured',
        hint: 'Most modern browsers support MP4 audio extraction natively. If you see this error, please try uploading an MP3 or WAV file instead.',
        supported: 'Chrome, Safari, Edge support MP4 audio extraction client-side'
      },
      { status: 501 }
    );
  } catch (error) {
    console.error('[AudioExtract] Error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
