/**
 * Compliance layer — public surface.
 *
 * Single re-export point for the six hard product constraints:
 *
 *   - disclaimer.ts        — AI disclaimer block on every output
 *   - reviewGate.ts        — mandatory human review before send
 *   - citationVerifier.ts  — every case citation flagged + auto-checked
 *   - privilege.ts         — local redaction before any external model
 *   - billing.ts           — AI vs lawyer time per matter
 *   - audit.ts             — immutable, hash-chained legal audit log
 */

export {
  AI_DISCLAIMER_BLOCK,
  wrapWithDisclaimer,
  hasDisclaimer,
} from './disclaimer.js';

export {
  enqueueForReview,
  getReviewById,
  listPendingReviews,
  listReviewsByStatus,
  approveReview,
  rejectReview,
  markReviewSent,
  assertApproved,
  type OutputKind,
  type ReviewStatus,
  type ReviewQueueRow,
  type EnqueueInput,
  type ReviewDecisionInput,
} from './reviewGate.js';

export {
  verifyOne,
  verifyCitations,
  type VerifiableCitation,
} from './citationVerifier.js';

export {
  redactForExternalModel,
  redactionDensity,
  type RedactionRecord,
  type RedactionResult,
  type RedactionOptions,
} from './privilege.js';

export {
  recordAiRun,
  recordLawyerTime,
  getBillingEntry,
  summariseMatterBilling,
  listMatterBilling,
  type BillingEntry,
  type BillingEntryKind,
  type MatterBillingSummary,
  type RecordAiRunInput,
  type RecordLawyerTimeInput,
} from './billing.js';

export {
  appendLegalAudit,
  listAuditForMatter,
  listRecentAudit,
  verifyAuditChain,
  type LegalAuditEntry,
  type AppendLegalAuditInput,
} from './audit.js';
