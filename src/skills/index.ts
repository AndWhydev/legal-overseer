/**
 * Skills module — Legal Overseer.
 *
 * Re-exports the skill registry, per-skill runners, and per-skill
 * types so the rest of the codebase can import everything from a
 * single path.
 */

export type {
  SkillType,
  ModelTier,
  TaskComplexity,
  SkillDefinition,
  SubagentDefinition,
  TaskClassification,
} from './types.js';

export {
  SKILL_REGISTRY,
  getSkillDefinition,
  skillToSubagent,
  getAllSkillTypes,
  isValidSkillType,
} from './registry.js';

// Legal skills (each module exports runX(...) + result types)
export {
  runContractReview,
  type ContractReviewInput,
  type ContractReviewOutput,
  type ContractReviewResult,
  type ContractFinding,
  type RiskSeverity,
} from './contract-review/index.js';

export {
  runLegalResearch,
  type LegalResearchInput,
  type LegalResearchOutput,
  type ResearchMemo,
  type Citation,
} from './legal-research/index.js';

export {
  runMatterDrafting,
  type MatterDraftingInput,
  type MatterDraftingOutput,
  type DraftedDocument,
  type DocumentType,
} from './matter-drafting/index.js';

export {
  runMatterManagement,
  type MatterManagementInput,
  type MatterManagementOutput,
  type MatterManagementResult,
  type DeadlineFinding,
  type DeadlineType,
} from './matter-management/index.js';

export {
  runClientComms,
  type ClientCommsInput,
  type ClientCommsOutput,
  type ClientEmailDraft,
} from './client-comms/index.js';

export {
  runComplianceMonitor,
  type ComplianceMonitorInput,
  type ComplianceMonitorOutput,
  type ComplianceMonitorResult,
  type RegulatoryChange,
  type Urgency,
} from './compliance-monitor/index.js';
