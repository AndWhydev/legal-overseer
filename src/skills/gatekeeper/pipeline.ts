/**
 * QA Pipeline Orchestration Module
 *
 * Complete multi-pass QA pipeline for content validation:
 * 1. File validation (magic bytes)
 * 2. Metadata extraction (FFprobe)
 * 3. Audio analysis (if audio present)
 * 4. Technical validation against style guide
 * 5. Visual analysis (Claude Vision) - skippable on critical failures
 * 6. Scoring and routing recommendation
 *
 * Implements fail-fast pattern: critical technical issues skip expensive
 * Vision API calls when skipVisual option is enabled.
 */

import {
  validateMediaFile,
  probeMedia,
  analyzeAudioLevels,
  hasAudioStream,
} from './media/index.js';
import { validateTechnical } from './analysis/technical.js';
import { analyzeVisualCompliance } from './analysis/visual.js';
import { buildQAResult, type ScoringWeights, DEFAULT_WEIGHTS } from './analysis/scoring.js';
import type { QAResult, MediaMetadata, AudioLevels, VisualAnalysis } from './types.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Gatekeeper');

/**
 * Pipeline configuration options
 */
export interface PipelineOptions {
  /** Number of frames to extract for visual analysis (default: 3) */
  frameCount?: number;
  /** Skip visual analysis if critical technical issues found (default: true) */
  skipVisual?: boolean;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
  /** Custom scoring weights (default: 40% technical, 60% visual) */
  weights?: ScoringWeights;
}

/**
 * Default pipeline options
 */
const DEFAULT_OPTIONS: Required<PipelineOptions> = {
  frameCount: 3,
  skipVisual: true,
  verbose: false,
  weights: DEFAULT_WEIGHTS,
};

/**
 * Log a pipeline step with timestamp
 */
function logStep(step: string, message: string, verbose: boolean): void {
  if (verbose) {
    logger.info(`[Pipeline:${step}] ${message}`);
  }
}

/**
 * Build a failed QA result for early exit scenarios
 */
function buildFailedResult(error: string): QAResult {
  return {
    technical: {
      resolution: { pass: false, actual: 'unknown', required: 'unknown' },
      fps: { pass: false, actual: 0, required: 0 },
      audioLevels: { pass: false, actual: 'unknown', required: 'unknown', target: -14 },
      format: { pass: false, actual: 'unknown', required: 'unknown', allowed: [] },
    },
    visual: null,
    overallScore: 0,
    recommendation: 'return_to_creator',
    issues: [`[CRITICAL] ${error}`],
  };
}

/**
 * Run the complete QA pipeline on a media file.
 *
 * Pipeline steps:
 * 1. Validate file type using magic bytes
 * 2. Extract metadata with FFprobe
 * 3. Analyze audio levels (if audio stream present)
 * 4. Run technical validation against style guide
 * 5. Run visual analysis with Claude Vision (unless skipped)
 * 6. Build final QA result with score and recommendation
 *
 * @param mediaPath - Absolute path to the media file
 * @param options - Pipeline configuration options
 * @returns Promise resolving to complete QAResult
 *
 * @example
 * ```typescript
 * // Full pipeline with default options
 * const result = await runQAPipeline('/path/to/video.mp4');
 * console.log(`Score: ${result.overallScore}`);
 * console.log(`Recommendation: ${result.recommendation}`);
 *
 * // Skip visual on critical failures
 * const fastResult = await runQAPipeline('/path/to/video.mp4', {
 *   skipVisual: true,
 *   verbose: true,
 * });
 * ```
 */
