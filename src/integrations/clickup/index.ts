/**
 * ClickUp Integration Module
 *
 * Barrel export for ClickUp MCP server configuration,
 * webhook handling, service functions, and workflows.
 */

export {
  getClickUpMcpConfig,
  isClickUpConfigured,
  getClickUpTeamIdPartial,
  logClickUpStatus,
} from './config.js';

export { handleClickUpWebhook, isClickUpWebhook } from './webhook.js';

export {
  executeClickUpQuery,
  getTask,
  updateTaskStatus,
  getWorkspaceHierarchy,
  postTaskComment,
  postQAReport,
  formatQAReport,
} from './service.js';

export { completeGatekeeperTask, type GatekeeperCompletionResult } from './workflow.js';

export {
  uploadAttachment,
  uploadReportPDF,
  isClickUpApiConfigured,
  type AttachmentUploadResult,
} from './attachments.js';

export { type QAReport, QA_STATUS_MAP } from './types.js';

export {
  getDashboardOverview,
  getTasksByStatus,
  type DashboardOverview,
  type DashboardTaskSummary,
  type DashboardTaskItem,
} from './dashboard.js';
