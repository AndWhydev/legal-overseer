/**
 * R&D Scout Research Pipeline
 *
 * Orchestrates the complete research workflow:
 * 1. Alibaba product scanning
 * 2. Amazon Best Sellers cross-reference
 * 3. SEO trend analysis
 * 4. Report generation and delivery
 *
 * The pipeline is designed for fault tolerance - partial failures
 * don't abort the entire pipeline, allowing partial reports.
 *
 * @module skills/rd-scout/pipeline
 */

import { createSafeLogger } from '../../governance/index.js';
import {
  searchMultipleCategories,
  getAllBeautyBestSellers,
  type AlibabaProduct,
  type AmazonBestSeller,
  ALIBABA_CATEGORY_MAP,
} from './scrapers/index.js';

const logger = createSafeLogger('RDScout');
import {
  crossReferenceProducts,
  getCrossReferenceSummary,
  type CrossReferenceResult,
} from './analysis/index.js';
import {
  analyzeTrends,
  filterSpikes,
  sortByOpportunity,
  type TrendAnalysis,
} from './trends/index.js';
import { generatePDF, type ReportData } from './reports/index.js';
import { uploadAttachment, isClickUpApiConfigured } from '../../integrations/clickup/attachments.js';

/**
 * Pipeline configuration
 *
 * Defines what to scan, analyze, and where to deliver reports.
 */
export interface PipelineConfig {
  /** Alibaba categories to scan */
  targetCategories: Array<keyof typeof ALIBABA_CATEGORY_MAP>;

  /** Search query for Alibaba products */
  searchQuery: string;

  /** Keywords to track for SEO trends */
  seoKeywords: string[];

  /** ClickUp task ID for report delivery */
  clickupTaskId?: string;

  /** Maximum products to process from Alibaba */
  maxProducts?: number;

  /** Minimum opportunity score to include in report */
  minOpportunityScore?: number;
}

/**
 * Default pipeline configuration
 *
 * Targets CheekyGlo's core product categories.
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  targetCategories: ['beauty-tools', 'skincare', 'haircare'],
  searchQuery: 'beauty device',
  seoKeywords: [
    'glass skin serum',
    'korean skincare',
    'lip oil plumping',
    'scalp massager',
    'gua sha tool',
    'face roller jade',
    'ice roller face',
    'led face mask',
  ],
  maxProducts: 50,
  minOpportunityScore: 50,
};

/**
 * Pipeline execution result
 */
export interface PipelineResult {
  /** Whether the pipeline completed (may have partial results) */
  success: boolean;

  /** Generated report ID */
  reportId: string;

  /** Number of Alibaba products found */
  alibabaProductsFound: number;

  /** Number of Amazon best sellers found */
  amazonProductsFound: number;

  /** Number of opportunities identified */
  opportunitiesFound: number;

  /** Number of trending keywords detected */
  trendingKeywords: number;

  /** Whether PDF was generated */
  pdfGenerated: boolean;

  /** Whether report was uploaded to ClickUp */
  clickupUploaded: boolean;

  /** ClickUp attachment URL if uploaded */
  clickupAttachmentUrl?: string;

  /** Errors encountered during execution */
  errors: string[];

  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * Run the complete R&D Scout research pipeline
 *
 * Orchestrates all research modules in sequence:
 * 1. Scan Alibaba for products in target categories
 * 2. Fetch Amazon Best Sellers for cross-reference
 * 3. Cross-reference products and score opportunities
 * 4. Analyze SEO trends for tracked keywords
 * 5. Generate PDF report
 * 6. Upload to ClickUp (if configured)
 *
 * The pipeline continues on partial failures, logging errors
 * and returning partial results where possible.
 *
 * @param config - Pipeline configuration (uses defaults if not provided)
 * @returns Promise resolving to pipeline execution result
 *
 * @example
 * ```typescript
 * const result = await runResearchPipeline({
 *   targetCategories: ['beauty-tools'],
 *   seoKeywords: ['gua sha', 'jade roller'],
 *   clickupTaskId: 'abc123',
 * });
 *
 * console.log(`Found ${result.opportunitiesFound} opportunities`);
 * ```
 */
export async function runResearchPipeline(
  config: Partial<PipelineConfig> = {}
): Promise<PipelineResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  const reportId = `RDS-${Date.now()}`;
  const errors: string[] = [];

