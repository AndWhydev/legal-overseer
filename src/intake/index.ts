/**
 * Scope Intake module.
 *
 * Watches ~/inbox for scope docs (.md / .docx), parses them with Opus,
 * scaffolds a new project (folder + CLAUDE.md + PLAYBOOK.md), registers
 * the project in SQLite, archives the source doc, and emails the
 * operator a confirmation.
 *
 * Submodules:
 *   - services.ts    fixed 20-service catalog
 *   - specialists.ts specialist agent roster
 *   - types.ts       ParsedScope / IngestResult types
 *   - docx.ts        .docx → text via mammoth
 *   - parser.ts      Opus-backed scope-doc parser
 *   - generator.ts   CLAUDE.md + PLAYBOOK.md generators
 *   - ingestor.ts    end-to-end pipeline
 *   - watcher.ts     debounced fs.watch loop
 */

export { SERVICE_TYPES, SERVICE_LABELS, isServiceType, serviceLabel, type ServiceType } from './services.js';
export { SPECIALIST_AGENTS, SPECIALIST_DESCRIPTIONS, isSpecialistAgent, type SpecialistAgent } from './specialists.js';
export type { ParsedScope, ScopeMilestone, ScopeTask, Complexity, IngestResult } from './types.js';
export { parseScope, readScopeDoc, slugify, type ParseScopeOptions, type ParseScopeOutcome } from './parser.js';
export { buildClaudeMd, buildPlaybookMd } from './generator.js';
export {
  ingestScopeFile,
  ensureInboxDir,
  getInboxDir,
  isScopeDocCandidate,
  DEFAULT_PROJECTS_ROOT,
  INTAKE_NOTIFY_TO,
  type IngestOptions,
} from './ingestor.js';
export { startInboxWatcher, type WatcherOptions, type RunningWatcher } from './watcher.js';
