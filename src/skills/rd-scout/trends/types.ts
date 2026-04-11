/**
 * SEO Trend Analysis Types
 *
 * Type definitions for trend spike detection, confidence scoring,
 * and trend analysis configuration.
 */

import type { MonthlySearchVolume } from '../../../integrations/dataforseo/types.js';

/**
 * Confidence level for trend analysis
 *
 * Based on volume thresholds and percentage change.
 */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Result of analyzing a single keyword's trend
 */
export interface TrendAnalysis {
  /** The keyword being analyzed */
  keyword: string;

  /** Most recent monthly search volume */
  currentVolume: number;

  /** Baseline volume (average of lookback period) */
  previousVolume: number;

  /** Percentage change from baseline to current */
  percentageChange: number;

  /** Whether a significant spike was detected */
  spikeDetected: boolean;

  /** Confidence level of the spike detection */
  confidence: ConfidenceLevel;

  /** Confidence score (0-100) */
  confidenceScore: number;

  /** Raw monthly search data used for analysis */
  monthlyData: MonthlySearchVolume[];

  /** Reason for the confidence score */
  confidenceReason: string;
}

/**
 * Configuration for trend spike detection
 */
export interface TrendConfig {
  /**
   * Percentage increase threshold to trigger spike detection
   * Default: 50 (50% increase)
   */
  spikeThreshold: number;

  /**
   * Minimum search volume to consider for spike detection
   * Filters out low-volume keywords with noisy data
   * Default: 1000
   */
  minVolume: number;

  /**
   * Number of months to use as baseline for comparison
   * The baseline excludes the most recent month
   * Default: 3 (compare current vs avg of months 2-4)
   */
  lookbackMonths: number;
}

/**
 * Result of spike detection calculation
 */
export interface SpikeDetectionResult {
  /** Whether a spike was detected based on threshold */
  spikeDetected: boolean;

  /** Percentage change from baseline */
  percentageChange: number;

  /** Current (most recent) volume */
  currentVolume: number;

  /** Baseline volume (average of lookback period) */
  baselineVolume: number;
}

/**
 * Confidence scoring thresholds
 *
 * Defines the criteria for HIGH, MEDIUM, and LOW confidence.
 */
export interface ConfidenceThresholds {
  /** High confidence: volume > this AND change > highChangeThreshold */
  highVolumeThreshold: number;

  /** High confidence: requires this percentage change */
  highChangeThreshold: number;

  /** Medium confidence: volume > this AND change > mediumChangeThreshold */
  mediumVolumeThreshold: number;

  /** Medium confidence: requires this percentage change */
  mediumChangeThreshold: number;

  /** Low confidence: volume > minVolume AND change > lowChangeThreshold */
  lowChangeThreshold: number;
}

/**
 * Default confidence scoring thresholds
 *
 * Based on the plan specification:
 * - High (>80%): Volume > 5000, change > 100%
 * - Medium (50-80%): Volume > 2000, change > 50%
 * - Low (<50%): Volume > 1000, change > 25%
 */
export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  highVolumeThreshold: 5000,
  highChangeThreshold: 100,
  mediumVolumeThreshold: 2000,
  mediumChangeThreshold: 50,
  lowChangeThreshold: 25,
};

/**
 * Default trend analysis configuration
 */
export const DEFAULT_TREND_CONFIG: TrendConfig = {
  spikeThreshold: 50,
  minVolume: 1000,
  lookbackMonths: 3,
};