  logger.info(`Starting research (ID: ${reportId})`);
  logger.info(`Categories: ${mergedConfig.targetCategories.join(', ')}`);
  logger.info(`SEO Keywords: ${mergedConfig.seoKeywords.length}`);

  // Initialize result tracking
  let alibabaProducts: AlibabaProduct[] = [];
  let amazonProducts: AmazonBestSeller[] = [];
  let opportunities: CrossReferenceResult[] = [];
  let trends: TrendAnalysis[] = [];
  let pdfGenerated = false;
  let clickupUploaded = false;
  let clickupAttachmentUrl: string | undefined;

  // ============================================
  // Step 1: Scan Alibaba for products
  // ============================================
  logger.info('[1/6] Scanning Alibaba...');
  try {
    const alibabaResult = await searchMultipleCategories(
      mergedConfig.searchQuery,
      mergedConfig.targetCategories,
      { verifiedOnly: true }
    );

    alibabaProducts = alibabaResult.products;
    logger.info(`[1/6] Found ${alibabaProducts.length} Alibaba products`);

    if (alibabaResult.errors && alibabaResult.errors.length > 0) {
      for (const err of alibabaResult.errors) {
        errors.push(`Alibaba: ${err}`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[1/6] Alibaba scan failed: ${errorMessage}`);
    errors.push(`Alibaba scan failed: ${errorMessage}`);
  }

  // ============================================
  // Step 2: Fetch Amazon Best Sellers
  // ============================================
  logger.info('[2/6] Fetching Amazon Best Sellers...');
  try {
    amazonProducts = await getAllBeautyBestSellers();
    logger.info(`[2/6] Found ${amazonProducts.length} Amazon products`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[2/6] Amazon fetch failed: ${errorMessage}`);
    errors.push(`Amazon fetch failed: ${errorMessage}`);
  }

  // ============================================
  // Step 3: Cross-reference products
  // ============================================
  logger.info('[3/6] Cross-referencing products...');
  if (alibabaProducts.length > 0 && amazonProducts.length > 0) {
    try {
      opportunities = crossReferenceProducts(alibabaProducts, amazonProducts, {
        minOpportunityScore: mergedConfig.minOpportunityScore,
      });

      const summary = getCrossReferenceSummary(opportunities);
      logger.info(
        `[3/6] Identified ${opportunities.length} opportunities ` +
          `(${summary.scoreDistribution.excellent} excellent, ${summary.scoreDistribution.good} good)`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[3/6] Cross-reference failed: ${errorMessage}`);
      errors.push(`Cross-reference failed: ${errorMessage}`);
    }
  } else {
    logger.info('[3/6] Skipping cross-reference (missing data)');
    if (alibabaProducts.length === 0) {
      errors.push('No Alibaba products available for cross-reference');
    }
    if (amazonProducts.length === 0) {
      errors.push('No Amazon products available for cross-reference');
    }
  }

  // ============================================
  // Step 4: Analyze SEO trends
  // ============================================
  logger.info('[4/6] Analyzing SEO trends...');
  try {
    const allTrends = await analyzeTrends(mergedConfig.seoKeywords);
    trends = sortByOpportunity(filterSpikes(allTrends));

    const spikeCount = trends.filter((t) => t.spikeDetected).length;
    logger.info(
      `[4/6] Analyzed ${allTrends.length} keywords, ${spikeCount} with detected spikes`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[4/6] SEO analysis failed: ${errorMessage}`);
    errors.push(`SEO analysis failed: ${errorMessage}`);
  }

  // ============================================
  // Step 5: Generate PDF report
  // ============================================
  logger.info('[5/6] Generating PDF report...');
  let pdfBuffer: Buffer | undefined;

  try {
    const reportData: ReportData = {
      generatedAt: new Date().toISOString(),
      reportId,
      opportunities: opportunities.slice(0, 10), // Top 10 opportunities
      trends: trends.slice(0, 5), // Top 5 trends
      summary: generateExecutiveSummary(opportunities, trends, errors),
    };

    const pdfResult = await generatePDF(reportData);

    if (pdfResult.success && pdfResult.pdf) {
      pdfBuffer = pdfResult.pdf;
      pdfGenerated = true;
      logger.info(`[5/6] PDF generated (${pdfBuffer.length} bytes)`);
    } else {
      errors.push(`PDF generation failed: ${pdfResult.error || 'Unknown error'}`);
      logger.error('[5/6] PDF generation failed');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[5/6] PDF generation error: ${errorMessage}`);
    errors.push(`PDF generation error: ${errorMessage}`);
  }

  // ============================================
  // Step 6: Upload to ClickUp (if configured)
  // ============================================
  logger.info('[6/6] Uploading to ClickUp...');

  if (mergedConfig.clickupTaskId && pdfBuffer && isClickUpApiConfigured()) {
    try {
      const filename = `rd-scout-report-${reportId}.pdf`;
      const uploadResult = await uploadAttachment(
        mergedConfig.clickupTaskId,
        pdfBuffer,
        filename
      );

      if (uploadResult.success) {
        clickupUploaded = true;
        clickupAttachmentUrl = uploadResult.attachmentUrl;
        logger.info(`[6/6] Uploaded to ClickUp: ${clickupAttachmentUrl}`);
      } else {
        errors.push(`ClickUp upload failed: ${uploadResult.error}`);
        logger.error('[6/6] ClickUp upload failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[6/6] ClickUp upload error: ${errorMessage}`);
      errors.push(`ClickUp upload error: ${errorMessage}`);
    }
  } else {
    if (!mergedConfig.clickupTaskId) {
      logger.info('[6/6] Skipping (no ClickUp task ID configured)');
    } else if (!pdfBuffer) {
      logger.info('[6/6] Skipping (no PDF generated)');
    } else if (!isClickUpApiConfigured()) {
      logger.info('[6/6] Skipping (ClickUp API not configured)');
    }
  }

  // ============================================
  // Finalize and return result
  // ============================================
  const executionTimeMs = Date.now() - startTime;
  const success = errors.length === 0 || opportunities.length > 0 || trends.length > 0;

  logger.info(`Completed in ${executionTimeMs}ms`);
  logger.info(`Success: ${success}, Errors: ${errors.length}`);

  return {
    success,
    reportId,
    alibabaProductsFound: alibabaProducts.length,
    amazonProductsFound: amazonProducts.length,
    opportunitiesFound: opportunities.length,
    trendingKeywords: trends.filter((t) => t.spikeDetected).length,
    pdfGenerated,
    clickupUploaded,
    clickupAttachmentUrl,
    errors,
    executionTimeMs,
  };
}

/**
 * Generate executive summary for the report
 */
function generateExecutiveSummary(
  opportunities: CrossReferenceResult[],
  trends: TrendAnalysis[],
  errors: string[]
): string {
  const lines: string[] = [];

  // Opportunities summary
  if (opportunities.length > 0) {
    const topScore = opportunities[0]?.opportunityScore || 0;
    lines.push(
      `- Identified ${opportunities.length} product opportunities (top score: ${topScore}/100)`
    );
  } else {
    lines.push('- No high-scoring product opportunities identified this week');
  }

  // Trends summary
  const spikeCount = trends.filter((t) => t.spikeDetected).length;
  if (spikeCount > 0) {
    const topTrend = trends[0];
    lines.push(
      `- Detected ${spikeCount} trending keywords; "${topTrend?.keyword}" showing +${topTrend?.percentageChange.toFixed(0)}% growth`
    );
  } else {
    lines.push('- No significant keyword spikes detected this week');
  }

  // Error summary (if any)
  if (errors.length > 0) {
    lines.push(`- Note: ${errors.length} data source(s) had issues; results may be partial`);
  }

  return lines.join('\n');
}
