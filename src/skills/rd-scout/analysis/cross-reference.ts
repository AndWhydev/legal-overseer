/**
 * Cross-Reference Analysis Module
 *
 * Matches Alibaba products against Amazon Best Sellers to identify
 * market opportunities with validated demand.
 *
 * Scoring is based on:
 * - Keyword match between product titles
 * - Amazon bestseller rank
 * - Margin potential (price differential)
 */

import type { AlibabaProduct } from '../scrapers/types.js';
import type { AmazonBestSeller } from '../scrapers/amazon.js';

/**
 * A matched Amazon product with match details
 */
export interface AmazonMatch {
  /** The matched Amazon product */
  product: AmazonBestSeller;

  /** Keyword overlap percentage (0-100) */
  keywordMatchPercent: number;

  /** Keywords that matched between products */
  matchedKeywords: string[];

  /** Price multiple (Amazon price / Alibaba price) */
  priceMultiple: number;
}

/**
 * Result of cross-referencing an Alibaba product
 */
export interface CrossReferenceResult {
  /** The source Alibaba product */
  alibabaProduct: AlibabaProduct;

  /** Matching Amazon products with match details */
  amazonMatches: AmazonMatch[];

  /** Overall opportunity score (0-100) */
  opportunityScore: number;

  /** Breakdown of score components */
  scoreBreakdown: {
    /** Points from keyword matching (0-40) */
    keywordScore: number;
    /** Points from Amazon rank (0-30) */
    rankScore: number;
    /** Points from margin potential (0-30) */
    marginScore: number;
  };

  /** Best matching Amazon product (if any) */
  bestMatch?: AmazonMatch;
}

/**
 * Options for cross-reference analysis
 */
export interface CrossReferenceOptions {
  /** Minimum keyword match percentage to consider (default: 30) */
  minKeywordMatch?: number;

  /** Minimum opportunity score to include in results (default: 50) */
  minOpportunityScore?: number;

  /** Maximum Amazon matches to return per product (default: 3) */
  maxMatchesPerProduct?: number;
}

/**
 * Default cross-reference options
 */
const DEFAULT_OPTIONS: Required<CrossReferenceOptions> = {
  minKeywordMatch: 30,
  minOpportunityScore: 50,
  maxMatchesPerProduct: 3,
};

/**
 * Common stop words to exclude from keyword matching
 */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'for',
  'with',
  'in',
  'on',
  'at',
  'to',
  'from',
  'of',
  'by',
  'as',
  'is',
  'it',
  'set',
  'kit',
  'new',
  'free',
  'shipping',
  'pcs',
  'pieces',
  'pack',
  'wholesale',
  'dropshipping',
]);

/**
 * Normalize and extract keywords from a product title
 *
 * @param title - Product title to extract keywords from
 * @returns Array of normalized keywords
 */
function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // Remove special chars
    .split(/\s+/) // Split on whitespace
    .filter((word) => word.length > 2) // Min word length
    .filter((word) => !STOP_WORDS.has(word)) // Remove stop words
    .filter((word, index, arr) => arr.indexOf(word) === index); // Dedupe
}

/**
 * Calculate keyword overlap between two product titles
 *
 * @param keywords1 - Keywords from first product
 * @param keywords2 - Keywords from second product
 * @returns Object with overlap percentage and matched keywords
 */
function calculateKeywordOverlap(
  keywords1: string[],
  keywords2: string[]
): { percent: number; matched: string[] } {
  if (keywords1.length === 0 || keywords2.length === 0) {
    return { percent: 0, matched: [] };
  }

  const set2 = new Set(keywords2);
  const matched = keywords1.filter((kw) => set2.has(kw));

  // Use the smaller set as denominator for more meaningful percentage
  const smallerSize = Math.min(keywords1.length, keywords2.length);
  const percent = (matched.length / smallerSize) * 100;

  return { percent, matched };
}

/**
 * Calculate rank-based score
 *
 * Scoring:
 * - Top 10: 30 points
 * - Top 50: 20 points
 * - Top 100: 10 points
 * - Below 100: 0 points
 *
 * @param rank - Amazon bestseller rank
 * @returns Score (0-30)
 */
function calculateRankScore(rank: number): number {
  if (rank <= 10) return 30;
  if (rank <= 50) return 20;
  if (rank <= 100) return 10;
  return 0;
}

/**
 * Calculate margin-based score
 *
 * Scoring based on price multiple (Amazon/Alibaba):
 * - 3x or more: 30 points
 * - 2x-3x: 20 points
 * - 1.5x-2x: 10 points
 * - Below 1.5x: 0 points
 *
 * @param amazonPrice - Amazon product price
 * @param alibabaPrice - Alibaba product price (use max for conservative estimate)
 * @returns Score (0-30)
 */
function calculateMarginScore(
  amazonPrice: number,
  alibabaPrice: number
): number {
  if (alibabaPrice <= 0 || amazonPrice <= 0) return 0;

  const multiple = amazonPrice / alibabaPrice;

  if (multiple >= 3) return 30;
  if (multiple >= 2) return 20;
  if (multiple >= 1.5) return 10;
  return 0;
}

