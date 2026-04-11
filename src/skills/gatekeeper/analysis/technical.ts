/**
 * Technical QA Validation Module
 *
 * Validates media files against style guide technical requirements.
 * This is Pass 1 of the multi-pass QA pipeline - fast, local validation
 * before expensive Vision API calls.
 *
 * Checks:
 * - Resolution (height >= min_height from style guide)
 * - Frame rate (fps >= min_fps from style guide)
 * - Audio levels (meanVolumeDb >= integrated_lufs - tolerance)
 * - Video/audio format (codec in allowed list)
 *
 * Fail-fast pattern: Critical issues block further processing.
 */

import type { MediaMetadata, AudioLevels } from '../types.js';
import { getTechnicalRules, type StyleGuideRule } from '../../../db/repositories/styleGuide.js';
import {
  ALLOWED_VIDEO_CODECS,
  ALLOWED_AUDIO_CODECS,
  AUDIO_TOLERANCE_DB,
  FALLBACK_MIN_HEIGHT,
  FALLBACK_MIN_FPS,
  FALLBACK_INTEGRATED_LUFS,
} from './constants.js';

/**
 * Result of a single validation check
 */
export interface ValidationCheck {
  /** Whether this check passed */
  pass: boolean;
  /** Actual value found in media */
  actual: string | number;
  /** Required value from style guide */
  required: string | number;
  /** Severity level for failures */
  severity: 'critical' | 'warning' | 'info';
}

/**
 * Complete technical QA validation result
 */
export interface TechnicalQAResult {
  /** Resolution validation (height check) */
  resolution: ValidationCheck;
  /** Frame rate validation */
  fps: ValidationCheck;
  /** Audio level validation against LUFS target */
  audioLevels: ValidationCheck;
  /** Video codec format validation */
  format: ValidationCheck;
  /** List of critical issues that block approval */
  criticalIssues: string[];
  /** List of warning issues that may need review */
  warningIssues: string[];
  /** True if no critical failures - content can proceed to visual analysis */
  passesMinimum: boolean;
}

/**
 * Parse JSON rule value with fallback
 */
function parseRuleValue<T>(rule: StyleGuideRule | undefined, fallback: T): T {
  if (!rule) return fallback;
  try {
    return JSON.parse(rule.ruleValue) as T;
  } catch {
    return fallback;
  }
}

/**
 * Validate media file against technical style guide requirements.
 *
 * Implements Pass 1 of the QA pipeline - fast, local validation.
 * Call this before extracting frames or running Vision analysis
 * to fail fast on obvious issues.
 *
 * @param metadata - Media metadata from probeMedia()
 * @param audioLevels - Audio analysis from analyzeAudioLevels(), or null if no audio
 * @returns TechnicalQAResult with pass/fail for each check and issue lists
 *
 * @example
 * ```typescript
 * const metadata = await probeMedia('/path/to/video.mp4');
 * const audio = await analyzeAudioLevels('/path/to/video.mp4');
 * const result = validateTechnical(metadata, audio);
 *
 * if (!result.passesMinimum) {
 *   console.log('Critical issues:', result.criticalIssues);
 *   // Return to creator - don't waste Vision API calls
 * } else {
 *   // Proceed to Pass 2 (visual analysis)
 * }
 * ```
 */
export function validateTechnical(
  metadata: MediaMetadata,
  audioLevels: AudioLevels | null
): TechnicalQAResult {
  // Fetch technical rules from style guide
  const rules = getTechnicalRules();

  // Find specific rules by name
  const videoRule = rules.find((r) => r.ruleName === 'video_resolution');
  const audioRule = rules.find((r) => r.ruleName === 'audio_levels');

  // Parse rule values with fallbacks
  const videoSpec = parseRuleValue<{ min_height: number; min_fps: number }>(
    videoRule,
    { min_height: FALLBACK_MIN_HEIGHT, min_fps: FALLBACK_MIN_FPS }
  );

  const audioSpec = parseRuleValue<{ integrated_lufs: number; true_peak_db?: number }>(
    audioRule,
    { integrated_lufs: FALLBACK_INTEGRATED_LUFS }
  );

  // Track issues by severity
  const criticalIssues: string[] = [];
  const warningIssues: string[] = [];

  // Resolution check (critical)
  const resolutionPass = metadata.height >= videoSpec.min_height;
  const resolution: ValidationCheck = {
    pass: resolutionPass,
    actual: `${metadata.width}x${metadata.height}`,
    required: `min ${videoSpec.min_height}p`,
    severity: 'critical',
  };
  if (!resolutionPass) {
    criticalIssues.push(
      `Resolution too low: ${metadata.height}p (minimum: ${videoSpec.min_height}p)`
    );
  }

  // FPS check (critical)
  const fpsPass = metadata.fps >= videoSpec.min_fps;
  const fps: ValidationCheck = {
    pass: fpsPass,
    actual: Math.round(metadata.fps * 100) / 100,
    required: videoSpec.min_fps,
    severity: 'critical',
  };
  if (!fpsPass) {
    criticalIssues.push(
      `Frame rate too low: ${fps.actual}fps (minimum: ${videoSpec.min_fps}fps)`
    );
  }

  // Audio levels check (warning if audio exists, info if no audio)
  let audioCheck: ValidationCheck;
  if (audioLevels) {
    // Allow 2dB tolerance below target LUFS
    const targetWithTolerance = audioSpec.integrated_lufs - AUDIO_TOLERANCE_DB;
    const audioPass = audioLevels.meanVolumeDb >= targetWithTolerance;
    audioCheck = {
      pass: audioPass,
      actual: Math.round(audioLevels.meanVolumeDb * 10) / 10,
      required: `>= ${audioSpec.integrated_lufs} LUFS (${AUDIO_TOLERANCE_DB}dB tolerance)`,
      severity: 'warning',
    };
    if (!audioPass) {
      warningIssues.push(
        `Audio levels low: ${audioCheck.actual}dB (target: ${audioSpec.integrated_lufs} LUFS)`
      );
    }
  } else {
    // No audio stream - informational, not a failure
    audioCheck = {
      pass: true,
      actual: 'no audio',
      required: `>= ${audioSpec.integrated_lufs} LUFS`,
      severity: 'info',
    };
  }

  // Format check (video codec - critical)
  const codecLower = metadata.videoCodec.toLowerCase();
  const formatPass = ALLOWED_VIDEO_CODECS.includes(codecLower);
  const format: ValidationCheck = {
    pass: formatPass,
    actual: metadata.videoCodec,
    required: ALLOWED_VIDEO_CODECS.join(', '),
    severity: 'critical',
  };
  if (!formatPass) {
    criticalIssues.push(
      `Unsupported video codec: ${metadata.videoCodec} (allowed: ${ALLOWED_VIDEO_CODECS.join(', ')})`
    );
  }

  // Audio codec check (warning if present and not allowed)
  if (metadata.audioCodec) {
    const audioCodecLower = metadata.audioCodec.toLowerCase();
    if (!ALLOWED_AUDIO_CODECS.includes(audioCodecLower)) {
      warningIssues.push(
        `Non-standard audio codec: ${metadata.audioCodec} (preferred: ${ALLOWED_AUDIO_CODECS.join(', ')})`
      );
    }
  }

  // passesMinimum = no critical issues
  const passesMinimum = criticalIssues.length === 0;

  return {
    resolution,
    fps,
    audioLevels: audioCheck,
    format,
    criticalIssues,
    warningIssues,
    passesMinimum,
  };
}
