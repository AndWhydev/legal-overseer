/**
 * Media Processing Module
 *
 * FFmpeg-based utilities for video/audio analysis.
 * Used by Gatekeeper skill for technical content validation.
 *
 * Submodules:
 * - validate.ts - File type validation using magic bytes
 * - probe.ts    - FFprobe metadata extraction (duration, resolution, codecs)
 * - frames.ts   - Key frame extraction for Vision API analysis
 * - resize.ts   - Image resize for Vision API token optimization
 * - cleanup.ts  - Temp file cleanup utility
 * - audio.ts    - Audio level analysis (volumedetect, LUFS) (planned)
 */

// File type validation
export {
  validateMediaFile,
  type FileValidation,
  ALLOWED_VIDEO_MIMES,
  ALLOWED_IMAGE_MIMES,
} from './validate.js';

// FFprobe metadata extraction
export { probeMedia } from './probe.js';

// Frame extraction for Vision API
export { extractKeyFrames, type ExtractedFrame } from './frames.js';

// Image resize for Vision API token optimization
export { resizeForVision, resizeForVisionToFile } from './resize.js';

// Temp file cleanup
export { cleanupFrames } from './cleanup.js';

// Audio level analysis
export { analyzeAudioLevels, hasAudioStream } from './audio.js';
