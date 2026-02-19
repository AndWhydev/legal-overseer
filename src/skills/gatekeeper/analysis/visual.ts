/**
 * Aggregated Visual Analysis Module
 *
 * Coordinates the complete visual compliance analysis workflow:
 * 1. Extract key frames from video
 * 2. Resize frames for Vision API token optimization
 * 3. Analyze each frame with Claude Vision
 * 4. Aggregate results into single VisualAnalysis
 * 5. Clean up temporary frame files
 *
 * This is Pass 2 of the QA pipeline - runs after technical validation passes.
 */

import type { VisualAnalysis } from '../types.js';
import { analyzeMultipleFrames, type FrameAnalysis } from './vision.js';
import { resizeForVision } from '../media/resize.js';
import { extractKeyFrames } from '../media/index.js';
import { cleanupFrames } from '../media/cleanup.js';
import { createSafeLogger } from '../../../governance/index.js';

const logger = createSafeLogger('Gatekeeper');

/**
 * Aggregate multiple frame analyses into a single VisualAnalysis result.
 *
 * Aggregation logic:
 * - logoDetected: true if ANY frame has logo detected
 * - colorCompliance: average across all frames
 * - fontCompliance: average across all frames
 * - issues: deduplicated union of all frame issues
 * - complianceScore: weighted average of color (40%) + font (30%) + logo (30%)
 */
function aggregateFrameAnalyses(analyses: FrameAnalysis[]): VisualAnalysis {
  if (analyses.length === 0) {
    return {
      issues: ['No frames analyzed'],
      complianceScore: 0,
      logoDetected: false,
      colorCompliance: false,
      fontCompliance: false,
    };
  }

  // Logo detected in ANY frame
  const logoDetected = analyses.some((a) => a.logoDetected);

  // Calculate averages for compliance scores
  const avgColorCompliance =
    analyses.reduce((sum, a) => sum + a.colorCompliance, 0) / analyses.length;
  const avgFontCompliance =
    analyses.reduce((sum, a) => sum + a.fontCompliance, 0) / analyses.length;

  // Weighted average for overall compliance
  // 40% color, 30% font, 30% logo presence
  const logoScore = logoDetected ? 100 : 0;
  const complianceScore = Math.round(
    avgColorCompliance * 0.4 + avgFontCompliance * 0.3 + logoScore * 0.3
  );

  // Collect and deduplicate all issues
  const allIssues = new Set<string>();
  for (const analysis of analyses) {
    for (const issue of analysis.issues) {
      allIssues.add(issue);
    }
    // Add prohibited elements as issues
    for (const element of analysis.prohibitedElements) {
      allIssues.add(`Prohibited element detected: ${element}`);
    }
  }

  // Threshold for compliance booleans (70% = passing)
  const COMPLIANCE_THRESHOLD = 70;

  return {
    issues: Array.from(allIssues),
    complianceScore,
    logoDetected,
    colorCompliance: avgColorCompliance >= COMPLIANCE_THRESHOLD,
    fontCompliance: avgFontCompliance >= COMPLIANCE_THRESHOLD,
  };
}

/**
 * Analyze a video for visual brand compliance.
 *
 * Complete workflow:
 * 1. Extract key frames at representative timestamps
 * 2. Resize each frame for optimal Vision API token usage
 * 3. Send frames to Claude Vision for brand analysis
 * 4. Aggregate results into VisualAnalysis
 * 5. Clean up temporary frame files
 *
 * @param videoPath - Path to the video file to analyze
 * @param frameCount - Number of frames to extract (default: 3)
 * @returns Promise resolving to aggregated VisualAnalysis
 *
 * @example
 * ```typescript
 * // After technical validation passes
 * if (technicalResult.passesMinimum) {
 *   const visual = await analyzeVisualCompliance('/path/to/video.mp4');
 *   console.log(`Logo detected: ${visual.logoDetected}`);
 *   console.log(`Compliance score: ${visual.complianceScore}%`);
 *   console.log('Issues:', visual.issues);
 * }
 * ```
 */
export async function analyzeVisualCompliance(
  videoPath: string,
  frameCount: number = 3
): Promise<VisualAnalysis> {
  let framePaths: string[] = [];

  try {
    // Step 1: Extract key frames
    logger.info(`[Visual] Extracting ${frameCount} key frames from ${videoPath}`);
    const frames = await extractKeyFrames(videoPath, undefined, frameCount);
    framePaths = frames.map((f) => f.path);
    logger.info(`[Visual] Extracted ${frames.length} frames`);

    // Step 2: Resize frames for Vision API
    logger.info('[Visual] Resizing frames for Vision API');
    const resizedBuffers: Buffer[] = [];
    for (const frame of frames) {
      const buffer = await resizeForVision(frame.path);
      resizedBuffers.push(buffer);
    }
    logger.info(`[Visual] Resized ${resizedBuffers.length} frames`);

    // Step 3: Analyze with Claude Vision
    logger.info('[Visual] Analyzing frames with Claude Vision');
    const frameAnalyses = await analyzeMultipleFrames(resizedBuffers);
    logger.info(`[Visual] Analyzed ${frameAnalyses.length} frames`);

    // Step 4: Aggregate results
    const result = aggregateFrameAnalyses(frameAnalyses);
    logger.info(`[Visual] Compliance score: ${result.complianceScore}%`);

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Visual] Analysis failed: ${message}`);

    return {
      issues: [`Visual analysis failed: ${message}`],
      complianceScore: 0,
      logoDetected: false,
      colorCompliance: false,
      fontCompliance: false,
    };
  } finally {
    // Step 5: Always clean up temp frames
    if (framePaths.length > 0) {
      logger.info(`[Visual] Cleaning up ${framePaths.length} temp frames`);
      await cleanupFrames(framePaths);
    }
  }
}
