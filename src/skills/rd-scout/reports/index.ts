/**
 * Report Generation Module
 *
 * Exports for generating Chess Master Report PDFs.
 */

export {
  generatePDF,
  saveReportToFile,
  generateAndSaveReport,
  generateReportFilename,
} from './generator.js';

export { renderReportHTML } from './template.js';

export type {
  ReportData,
  ReportSection,
  PDFGenerationResult,
  SaveReportResult,
} from './types.js';
