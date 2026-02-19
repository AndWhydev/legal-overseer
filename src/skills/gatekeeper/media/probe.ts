/**
 * FFprobe Metadata Extraction Module
 *
 * Extracts media metadata using FFprobe via fluent-ffmpeg.
 * Provides duration, resolution, fps, codec, and audio stream info.
 *
 * Configuration:
 * - Set FFPROBE_PATH env var for custom ffprobe location
 * - Falls back to 'ffprobe' in system PATH
 * - In Alpine container: uses /usr/bin/ffprobe from 'apk add ffmpeg'
 */

import ffmpeg from 'fluent-ffmpeg';
import type { MediaMetadata } from '../types.js';

// Configure ffprobe path from environment or use system PATH
const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
ffmpeg.setFfprobePath(ffprobePath);

/**
 * Parse frame rate from FFprobe format (e.g., "30000/1001" -> 29.97)
 *
 * FFprobe returns frame rates as fraction strings for precision.
 * This function safely parses them to numbers.
 *
 * @param frameRateStr - Frame rate string like "30/1" or "30000/1001"
 * @returns Parsed frame rate as number, or 0 if unparseable
 */
function parseFrameRate(frameRateStr: string | undefined): number {
  if (!frameRateStr) return 0;

  // Handle fraction format like "30000/1001"
  if (frameRateStr.includes('/')) {
    const parts = frameRateStr.split('/');
    const numerator = parseFloat(parts[0] || '0');
    const denominator = parseFloat(parts[1] || '1');
    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  // Handle simple number format
  const parsed = parseFloat(frameRateStr);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Extract media metadata using FFprobe.
 *
 * Probes the file once and extracts all technical metadata needed
 * for QA validation. Call this once per file and cache the result.
 *
 * @param filePath - Path to the media file to probe
 * @returns MediaMetadata with duration, resolution, fps, codecs, etc.
 * @throws Error if no video stream found or probe fails
 *
 * @example
 * ```typescript
 * const metadata = await probeMedia('/path/to/video.mp4');
 * console.log(`Duration: ${metadata.duration}s`);
 * console.log(`Resolution: ${metadata.width}x${metadata.height}`);
 * console.log(`FPS: ${metadata.fps}`);
 * console.log(`Has audio: ${metadata.hasAudio}`);
 * ```
 */
export function probeMedia(filePath: string): Promise<MediaMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`FFprobe failed: ${err.message}`));
        return;
      }

      // Find video stream
      const videoStream = metadata.streams.find(
        (s) => s.codec_type === 'video'
      );

      if (!videoStream) {
        reject(new Error('No video stream found in media file'));
        return;
      }

      // Find audio stream (may not exist)
      const audioStream = metadata.streams.find(
        (s) => s.codec_type === 'audio'
      );

      // Extract metadata with null-safe defaults
      const result: MediaMetadata = {
        duration: metadata.format.duration ?? 0,
        width: videoStream.width ?? 0,
        height: videoStream.height ?? 0,
        fps: parseFrameRate(videoStream.r_frame_rate),
        hasAudio: !!audioStream,
        videoCodec: videoStream.codec_name ?? 'unknown',
        audioCodec: audioStream?.codec_name ?? null,
        bitrate: metadata.format.bit_rate
          ? parseInt(String(metadata.format.bit_rate), 10)
          : 0,
      };

      resolve(result);
    });
  });
}
