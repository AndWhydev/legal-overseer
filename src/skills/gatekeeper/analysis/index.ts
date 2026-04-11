/**
 * Content Analysis Module
 *
 * Multi-pass QA analysis for brand compliance and quality.
 * Combines technical validation with Claude Vision visual analysis.
 *
 * Submodules:
 * - technical.ts - Resolution, format, audio level validation against style guide
 * - constants.ts - Allowed formats and fallback thresholds
 * - visual.ts    - Claude Vision brand compliance analysis
 * - vision.ts    - Claude Vision API wrapper for frame analysis
 * - prompts.ts   - Prompt builder for brand compliance checks
 * - scoring.ts   - Aggregate scoring and routing (future: 07-07+)
 */

// Technical validation (Pass 1)
export {
  validateTechnical,
  type TechnicalQAResult,
  type ValidationCheck,
} from './technical.js';

// Validation constants
export * from './constants.js';

// Visual brand compliance analysis (Pass 2)
export { analyzeVisualCompliance } from './visual.js';

// Vision API wrapper and types
export { analyzeFrameWithVision, analyzeMultipleFrames, type FrameAnalysis } from './vision.js';

// Prompt builder for brand compliance
export { buildBrandCompliancePrompt } from './prompts.js';

// Scoring and routing (Pass 3)
export {
  calculateOverallScore,
  determineRecommendation,
  buildQAResult,
  DEFAULT_WEIGHTS,
  RETURN_THRESHOLD,
  FLAG_THRESHOLD,
  type ScoringWeights,
} from './scoring.js';
