/**
 * Skills module for BitBit
 *
 * Re-exports types, registry, and helper functions for skill-based
 * task routing and subagent management.
 */

// Type definitions
export type {
  SkillType,
  ModelTier,
  TaskComplexity,
  SkillDefinition,
  SubagentDefinition,
  TaskClassification,
} from './types.js';

// Registry and helpers
export {
  SKILL_REGISTRY,
  getSkillDefinition,
  skillToSubagent,
  getAllSkillTypes,
  isValidSkillType,
} from './registry.js';

// Gatekeeper skill functions and types
export {
  getGatekeeperPrompt,
  fetchGatekeeperTaskContext,
  parseTaskPayload,
  type ClickUpTaskPayload,
  type GatekeeperTaskContext,
  type MediaMetadata,
  type AudioLevels,
  type ValidationResult,
  type TechnicalValidation,
  type VisualAnalysis,
  type QARecommendation,
  type QAResult,
} from './gatekeeper/index.js';

// R&D Scout skill functions
export {
  runResearchPipeline,
  generateReport,
  getRDScoutDefinition,
  DEFAULT_CONFIG as RD_SCOUT_DEFAULT_CONFIG,
  type ProductOpportunity,
  type SEOTrendData,
  type ResearchReport,
  type RDScoutConfig,
} from './rd-scout/index.js';

// SEO Backlinks skill
export {
  initSEOBacklinks,
  getSEOBacklinksDefinition,
  dispatchBacklinkCampaign,
  runBacklinkCampaign,
  buildWeeklyReport,
  renderReportMarkdown,
  scheduleBacklinkJobs,
  runWeeklyReportNow,
  pickTargetsForCampaign,
  BACKLINK_TARGETS,
  type CampaignConfig,
  type CampaignRunResult,
  type BacklinkTarget,
  type GeneratedArticle,
  type SubmissionResult,
  type WeeklyBacklinkReport,
} from './seo-backlinks/index.js';

// Ops Officer skill types
export {
  InvoiceSchema,
  InvoiceLineItemSchema,
  createTaskContext,
  withAttachment,
  withInvoice,
  withResult,
  type Invoice,
  type InvoiceLineItem,
  type AnomalyType,
  type AnomalySeverity,
  type AnomalyFlag,
  type VerificationResult,
  type InvoiceProcessingResult,
  type XeroDraftResult,
  type OpsOfficerTaskContext,
} from './ops-officer/index.js';
