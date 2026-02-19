/**
 * Video Frame Extraction Module
 *
 * Extracts key frames from videos at specific timestamps for Claude Vision analysis.
 * Uses fluent-ffmpeg to seek to target positions and extract single high-quality JPEG frames.
 *
 * Configuration:
 * - Set FFMPEG_PATH env var for custom ffmpeg location
 * - Falls back to 'ffmpeg' in system PATH
 * - In Alpine container: uses /usr/bin/ffmpeg from 'apk add ffmpeg'
 *
 * Usage:
 * - Extract 3 frames at 10%, 50%, 90% of video duration
 * - Frames stored in /tmp/bitbit-frames/ with nanoid-based unique filenames
 * - Caller must clean up frames after use (use cleanupFrames from cleanup.ts)
 */

import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import { probeMedia } from './probe.js';

// Configure ffmpeg path from environment or use system PATH
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
ffmpeg.setFfmpegPath(FFMPEG_PATH);

// Default temp directory for extracted frames
const DEFAULT_TEMP_DIR = '/tmp/bitbit-frames';

/**
 * Extracted frame metadata
 */
export interface ExtractedFrame {
  /** Path to the extracted JPEG file */
  path: string;
  /** Timestamp in seconds where frame was extracted */
  timestamp: number;
  /** Frame index (0-based) in extraction order */
  index: number;
}

/**
 * Ensure the temp directory exists
 */
async function ensureTempDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    // Directory may already exist, that's fine
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Extract a single frame at a specific timestamp
 *
 * @param videoPath - Path to the source video file
 * @param timestamp - Timestamp in seconds to extract frame from
 * @param outputPath - Full path for the output JPEG file
 * @returns Promise that resolves when extraction completes
 */
function extractFrameAtTimestamp(
  videoPath: string,
  timestamp: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(outputPath);
    const outputFilename = path.basename(outputPath);

    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .outputOptions('-q:v', '2') // High quality JPEG (2 = near-lossless)
      .output(path.join(outputDir, outputFilename))
      .on('end', () => resolve())
      .on('error', (err) =>
        reject(new Error(`Frame extraction failed at ${timestamp}s: ${err.message}`))
      )
      .run();
  });
}

/**
 * Extract key frames from a video at representative timestamps.
 *
 * Extracts frames at 10%, 50%, and 90% of the video duration to capture
 * start, middle, and end content for brand compliance analysis.
 *
 * @param videoPath - Path to the source video file
 * @param outputDir - Directory for extracted frames (default: /tmp/bitbit-frames)
 * @param count - Number of frames to extract (default: 3)
 * @returns Array of ExtractedFrame objects with paths and timestamps
 * @throws Error if video probing or frame extraction fails
 *
 * @example
 * ```typescript
 * const frames = await extractKeyFrames('/path/to/video.mp4');
 * console.log(`Extracted ${frames.length} frames`);
 * // frames[0].path = '/tmp/bitbit-frames/frame-abc123.jpg'
 * // frames[0].timestamp = 3.0 (10% of 30s video)
 *
 * // Don't forget to clean up!
 * await cleanupFrames(frames.map(f => f.path));
 * ```
 */
export async function extractKeyFrames(
  videoPath: string,
  outputDir: string = DEFAULT_TEMP_DIR,
  count: number = 3
): Promise<ExtractedFrame[]> {
  // Probe video to get duration
  const metadata = await probeMedia(videoPath);
  const { duration } = metadata;

  if (duration <= 0) {
    throw new Error('Cannot extract frames: video has zero or invalid duration');
  }

  // Ensure output directory exists
  await ensureTempDir(outputDir);

  // Calculate timestamps at 10%, 50%, 90% of duration
  // For count=3: [0.1, 0.5, 0.9]
  // For count=5: [0.1, 0.3, 0.5, 0.7, 0.9]
  const percentages: number[] = [];
  if (count === 1) {
    percentages.push(0.5); // Middle only
  } else if (count === 2) {
    percentages.push(0.1, 0.9); // Start and end
  } else {
    // For 3+ frames, distribute evenly from 10% to 90%
    const step = 0.8 / (count - 1);
    for (let i = 0; i < count; i++) {
      percentages.push(0.1 + step * i);
    }
  }

  const timestamps = percentages.map((p) => duration * p);

  // Extract frames at each timestamp
  const frames: ExtractedFrame[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const filename = `frame-${nanoid(8)}.jpg`;
    const framePath = path.join(outputDir, filename);

    await extractFrameAtTimestamp(videoPath, timestamp, framePath);

    frames.push({
      path: framePath,
      timestamp,
      index: i,
    });
  }

  return frames;
}
