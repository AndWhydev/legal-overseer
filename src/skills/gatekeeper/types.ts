/**
 * Gatekeeper Skill Type Definitions
 *
 * Types for multi-modal content QA including video frame analysis,
 * audio level detection, and brand compliance checking.
 */

/**
 * Media file metadata extracted via FFprobe
 */
export interface MediaMetadata {
  /** Duration in seconds */
  duration: number;
  /** Video width in pixels */
  width: number;
  /** Video height in pixels */
  height: number;
  /** Frames per second */
  fps: number;
  /** Whether the media has an audio stream */
  hasAudio: boolean;
  /** Video codec name (e.g., 'h264', 'vp9') */
  videoCodec: string;
  /** Audio codec name if present (e.g., 'aac', 'mp3') */
  audioCodec: string | null;
  /** Overall bitrate in bits per second */
  bitrate: number;
}

/**
 * Audio level analysis from FFmpeg volumedetect filter
 */
export interface AudioLevels {
  /** Mean volume in dB (typically -20 to -10 for good audio) */
  meanVolumeDb: number;
  /** Maximum peak volume in dB (should be below 0 to avoid clipping) */
  maxVolumeDb: number;
}

/**
 * Technical validation result for a single aspect
 */
export interface ValidationResult {
  /** Whether this check passed */
  pass: boolean;
  /** Actual value found */
  actual: string | number;
  /** Required/target value from style guide */
  required: string | number;
}

/**
 * Aggregate technical validation results
 */
export interface TechnicalValidation {
  /** Resolution validation (e.g., min 1080p) */
  resolution: ValidationResult;
  /** Frame rate validation (e.g., min 30fps) */
  fps: ValidationResult;
  /** Audio level validation (e.g., target -14 LUFS) */
  audioLevels: ValidationResult & { target: number };
  /** Format validation (e.g., mp4, mov, webm) */
  format: ValidationResult & { allowed: string[] };
}

/**
 * Visual brand compliance analysis from Claude Vision
 */
export interface VisualAnalysis {
  /** List of brand guideline violations or concerns */
  issues: string[];
  /** Overall visual compliance score (0-100) */
  complianceScore: number;
  /** Whether brand logo was detected */
  logoDetected: boolean;
  /** Whether colors match brand palette */
  colorCompliance: boolean;
  /** Whether fonts match brand typography */
  fontCompliance: boolean;
}

/**
 * Recommendation for content routing
 */
export type QARecommendation = 'approve' | 'flag_for_review' | 'return_to_creator';

/**
 * Complete QA result combining all analysis passes
 */
export interface QAResult {
  /** Technical validation results (Pass 1) */
  technical: TechnicalValidation;
  /** Visual brand compliance results (Pass 2) */
  visual: VisualAnalysis | null;
  /** Aggregate quality score (0-100) */
  overallScore: number;
  /** Routing recommendation based on score and issues */
  recommendation: QARecommendation;
  /** Combined list of all issues found */
  issues: string[];
}
