/**
 * PDF Report Generator
 *
 * Generates PDF reports from ReportData using Puppeteer.
 * Designed for Docker environments with appropriate browser flags.
 *
 * IMPORTANT: Always close the browser in finally block to prevent
 * memory leaks. Do not run multiple Puppeteer instances simultaneously.
 */

import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

import type { ReportData, PDFGenerationResult, SaveReportResult } from './types.js';
import { renderReportHTML } from './template.js';
import { createSafeLogger } from '../../../governance/index.js';

const logger = createSafeLogger('PDFGenerator');

/**
 * Default directory for saving reports
 */
const DEFAULT_REPORTS_DIR = '/data/reports';

/**
 * Puppeteer launch args optimized for Docker/headless environments
 *
 * These flags are essential for running in containerized environments:
 * - --no-sandbox: Required for Docker without Chrome sandbox
 * - --disable-setuid-sandbox: Docker security
 * - --disable-dev-shm-usage: Avoid /dev/shm size issues
 * - --single-process: Reduce memory footprint
 * - --disable-gpu: Headless doesn't need GPU
 */
const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-gpu',
];

/**
 * PDF format configuration for A4 documents
 */
const PDF_OPTIONS = {
  format: 'A4' as const,
  printBackground: true,
  margin: {
    top: '1cm',
    bottom: '1cm',
    left: '1cm',
    right: '1cm',
  },
};

/**
 * Generate a PDF buffer from report data
 *
 * Uses Puppeteer to render HTML and convert to PDF.
 * The browser is always closed in the finally block to prevent leaks.
 *
 * @param data - Report data to render
 * @returns Promise resolving to PDF generation result
 *
 * @example
 * ```typescript
 * const result = await generatePDF({
 *   generatedAt: new Date().toISOString(),
 *   reportId: 'RPT-001',
 *   opportunities: [],
 *   trends: [],
 *   summary: '- No opportunities found'
 * });
 *
 * if (result.success && result.pdf) {
 *   await writeFile('report.pdf', result.pdf);
 * }
 * ```
 */
export async function generatePDF(data: ReportData): Promise<PDFGenerationResult> {
  const startTime = Date.now();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    // Render HTML template
    const html = renderReportHTML(data);

    // Launch browser with Docker-safe flags
    logger.info('Launching Puppeteer...');
    browser = await puppeteer.launch({
      headless: true,
      args: PUPPETEER_ARGS,
    });

    // Create page and set content
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Generate PDF
    logger.info('Generating PDF...');
    const pdfBuffer = await page.pdf(PDF_OPTIONS);

    const generationTimeMs = Date.now() - startTime;
    logger.info(`Generated successfully in ${generationTimeMs}ms (${pdfBuffer.length} bytes)`);

    return {
      success: true,
      pdf: Buffer.from(pdfBuffer),
      generationTimeMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during PDF generation';
    logger.error(`Generation failed: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
      generationTimeMs: Date.now() - startTime,
    };
  } finally {
    // CRITICAL: Always close browser to prevent memory leaks
    if (browser) {
      try {
        await browser.close();
        logger.info('Browser closed');
      } catch (closeError) {
        logger.error('Error closing browser:', closeError);
      }
    }
  }
}

/**
 * Save a PDF buffer to a file
 *
 * Creates the target directory if it doesn't exist.
 *
 * @param pdf - PDF buffer to save
 * @param filename - Filename (with or without .pdf extension)
 * @param directory - Target directory (default: /data/reports)
 * @returns Promise resolving to save result
 *
 * @example
 * ```typescript
 * const saveResult = await saveReportToFile(
 *   pdfBuffer,
 *   'chess-master-2024-01-15.pdf'
 * );
 *
 * if (saveResult.success) {
 *   console.log(`Saved to: ${saveResult.filePath}`);
 * }
 * ```
 */
export async function saveReportToFile(
  pdf: Buffer,
  filename: string,
  directory: string = DEFAULT_REPORTS_DIR
): Promise<SaveReportResult> {
  try {
    // Ensure filename has .pdf extension
    const pdfFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    const filePath = join(directory, pdfFilename);

    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });

    // Write file
    await writeFile(filePath, pdf);

    logger.info(`Saved to ${filePath} (${pdf.length} bytes)`);

    return {
      success: true,
      filePath,
      sizeBytes: pdf.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error saving file';
    logger.error(`Save failed: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Generate and save a PDF report in one operation
 *
 * Convenience function that combines generation and saving.
 *
 * @param data - Report data to render
 * @param filename - Filename for the saved PDF
 * @param directory - Target directory (default: /data/reports)
 * @returns Promise resolving to combined result
 *
 * @example
 * ```typescript
 * const result = await generateAndSaveReport(
 *   reportData,
 *   `chess-master-${Date.now()}.pdf`
 * );
 *
 * if (result.success) {
 *   console.log(`Report saved to: ${result.filePath}`);
 * }
 * ```
 */
export async function generateAndSaveReport(
  data: ReportData,
  filename: string,
  directory: string = DEFAULT_REPORTS_DIR
): Promise<PDFGenerationResult & SaveReportResult> {
  // Generate PDF
  const genResult = await generatePDF(data);

  if (!genResult.success || !genResult.pdf) {
    return {
      success: false,
      error: genResult.error || 'PDF generation failed',
      generationTimeMs: genResult.generationTimeMs,
    };
  }

  // Save to file
  const saveResult = await saveReportToFile(genResult.pdf, filename, directory);

  return {
    success: saveResult.success,
    pdf: genResult.pdf,
    filePath: saveResult.filePath,
    sizeBytes: saveResult.sizeBytes,
    error: saveResult.error,
    generationTimeMs: genResult.generationTimeMs,
  };
}

/**
 * Generate a unique report filename based on timestamp
 *
 * @param prefix - Optional prefix (default: 'chess-master-report')
 * @returns Filename with timestamp
 */
export function generateReportFilename(prefix: string = 'chess-master-report'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}-${timestamp}.pdf`;
}
