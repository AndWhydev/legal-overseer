/**
 * Report Generation Types
 *
 * Type definitions for the Chess Master Report PDF generation.
 * These types structure the data flowing from analysis modules
 * into the HTML template and final PDF output.
 */

import type { CrossReferenceResult } from '../analysis/cross-reference.js';
import type { TrendAnalysis } from '../trends/types.js';

/**
 * Data structure for generating the Chess Master Report
 *
 * Aggregates cross-reference opportunities and trend analysis
 * into a format suitable for the HTML template.
 */
export interface ReportData {
  /** ISO timestamp when report was generated */
  generatedAt: string;

  /** Unique report identifier */
  reportId: string;

  /** Top product opportunities from cross-reference analysis */
  opportunities: CrossReferenceResult[];

  /** Trending keywords with spike detection */
  trends: TrendAnalysis[];

  /** Executive summary text (2-3 bullet points) */
  summary: string;

  /** Optional custom title override */
  title?: string;
}

/**
 * Section types for the report template
 *
 * Used for conditional rendering and section ordering.
 */
export type ReportSection =
  | 'header'
  | 'executive-summary'
  | 'opportunities'
  | 'trends'
  | 'footer';

/**
 * Result from PDF generation
 */
export interface PDFGenerationResult {
  /** Whether generation succeeded */
  success: boolean;

  /** PDF buffer if successful */
  pdf?: Buffer;

  /** File path if saved to disk */
  filePath?: string;

  /** Error message if failed */
  error?: string;

  /** Generation time in milliseconds */
  generationTimeMs?: number;
}

/**
 * Result from saving report to file
 */
export interface SaveReportResult {
  /** Whether save succeeded */
  success: boolean;

  /** Full path to saved file */
  filePath?: string;

  /** File size in bytes */
  sizeBytes?: number;

  /** Error message if failed */
  error?: string;
}