/**
 * Cross-reference Alibaba products against Amazon Best Sellers
 *
 * Matches products based on keyword overlap and scores opportunities
 * based on:
 * - 40 points: Keyword match (>50% overlap = full points)
 * - 30 points: Amazon rank (top 10 = full points)
 * - 30 points: Margin potential (3x+ = full points)
 *
 * @param alibabaProducts - Products from Alibaba search
 * @param amazonBestSellers - Amazon best sellers to match against
 * @param options - Optional configuration
 * @returns Array of cross-reference results with scores >= minOpportunityScore
 *
 * @example
 * ```typescript
 * const alibaba = await searchProducts({ query: 'face massager' });
 * const amazon = await getAllBeautyBestSellers();
 * const opportunities = crossReferenceProducts(
 *   alibaba.products,
 *   amazon,
 *   { minOpportunityScore: 60 }
 * );
 *
 * for (const opp of opportunities) {
 *   console.log(`${opp.alibabaProduct.title}: Score ${opp.opportunityScore}`);
 * }
 * ```
 */
export function crossReferenceProducts(
  alibabaProducts: AlibabaProduct[],
  amazonBestSellers: AmazonBestSeller[],
  options: CrossReferenceOptions = {}
): CrossReferenceResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const results: CrossReferenceResult[] = [];

  // Pre-extract Amazon keywords for efficiency
  const amazonKeywordsMap = new Map<AmazonBestSeller, string[]>();
  for (const amazonProduct of amazonBestSellers) {
    amazonKeywordsMap.set(amazonProduct, extractKeywords(amazonProduct.name));
  }

  // Process each Alibaba product
  for (const alibabaProduct of alibabaProducts) {
    const alibabaKeywords = extractKeywords(alibabaProduct.title);
    const matches: AmazonMatch[] = [];

    // Use the higher price for conservative margin estimate
    const alibabaPrice =
      alibabaProduct.priceMax > 0
        ? alibabaProduct.priceMax
        : alibabaProduct.priceMin;

    // Find matching Amazon products
    for (const amazonProduct of amazonBestSellers) {
      const amazonKeywords = amazonKeywordsMap.get(amazonProduct) || [];
      const overlap = calculateKeywordOverlap(alibabaKeywords, amazonKeywords);

      // Only consider matches above minimum threshold
      if (overlap.percent >= opts.minKeywordMatch) {
        const priceMultiple =
          alibabaPrice > 0 ? amazonProduct.price / alibabaPrice : 0;

        matches.push({
          product: amazonProduct,
          keywordMatchPercent: Math.round(overlap.percent),
          matchedKeywords: overlap.matched,
          priceMultiple: Math.round(priceMultiple * 100) / 100,
        });
      }
    }

    // Sort matches by keyword overlap and take top N
    matches.sort((a, b) => b.keywordMatchPercent - a.keywordMatchPercent);
    const topMatches = matches.slice(0, opts.maxMatchesPerProduct);

    // Calculate opportunity score based on best match
    let keywordScore = 0;
    let rankScore = 0;
    let marginScore = 0;
    let bestMatch: AmazonMatch | undefined;

    if (topMatches.length > 0) {
      bestMatch = topMatches[0];

      // Keyword score: 40 points max, scaled by match percentage
      // >50% overlap = full 40 points
      keywordScore = Math.min(
        40,
        Math.round((bestMatch.keywordMatchPercent / 50) * 40)
      );

      // Rank score from best matching product
      rankScore = calculateRankScore(bestMatch.product.rank);

      // Margin score from best matching product
      marginScore = calculateMarginScore(bestMatch.product.price, alibabaPrice);
    }

    const opportunityScore = keywordScore + rankScore + marginScore;

    // Only include results meeting minimum score threshold
    if (opportunityScore >= opts.minOpportunityScore) {
      results.push({
        alibabaProduct,
        amazonMatches: topMatches,
        opportunityScore,
        scoreBreakdown: {
          keywordScore,
          rankScore,
          marginScore,
        },
        bestMatch,
      });
    }
  }

  // Sort by opportunity score descending
  results.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return results;
}

/**
 * Get summary statistics from cross-reference results
 *
 * @param results - Cross-reference results to summarize
 * @returns Summary statistics
 */
export function getCrossReferenceSummary(results: CrossReferenceResult[]): {
  totalOpportunities: number;
  averageScore: number;
  topScore: number;
  scoreDistribution: {
    excellent: number; // 80-100
    good: number; // 60-79
    moderate: number; // 50-59
  };
} {
  if (results.length === 0) {
    return {
      totalOpportunities: 0,
      averageScore: 0,
      topScore: 0,
      scoreDistribution: { excellent: 0, good: 0, moderate: 0 },
    };
  }

  const scores = results.map((r) => r.opportunityScore);
  const totalScore = scores.reduce((sum, s) => sum + s, 0);

  return {
    totalOpportunities: results.length,
    averageScore: Math.round(totalScore / results.length),
    topScore: Math.max(...scores),
    scoreDistribution: {
      excellent: results.filter((r) => r.opportunityScore >= 80).length,
      good: results.filter(
        (r) => r.opportunityScore >= 60 && r.opportunityScore < 80
      ).length,
      moderate: results.filter(
        (r) => r.opportunityScore >= 50 && r.opportunityScore < 60
      ).length,
    },
  };
}
