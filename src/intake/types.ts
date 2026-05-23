/**
 * Type definitions for the scope intake pipeline.
 *
 * A "scope doc" is a free-text Markdown or Word file the operator
 * drops into ~/inbox describing a new client engagement. The parser
 * distills it into a ParsedScope which then drives project creation,
 * folder scaffolding, and the confirmation email.
 */

import type { ServiceType } from './services.js';
import type { SpecialistAgent } from './specialists.js';

/** Estimated complexity buckets — drives model tier + iteration cap. */
export type Complexity = 'simple' | 'standard' | 'complex' | 'epic';

export interface ScopeMilestone {
  /** Short name, e.g. "MVP feature parity" */
  title: string;
  /** What "done" looks like for this milestone */
  description: string;
  /** Optional target date / week phrase from the doc */
  target?: string;
}

export interface ScopeTask {
  /** One-line imperative title */
  title: string;
  /** Optional milestone title this task rolls up to */
  milestone?: string;
  /** Optional specialist agent best suited for this task */
  owner?: SpecialistAgent;
}

/**
 * Structured output of parsing one scope doc. All non-optional fields
 * MUST be populated by the parser (with sensible defaults if the doc
 * is sparse) so downstream steps don't have to special-case nulls.
 */
export interface ParsedScope {
  /** Human-friendly project name, e.g. "Foodrun Customer Portal" */
  projectName: string;
  /** Filesystem-safe slug, e.g. "foodrun-customer-portal" */
  projectSlug: string;
  /** One-sentence summary suitable for the email subject / dashboard */
  summary: string;
  /** Primary service classification (one of the 20 SERVICE_TYPES) */
  serviceType: ServiceType;
  /** Tech stack the work will be done in, free-form short labels */
  techStack: string[];
  /** Top-level milestones (3-7 ideal) */
  milestones: ScopeMilestone[];
  /** Concrete tasks the worker can pick up immediately (5-20) */
  tasks: ScopeTask[];
  /** Acceptance criteria the operator/client will judge "done" by */
  acceptanceCriteria: string[];
  /** Overall complexity estimate */
  complexity: Complexity;
  /** Specialist agents the parser believes this project will need */
  specialists: SpecialistAgent[];
  /** Optional rough effort/timeline phrase pulled from the doc */
  estimatedDuration?: string;
  /** Optional client / stakeholder name pulled from the doc */
  client?: string;
  /** Free-form parser notes worth preserving (assumptions, gaps) */
  notes?: string;
}

/**
 * Result returned from the full ingestion pipeline (parse + register +
 * scaffold + email). Used by the watcher and the manual CLI script.
 */
export interface IngestResult {
  /** The source file that was processed */
  sourcePath: string;
  /** Where the source file was moved to after processing */
  archivedPath: string | null;
  /** The ParsedScope produced by Opus */
  scope: ParsedScope;
  /** The Project row inserted into the registry */
  projectId: string;
  /** Absolute project folder path */
  projectPath: string;
  /** Absolute CLAUDE.md path created in the project folder */
  claudeMdPath: string;
  /** Absolute PLAYBOOK.md path created in the project folder */
  playbookPath: string;
  /** Whether the confirmation email was sent */
  emailSent: boolean;
  /** Cost in USD of the parse call, when available */
  parseCostUsd?: number;
}
