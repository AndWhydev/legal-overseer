// Barrel export for reports library

// Report generators
export {
  generateMonthlyReport,
  generateAgentROIReport,
  generatePipelineReport,
} from './generator'

export type {
  ReportData,
  MonthlyReportData,
  AgentROIReportData,
  PipelineReportData,
} from './generator'

// PDF report generation
export {
  generateReportHTML,
  generateReportPDF,
} from './pdf-report'

// Monthly revenue report email automation
export {
  parseEmailList,
  getMonthlyReportRecipients,
  buildMonthlyRevenueEmailHtml,
  sendMonthlyRevenueReportEmail,
} from './monthly-revenue-email'

export type {
  MonthlyRevenueReportEmailInput,
  MonthlyRevenueReportEmailResult,
} from './monthly-revenue-email'
