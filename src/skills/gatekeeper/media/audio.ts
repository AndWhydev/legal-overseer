/**
 * Audio Level Analysis Module
 *
 * Analyzes audio levels using FFmpeg's volumedetect filter.
 * Used by Gatekeeper skill for broadcast standard compliance.
 *
 * Target standards (from style guide sg-031):
 * - Integrated LUFS: -14
 * - True Peak: -1 dB
 *
 * Configuration:
 * - Set FFMPEG_PATH env var for custom ffmpeg location
 * - Falls back to 'ffmpeg' in system PATH
 * - In Alpine container: uses /usr/bin/ffmpeg from 'apk add ffmpeg'
 */

import ffmpeg from 'fluent-ffmpeg';
import type { AudioLevels } from '../types.js';
import { probeMedia } from './probe.js';

// Configure ffmpeg path from environment or use system PATH
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
ffmpeg.setFfmpegPath(FFMPEG_PATH);

/**
 * Check if a media file has an audio stream.
 *
 * Uses FFprobe to detect audio stream presence. Call this before
 * running volumedetect to avoid errors on silent videos.
 *
 * @param filePath - Path to the media file to check
 * @returns true if audio stream exists, false otherwise
 *
 * @example
 * ```typescript
 * if (await hasAudioStream('/path/to/video.mp4')) {
 *   const levels = await analyzeAudioLevels('/path/to/video.mp4');
 *   console.log(`Mean volume: ${levels?.meanVolumeDb} dB`);
 * }
 * ```
 */
export async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const metadata = await probeMedia(filePath);
    return metadata.hasAudio;
  } catch {
    // If probe fails, assume no audio
    return false;
  }
}

/**
 * Analyze audio levels using FFmpeg volumedetect filter.
 *
 * Extracts mean and max volume in dB from the audio stream.
 * Returns null for videos without audio or if parsing fails.
 *
 * Note: volumedetect gives dB values, not LUFS. For broadcast
 * compliance, -14 LUFS roughly corresponds to ~-16 dB RMS for
 * typical content, but this is an approximation.
 *
 * @param filePath - Path to the media file to analyze
 * @returns AudioLevels with mean/max dB values, or null if no audio
 *
 * @example
 * ```typescript
 * const levels = await analyzeAudioLevels('/path/to/video.mp4');
 * if (levels) {
 *   console.log(`Mean: ${levels.meanVolumeDb} dB`);
 *   console.log(`Max: ${levels.maxVolumeDb} dB`);
 *   // Check for clipping (max should be < 0)
 *   if (levels.maxVolumeDb >= 0) {
 *     console.warn('Audio is clipping!');
 *   }
 * } else {
 *   console.log('No audio stream found');
 * }
 * ```
 */
export async function analyzeAudioLevels(
  filePath: string
): Promise<AudioLevels | null> {
  // Check for audio stream first to avoid errors
  const hasAudio = await hasAudioStream(filePath);
  if (!hasAudio) {
    return null;
  }

  return new Promise((resolve) => {
    let stderr = '';

    ffmpeg(filePath)
      .audioFilters('volumedetect')
      .format('null')
      .output('/dev/null')
      .on('stderr', (line: string) => {
        stderr += line + '\n';
      })
      .on('end', () => {
        // Parse volumedetect output from stderr
        // Format: mean_volume: -16.1 dB, max_volume: -0.3 dB
        const meanMatch = stderr.match(/mean_volume:\s*(-?\d+\.?\d*)\s*dB/);
        const maxMatch = stderr.match(/max_volume:\s*(-?\d+\.?\d*)\s*dB/);

        if (!meanMatch || !maxMatch) {
          // Parsing failed - likely silent audio or unusual format
          resolve(null);
          return;
        }

        resolve({
          meanVolumeDb: parseFloat(meanMatch[1]),
          maxVolumeDb: parseFloat(maxMatch[1]),
        });
      })
      .on('error', () => {
        // FFmpeg error - return null rather than throwing
        resolve(null);
      })
      .run();
  });
}
