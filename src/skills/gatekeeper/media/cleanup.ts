/**
 * Frame Cleanup Utility
 *
 * Deletes temporary frame files extracted during video analysis.
 * Prevents memory/disk leaks from accumulated temp files.
 *
 * Errors are silently ignored since files may already be deleted
 * or cleaned up by system temp file purging.
 *
 * Usage:
 * - Always call cleanupFrames() in a finally block after Vision analysis
 * - Pass the array of frame paths from extractKeyFrames()
 */

import fs from 'fs/promises';

/**
 * Delete temporary frame files.
 *
 * Silently ignores errors (file may not exist or already be deleted).
 * Call this in a finally block to ensure cleanup after Vision analysis.
 *
 * @param framePaths - Array of file paths to delete
 *
 * @example
 * ```typescript
 * const frames = await extractKeyFrames('/path/to/video.mp4');
 * try {
 *   // Analyze frames with Vision API...
 * } finally {
 *   await cleanupFrames(frames.map(f => f.path));
 * }
 * ```
 */
export async function cleanupFrames(framePaths: string[]): Promise<void> {
  for (const framePath of framePaths) {
    try {
      await fs.unlink(framePath);
    } catch {
      // Ignore - file may already be deleted or not exist
    }
  }
}
