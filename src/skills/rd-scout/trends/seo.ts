/**
 * SEO Trend Spike Detection Module
 *
 * Analyzes keyword search volume trends to detect emerging opportunities
 * before they saturate. Uses DataForSEO monthly search data to identify
 * significant volume increases (spikes) with confidence scoring.
 *
 * Spike detection logic:
 * 1. Get last N months of search volume (default: 3)
 * 2. Calculate baseline as average of months 2-N (excluding most recent)
 * 3. Compare most recent month to baseline
 * 4. Spike = (current - baseline) / baseline > threshold
 */

import {
  getKeywordVolumes,
  isDataForSEOConfigured,
  type KeywordData,
  type MonthlySearchVolume,
} from '../../../integrations/dataforseo/index.js';

import {
  DEFAULT_TREND_CONFIG,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  type TrendAnalysis,
  type TrendConfig,
  type SpikeDetectionResult,
  type ConfidenceLevel,
  type ConfidenceThresholds,
} from './types.js';

/**
 * Detect if a spike occurred in search volume
 *
 * Compares the most recent month's volume against the baseline
 * (average of previous months in the lookback window).
 *
 * @param monthlySearches - Monthly search volume array (most recent first)
 * @param config - Configuration for spike detection
 * @returns Spike detection result with percentage change
 *
 * @example
 * ```typescript
 * const months = [
 *   { year: 2024, month: 3, search_volume: 3000 },
 *   { year: 2024, month: 2, search_volume: 1800 },
 *   { year: 2024, month: 1, search_volume: 2000 },
 * ];
 * const result = detectSpike(months);
 * // { spikeDetected: true, percentageChange: 57.89, ... }
 * ```
 */
export function detectSpike(
  monthlySearches: MonthlySearchVolume[],
  config: TrendConfig = DEFAULT_TREND_CONFIG
): SpikeDetectionResult {
  // Need at least lookbackMonths + 1 data points
  const requiredMonths = config.lookbackMonths + 1;

  if (monthlySearches.length < requiredMonths) {
    return {
      spikeDetected: false,
      percentageChange: 0,
      currentVolume: monthlySearches[0]?.search_volume ?? 0,
      baselineVolume: 0,
    };
  }

  // Sort by date descending (most recent first) to ensure correct order
  const sorted = [...monthlySearches].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  // Current volume is the most recent month
  const currentVolume = sorted[0].search_volume;

  // Baseline is the average of the lookback period (excluding most recent)
  const baselineMonths = sorted.slice(1, config.lookbackMonths + 1);
  const baselineVolume =
    baselineMonths.reduce((sum, m) => sum + m.search_volume, 0) /
    baselineMonths.length;

  // Avoid division by zero
  if (baselineVolume === 0) {
    return {
      spikeDetected: currentVolume >= config.minVolume,
      percentageChange: currentVolume > 0 ? 100 : 0,
      currentVolume,
      baselineVolume: 0,
    };
  }

  // Calculate percentage change
  const percentageChange =
    ((currentVolume - baselineVolume) / baselineVolume) * 100;

  // Spike detected if:
  // 1. Current volume meets minimum threshold
  // 2. Percentage change exceeds spike threshold
  const spikeDetected =
    currentVolume >= config.minVolume &&
    percentageChange >= config.spikeThreshold;

  return {
    spikeDetected,
    percentageChange: Math.round(percentageChange * 100) / 100, // Round to 2 decimals
    currentVolume,
    baselineVolume: Math.round(baselineVolume * 100) / 100,
  };
}

/**
 * Calculate confidence score and level for a detected spike
 *
 * Confidence scoring criteria:
 * - HIGH (>80): Volume > 5000 AND change > 100%
 * - MEDIUM (50-80): Volume > 2000 AND change > 50%
 * - LOW (<50): Volume > 1000 AND change > 25%
 *
 * @param currentVolume - Most recent monthly search volume
 * @param percentageChange - Percentage change from baseline
 * @param thresholds - Confidence threshold configuration
 * @returns Confidence level, score, and reasoning
 */
export function calculateConfidence(
  currentVolume: number,
  percentageChange: number,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS
): { level: ConfidenceLevel; score: number; reason: string } {
  // HIGH confidence: Volume > 5000 AND change > 100%
  if (
    currentVolume >= thresholds.highVolumeThreshold &&
    percentageChange >= thresholds.highChangeThreshold
  ) {
    // Score: 80-100 based on how much it exceeds thresholds
    const volumeBonus = Math.min(
      10,
      ((currentVolume - thresholds.highVolumeThreshold) / thresholds.highVolumeThreshold) * 10
    );
    const changeBonus = Math.min(
      10,
      ((percentageChange - thresholds.highChangeThreshold) / thresholds.highChangeThreshold) * 10
    );
    const score = Math.min(100, 80 + volumeBonus + changeBonus);

    return {
      level: 'HIGH',
      score: Math.round(score),
      reason: `High volume (${currentVolume.toLocaleString()}) with significant spike (+${percentageChange.toFixed(0)}%)`,
    };
  }

  // MEDIUM confidence: Volume > 2000 AND change > 50%
  if (
    currentVolume >= thresholds.mediumVolumeThreshold &&
    percentageChange >= thresholds.mediumChangeThreshold
  ) {
    // Score: 50-79 based on how much it exceeds thresholds
    const volumeRatio =
      (currentVolume - thresholds.mediumVolumeThreshold) /
      (thresholds.highVolumeThreshold - thresholds.mediumVolumeThreshold);
    const changeRatio =
      (percentageChange - thresholds.mediumChangeThreshold) /
      (thresholds.highChangeThreshold - thresholds.mediumChangeThreshold);
    const score = Math.min(79, 50 + volumeRatio * 15 + changeRatio * 14);

    return {
      level: 'MEDIUM',
      score: Math.round(score),
      reason: `Moderate volume (${currentVolume.toLocaleString()}) with notable spike (+${percentageChange.toFixed(0)}%)`,
    };
  }

  // LOW confidence: Volume > minVolume AND change > 25%
  if (percentageChange >= thresholds.lowChangeThreshold) {
    // Score: 20-49 based on metrics
    const volumeRatio = Math.min(
      1,
      currentVolume / thresholds.mediumVolumeThreshold
    );
    const changeRatio = Math.min(
      1,
      percentageChange / thresholds.mediumChangeThreshold
    );
    const score = Math.max(20, Math.min(49, 20 + volumeRatio * 15 + changeRatio * 14));

    return {
      level: 'LOW',
      score: Math.round(score),
      reason: `Lower volume (${currentVolume.toLocaleString()}) or smaller spike (+${percentageChange.toFixed(0)}%)`,
    };
  }

  // No significant trend
  return {
    level: 'LOW',
    score: Math.max(0, Math.min(20, percentageChange)),
    reason: `Minimal trend activity (+${percentageChange.toFixed(0)}%)`,
  };
}

