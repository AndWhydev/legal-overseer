/**
 * Format Validation Constants
 *
 * Defines allowed formats and validation thresholds for technical QA.
 * These are used as validation constraints and fallback values when
 * style guide rules are missing.
 */

/**
 * Allowed video codecs for content submission
 * h264 (AVC) - Universal compatibility
 * hevc (H.265) - Modern, efficient, wide support
 * vp9 - Google/YouTube preferred
 * av1 - Next-gen, best compression
 */
export const ALLOWED_VIDEO_CODECS = ['h264', 'hevc', 'vp9', 'av1'];

/**
 * Allowed audio codecs for content submission
 * aac - Universal standard for video
 * mp3 - Legacy but widely supported
 * opus - Modern, efficient, WebM preferred
 * flac - Lossless for archival
 */
export const ALLOWED_AUDIO_CODECS = ['aac', 'mp3', 'opus', 'flac'];

/**
 * Allowed container formats for content submission
 * mp4 - Universal compatibility
 * mov - Apple/Final Cut preferred
 * webm - Web/YouTube preferred
 * mkv - Professional/archival
 */
export const ALLOWED_CONTAINERS = ['mp4', 'mov', 'webm', 'mkv'];

/**
 * Audio tolerance in dB for style guide comparison
 * Allows 2dB variance below the target LUFS to account for
 * measurement differences between tools
 */
export const AUDIO_TOLERANCE_DB = 2;

/**
 * Fallback minimum video height (pixels) if style guide missing
 * 720p is minimum acceptable for modern content
 */
export const FALLBACK_MIN_HEIGHT = 720;

/**
 * Fallback minimum frame rate if style guide missing
 * 24fps is cinematic standard, acceptable for most content
 */
export const FALLBACK_MIN_FPS = 24;

/**
 * Fallback integrated LUFS target if style guide missing
 * -16 LUFS is a common streaming platform target
 * (Spotify, YouTube use similar levels)
 */
export const FALLBACK_INTEGRATED_LUFS = -16;