export async function runQAPipeline(
  mediaPath: string,
  options?: PipelineOptions
): Promise<QAResult> {
  const opts: Required<PipelineOptions> = { ...DEFAULT_OPTIONS, ...options };
  const { frameCount, skipVisual, verbose, weights } = opts;

  const startTime = Date.now();
  logStep('START', `Processing: ${mediaPath}`, verbose);

  // Step 1: Validate file type (magic bytes)
  logStep('1-VALIDATE', 'Checking file type...', verbose);
  try {
    const validation = await validateMediaFile(mediaPath);
    if (!validation.valid) {
      const error = `Invalid file type: ${validation.error || 'Unknown format'}`;
      logStep('1-VALIDATE', `FAIL: ${error}`, verbose);
      return buildFailedResult(error);
    }
    logStep('1-VALIDATE', `OK: ${validation.mimeType}`, verbose);
  } catch (err) {
    const error = `File validation error: ${err instanceof Error ? err.message : String(err)}`;
    logStep('1-VALIDATE', `ERROR: ${error}`, verbose);
    return buildFailedResult(error);
  }

  // Step 2: Probe metadata (FFprobe)
  logStep('2-PROBE', 'Extracting metadata...', verbose);
  let metadata: MediaMetadata;
  try {
    metadata = await probeMedia(mediaPath);
    logStep(
      '2-PROBE',
      `OK: ${metadata.width}x${metadata.height}, ${metadata.fps}fps, ${metadata.duration}s`,
      verbose
    );
  } catch (err) {
    const error = `Metadata extraction failed: ${err instanceof Error ? err.message : String(err)}`;
    logStep('2-PROBE', `ERROR: ${error}`, verbose);
    return buildFailedResult(error);
  }

  // Step 3: Analyze audio (if present)
  logStep('3-AUDIO', 'Checking for audio stream...', verbose);
  let audioLevels: AudioLevels | null = null;
  try {
    const hasAudio = await hasAudioStream(mediaPath);
    if (hasAudio) {
      logStep('3-AUDIO', 'Audio stream found, analyzing levels...', verbose);
      audioLevels = await analyzeAudioLevels(mediaPath);
      if (audioLevels) {
        logStep(
          '3-AUDIO',
          `OK: mean=${audioLevels.meanVolumeDb}dB, max=${audioLevels.maxVolumeDb}dB`,
          verbose
        );
      } else {
        logStep('3-AUDIO', 'WARN: Audio analysis returned null', verbose);
      }
    } else {
      logStep('3-AUDIO', 'No audio stream detected', verbose);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logStep('3-AUDIO', `WARN: Audio analysis failed: ${error}`, verbose);
    // Non-critical - continue without audio analysis
  }

  // Step 4: Technical validation
  logStep('4-TECHNICAL', 'Running technical validation...', verbose);
  const technicalResult = validateTechnical(metadata, audioLevels);
  logStep(
    '4-TECHNICAL',
    `OK: critical=${technicalResult.criticalIssues.length}, warnings=${technicalResult.warningIssues.length}`,
    verbose
  );

  // Check for early exit on critical issues
  if (skipVisual && !technicalResult.passesMinimum) {
    logStep(
      '5-VISUAL',
      `SKIP: ${technicalResult.criticalIssues.length} critical issues found`,
      verbose
    );
    const elapsed = Date.now() - startTime;
    logStep('END', `Completed in ${elapsed}ms (technical-only)`, verbose);
    return buildQAResult(technicalResult, null, weights);
  }

  // Step 5: Visual analysis (Claude Vision)
  logStep('5-VISUAL', `Analyzing ${frameCount} frames with Vision API...`, verbose);
  let visualResult: VisualAnalysis | null = null;
  try {
    visualResult = await analyzeVisualCompliance(mediaPath, frameCount);
    logStep(
      '5-VISUAL',
      `OK: score=${visualResult.complianceScore}, issues=${visualResult.issues.length}`,
      verbose
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logStep('5-VISUAL', `ERROR: ${error}`, verbose);
    // Visual analysis failure is non-fatal - continue with technical-only result
  }

  // Step 6: Build final result
  logStep('6-SCORE', 'Building final QA result...', verbose);
  const result = buildQAResult(technicalResult, visualResult, weights);
  logStep(
    '6-SCORE',
    `OK: score=${result.overallScore}, recommendation=${result.recommendation}`,
    verbose
  );

  const elapsed = Date.now() - startTime;
  logStep('END', `Completed in ${elapsed}ms`, verbose);

  return result;
}
