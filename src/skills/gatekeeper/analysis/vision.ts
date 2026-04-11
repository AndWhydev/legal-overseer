/**
 * Claude Vision API Wrapper Module
 *
 * Sends video frames to Claude Vision for brand compliance analysis.
 * Uses structured prompts from style guide rules to check for:
 * - Logo presence and positioning
 * - Brand color compliance
 * - Typography compliance
 * - Prohibited elements
 *
 * Model: claude-sonnet-4-5 for cost-effective vision analysis
 * Returns structured JSON responses for aggregation.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  getLogoRules,
  getColorRules,
  getTypographyRules,
} from '../../../db/repositories/styleGuide.js';
import { buildBrandCompliancePrompt } from './prompts.js';
import { createSafeLogger } from '../../../governance/index.js';

const logger = createSafeLogger('Gatekeeper');

const anthropic = new Anthropic();

/**
 * Analysis result for a single video frame
 */
export interface FrameAnalysis {
  /** Frame index in extraction order (0-based) */
  frameIndex: number;
  /** Whether brand logo was detected in the frame */
  logoDetected: boolean;
  /** Detected logo position (e.g., 'top-right', 'bottom-center') */
  logoPosition: string | null;
  /** Whether logo size meets minimum requirements */
  logoSizeOk: boolean;
  /** Color compliance score 0-100 */
  colorCompliance: number;
  /** Hex colors detected in the frame */
  colorsFound: string[];
  /** Font compliance score 0-100 */
  fontCompliance: number;
  /** Font names detected in the frame */
  fontsDetected: string[];
  /** List of prohibited elements detected */
  prohibitedElements: string[];
  /** List of specific issues found */
  issues: string[];
  /** Overall confidence in the analysis (0-100) */
  confidenceScore: number;
}

/**
 * Default/fallback frame analysis when Vision API fails
 */
function getDefaultAnalysis(frameIndex: number, error?: string): FrameAnalysis {
  return {
    frameIndex,
    logoDetected: false,
    logoPosition: null,
    logoSizeOk: false,
    colorCompliance: 0,
    colorsFound: [],
    fontCompliance: 0,
    fontsDetected: [],
    prohibitedElements: [],
    issues: error ? [`Vision analysis failed: ${error}`] : ['Vision analysis incomplete'],
    confidenceScore: 0,
  };
}

/**
 * Parse Claude's JSON response into FrameAnalysis
 */
function parseVisionResponse(
  responseText: string,
  frameIndex: number
): FrameAnalysis {
  try {
    // Extract JSON from response (may have surrounding text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return getDefaultAnalysis(frameIndex, 'No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      frameIndex,
      logoDetected: Boolean(parsed.logoDetected),
      logoPosition: parsed.logoPosition || null,
      logoSizeOk: Boolean(parsed.logoSizeOk),
      colorCompliance: Math.min(100, Math.max(0, Number(parsed.colorCompliance) || 0)),
      colorsFound: Array.isArray(parsed.colorsFound) ? parsed.colorsFound : [],
      fontCompliance: Math.min(100, Math.max(0, Number(parsed.fontCompliance) || 0)),
      fontsDetected: Array.isArray(parsed.fontsDetected) ? parsed.fontsDetected : [],
      prohibitedElements: Array.isArray(parsed.prohibitedElements) ? parsed.prohibitedElements : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      confidenceScore: Math.min(100, Math.max(0, Number(parsed.confidenceScore) || 50)),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return getDefaultAnalysis(frameIndex, `JSON parse error: ${message}`);
  }
}

/**
 * Analyze a single video frame for brand compliance using Claude Vision.
 *
 * Fetches style guide rules and builds a structured prompt for analysis.
 * Sends the frame as base64 JPEG to Claude claude-sonnet-4-5 for cost efficiency.
 *
 * @param frameBuffer - JPEG image buffer (pre-resized for optimal tokens)
 * @param frameIndex - Frame index in extraction order (0-based)
 * @returns Promise resolving to FrameAnalysis with compliance details
 *
 * @example
 * ```typescript
 * const buffer = await resizeForVision('/tmp/frame.jpg');
 * const analysis = await analyzeFrameWithVision(buffer, 0);
 * console.log(`Logo detected: ${analysis.logoDetected}`);
 * console.log(`Color compliance: ${analysis.colorCompliance}%`);
 * ```
 */
export async function analyzeFrameWithVision(
  frameBuffer: Buffer,
  frameIndex: number
): Promise<FrameAnalysis> {
  try {
    // Fetch style guide rules for brand compliance
    const logoRules = getLogoRules();
    const colorRules = getColorRules();
    const typographyRules = getTypographyRules();

    // Build structured prompt with brand requirements
    const prompt = buildBrandCompliancePrompt(logoRules, colorRules, typographyRules);

    // Convert frame to base64
    const base64Image = frameBuffer.toString('base64');

    // Send to Claude Vision
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    // Extract text response
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return getDefaultAnalysis(frameIndex, 'No text response from Vision API');
    }

    // Parse JSON response
    return parseVisionResponse(textBlock.text, frameIndex);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Vision] Frame ${frameIndex} analysis failed: ${message}`);
    return getDefaultAnalysis(frameIndex, message);
  }
}

/**
 * Analyze multiple video frames for brand compliance.
 *
 * Processes frames sequentially to avoid rate limiting.
 * Returns array of FrameAnalysis in the same order as input.
 *
 * @param frameBuffers - Array of JPEG image buffers (pre-resized)
 * @returns Promise resolving to array of FrameAnalysis results
 *
 * @example
 * ```typescript
 * const frames = await extractKeyFrames('/path/to/video.mp4');
 * const buffers = await Promise.all(
 *   frames.map(f => resizeForVision(f.path))
 * );
 * const analyses = await analyzeMultipleFrames(buffers);
 * console.log(`Analyzed ${analyses.length} frames`);
 * ```
 */
export async function analyzeMultipleFrames(
  frameBuffers: Buffer[]
): Promise<FrameAnalysis[]> {
  const results: FrameAnalysis[] = [];

  for (let i = 0; i < frameBuffers.length; i++) {
    const analysis = await analyzeFrameWithVision(frameBuffers[i], i);
    results.push(analysis);
  }

  return results;
}