/**
 * Analyze trends for a list of keywords
 *
 * Fetches keyword data from DataForSEO and analyzes each keyword
 * for trend spikes with confidence scoring.
 *
 * @param keywords - Array of keywords to analyze
 * @param config - Optional trend configuration overrides
 * @returns Promise resolving to array of TrendAnalysis results
 *
 * @example
 * ```typescript
 * const trends = await analyzeTrends(['glass skin serum', 'korean skincare']);
 * const spikes = trends.filter(t => t.spikeDetected);
 * console.log(`Found ${spikes.length} trending keywords`);
 * ```
 */
export async function analyzeTrends(
  keywords: string[],
  config: Partial<TrendConfig> = {}
): Promise<TrendAnalysis[]> {
  if (!isDataForSEOConfigured()) {
    throw new Error(
      'DataForSEO not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD environment variables.'
    );
  }

  if (keywords.length === 0) {
    return [];
  }

  const mergedConfig: TrendConfig = {
    ...DEFAULT_TREND_CONFIG,
    ...config,
  };

  // Fetch keyword data from DataForSEO
  const keywordData = await getKeywordVolumes(keywords);

  // Create a map for easy lookup
  const dataMap = new Map<string, KeywordData>();
  for (const kd of keywordData) {
    dataMap.set(kd.keyword.toLowerCase(), kd);
  }

  // Analyze each keyword
  const results: TrendAnalysis[] = [];

  for (const keyword of keywords) {
    const data = dataMap.get(keyword.toLowerCase());

    if (!data || data.monthlySearches.length === 0) {
      // No data available for this keyword
      results.push({
        keyword,
        currentVolume: 0,
        previousVolume: 0,
        percentageChange: 0,
        spikeDetected: false,
        confidence: 'LOW',
        confidenceScore: 0,
        monthlyData: [],
        confidenceReason: 'No search data available',
      });
      continue;
    }

    // Run spike detection
    const spikeResult = detectSpike(data.monthlySearches, mergedConfig);

    // Skip keywords below minimum volume threshold
    if (spikeResult.currentVolume < mergedConfig.minVolume) {
      results.push({
        keyword,
        currentVolume: spikeResult.currentVolume,
        previousVolume: spikeResult.baselineVolume,
        percentageChange: spikeResult.percentageChange,
        spikeDetected: false,
        confidence: 'LOW',
        confidenceScore: 0,
        monthlyData: data.monthlySearches,
        confidenceReason: `Volume (${spikeResult.currentVolume}) below minimum threshold (${mergedConfig.minVolume})`,
      });
      continue;
    }

    // Calculate confidence for keywords meeting volume threshold
    const confidence = calculateConfidence(
      spikeResult.currentVolume,
      spikeResult.percentageChange
    );

    results.push({
      keyword,
      currentVolume: spikeResult.currentVolume,
      previousVolume: spikeResult.baselineVolume,
      percentageChange: spikeResult.percentageChange,
      spikeDetected: spikeResult.spikeDetected,
      confidence: confidence.level,
      confidenceScore: confidence.score,
      monthlyData: data.monthlySearches,
      confidenceReason: confidence.reason,
    });
  }

  return results;
}

/**
 * Filter trend results to only include detected spikes
 *
 * @param trends - Array of TrendAnalysis results
 * @param minConfidence - Minimum confidence level to include
 * @returns Filtered array of trends with detected spikes
 */
export function filterSpikes(
  trends: TrendAnalysis[],
  minConfidence: ConfidenceLevel = 'LOW'
): TrendAnalysis[] {
  const confidenceOrder: Record<ConfidenceLevel, number> = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  const minLevel = confidenceOrder[minConfidence];

  return trends.filter(
    (t) => t.spikeDetected && confidenceOrder[t.confidence] >= minLevel
  );
}

/**
 * Sort trends by opportunity score (combination of volume and spike magnitude)
 *
 * @param trends - Array of TrendAnalysis results
 * @returns Sorted array (highest opportunity first)
 */
export function sortByOpportunity(trends: TrendAnalysis[]): TrendAnalysis[] {
  return [...trends].sort((a, b) => {
    // Primary sort: confidence score (descending)
    if (b.confidenceScore !== a.confidenceScore) {
      return b.confidenceScore - a.confidenceScore;
    }
    // Secondary sort: current volume (descending)
    return b.currentVolume - a.currentVolume;
  });
}
