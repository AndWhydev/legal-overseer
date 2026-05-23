/**
 * Scope intake orchestration.
 *
 * Given one scope-doc file on disk, run the full pipeline:
 *   1. Read + parse via Opus (intake/parser)
 *   2. Resolve / create the project folder under PROJECTS_ROOT
 *   3. Write CLAUDE.md + PLAYBOOK.md
 *   4. Register the project in SQLite via the projects repo
 *   5. Archive the source doc into ~/inbox/.processed/
 *   6. Email the operator a confirmation with what was parsed
 *
 * Failures at any step are surfaced as thrown errors so the watcher
 * can log + park the file (rather than silently dropping it).
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { homedir } from 'node:os';
import { createSafeLogger } from '../governance/index.js';
import {
  createProject,
  getProjectByPath,
  type Project,
} from '../db/repositories/projects.js';
import { sendNotification } from '../email/notifier.js';
import { parseScope, readScopeDoc, slugify } from './parser.js';
import { buildClaudeMd, buildPlaybookMd } from './generator.js';
import { SERVICE_LABELS } from './services.js';
import { SPECIALIST_DESCRIPTIONS } from './specialists.js';
import type { IngestResult, ParsedScope } from './types.js';

const logger = createSafeLogger('IntakeIngestor');

/**
 * Default root where new project folders are created. Configurable via
 * env (PROJECTS_ROOT) so we can run intake against a different tree in
 * tests.
 */
export const DEFAULT_PROJECTS_ROOT = '/mnt/c/Users/andy/Desktop/Projects';

/** Where scope confirmation emails go. Hard-wired per operator spec. */
export const INTAKE_NOTIFY_TO = 'andy@allwebbedup.com.au';

/**
 * Map ParsedScope.complexity → per-project iteration cap.
 *
 * Bigger engagements get more daily worker cycles. Workers cost real
 * dollars so the operator can tune these by editing the project row
 * later.
 */
function iterationCapFor(complexity: ParsedScope['complexity']): number {
  switch (complexity) {
    case 'simple': return 8;
    case 'standard': return 16;
    case 'complex': return 24;
    case 'epic': return 32;
  }
}

/**
 * Map ParsedScope.complexity → suggested model tier override.
 *
 * Workers default to Sonnet via the skill registry; complex/epic builds
 * benefit from Opus on the planning calls and Sonnet on the execution
 * calls. We bias the per-project default upward for harder work.
 */
function modelTierFor(complexity: ParsedScope['complexity']) {
  if (complexity === 'epic') return 'opus' as const;
  if (complexity === 'simple') return 'haiku' as const;
  return null; // use skill default (sonnet)
}

/**
 * Resolve a unique, non-clashing project folder path.
 *
 * If <root>/<slug> doesn't exist on disk OR in the registry, use it.
 * Otherwise append a -2, -3, ... suffix until we find one that's free
 * in both places.
 */
function resolveProjectPath(root: string, slug: string): { path: string; slug: string } {
  let attempt = slug;
  let counter = 2;
  while (true) {
    const candidate = join(root, attempt);
    const onDisk = existsSync(candidate);
    const inRegistry = getProjectByPath(candidate) !== null;
    if (!onDisk && !inRegistry) {
      return { path: candidate, slug: attempt };
    }
    attempt = `${slug}-${counter}`;
    counter++;
    if (counter > 99) {
      throw new Error(`Could not resolve a free project folder name from slug "${slug}" after 99 attempts`);
    }
  }
}

/**
 * Move the source scope doc into <inbox>/.processed/ so the watcher
 * doesn't re-ingest it on the next event. Filename is prefixed with
 * an ISO timestamp for traceability.
 */
function archiveSource(sourcePath: string): string | null {
  try {
    const inboxDir = dirname(sourcePath);
    const archiveDir = join(inboxDir, '.processed');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveName = `${ts}_${basename(sourcePath)}`;
    const archivePath = join(archiveDir, archiveName);
    renameSync(sourcePath, archivePath);
    return archivePath;
  } catch (err) {
    logger.warn(
      `Could not archive ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function buildConfirmationEmail(result: IngestResult, project: Project): { subject: string; html: string } {
  const { scope } = result;
  const serviceLabel = SERVICE_LABELS[scope.serviceType];

  const milestoneItems = scope.milestones.length
    ? scope.milestones
        .map((m) => `<li><b>${escapeHtml(m.title)}</b>${m.target ? ` <i>(${escapeHtml(m.target)})</i>` : ''} — ${escapeHtml(m.description)}</li>`)
        .join('')
    : '<li><i>none specified</i></li>';

  const taskItems = scope.tasks.length
    ? scope.tasks.slice(0, 12)
        .map((t) => {
          const meta: string[] = [];
          if (t.milestone) meta.push(t.milestone);
          if (t.owner) meta.push(t.owner);
          const tail = meta.length ? ` <span style="color:#888">(${escapeHtml(meta.join(' · '))})</span>` : '';
          return `<li>${escapeHtml(t.title)}${tail}</li>`;
        })
        .join('')
    : '<li><i>no tasks parsed</i></li>';

  const overflow = scope.tasks.length > 12
    ? `<p style="color:#888"><i>…and ${scope.tasks.length - 12} more tasks (see CLAUDE.md)</i></p>` : '';

  const specialistItems = scope.specialists
    .map((s) => `<li><b>${escapeHtml(s)}</b> — ${escapeHtml(SPECIALIST_DESCRIPTIONS[s])}</li>`)
    .join('');

  const criteriaItems = scope.acceptanceCriteria.length
    ? scope.acceptanceCriteria.map((c) => `<li>${escapeHtml(c)}</li>`).join('')
    : '<li><i>none specified</i></li>';

  const techStack = scope.techStack.length
    ? scope.techStack.map((t) => `<code>${escapeHtml(t)}</code>`).join(' &middot; ')
    : '<i>none specified</i>';

  const subject = `[Intake] ${scope.projectName} (${serviceLabel}, ${scope.complexity})`;

  const html = `
    <h1>${escapeHtml(scope.projectName)}</h1>
    <p>${escapeHtml(scope.summary)}</p>

    <table style="border-collapse:collapse">
      <tr><td><b>Service</b></td><td>${escapeHtml(serviceLabel)}</td></tr>
      <tr><td><b>Complexity</b></td><td>${escapeHtml(scope.complexity)}</td></tr>
      ${scope.client ? `<tr><td><b>Client</b></td><td>${escapeHtml(scope.client)}</td></tr>` : ''}
      ${scope.estimatedDuration ? `<tr><td><b>Estimate</b></td><td>${escapeHtml(scope.estimatedDuration)}</td></tr>` : ''}
      <tr><td><b>Iter cap</b></td><td>${project.max_iterations_per_day}/day</td></tr>
      <tr><td><b>Model tier</b></td><td>${escapeHtml(project.model_tier_override ?? 'default')}</td></tr>
    </table>

    <h2>Tech Stack</h2>
    <p>${techStack}</p>

    <h2>Milestones (${scope.milestones.length})</h2>
    <ul>${milestoneItems}</ul>

    <h2>Tasks (${scope.tasks.length})</h2>
    <ul>${taskItems}</ul>
    ${overflow}

    <h2>Acceptance Criteria</h2>
    <ul>${criteriaItems}</ul>

    <h2>Specialist Agents</h2>
    <ul>${specialistItems}</ul>

    <h2>Where it landed</h2>
    <ul>
      <li>Folder: <code>${escapeHtml(result.projectPath)}</code></li>
      <li>CLAUDE.md: <code>${escapeHtml(result.claudeMdPath)}</code></li>
      <li>PLAYBOOK.md: <code>${escapeHtml(result.playbookPath)}</code></li>
      <li>Source archived to: <code>${escapeHtml(result.archivedPath ?? '(archive failed)')}</code></li>
      <li>Registry ID: <code>${escapeHtml(result.projectId)}</code></li>
      ${result.parseCostUsd !== undefined ? `<li>Parse cost: $${result.parseCostUsd.toFixed(4)}</li>` : ''}
    </ul>

    ${scope.notes ? `<h2>Parser notes</h2><p>${escapeHtml(scope.notes)}</p>` : ''}

    <p style="color:#888"><i>The overseer will pick this project up on its next tick.</i></p>
  `;

  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface IngestOptions {
  /** Root directory under which to create the project folder. */
  projectsRoot?: string;
  /** Recipient for the confirmation email. */
  notifyTo?: string;
  /** If true, suppress the confirmation email (useful for tests/dry-runs). */
  skipEmail?: boolean;
}

/**
 * Ingest one scope doc end-to-end. Returns the IngestResult on success,
 * throws on any irrecoverable failure (file unreadable, parser failed,
 * project already exists with the same path, fs write failed).
 */
export async function ingestScopeFile(
  sourcePath: string,
  options: IngestOptions = {},
): Promise<IngestResult> {
  if (!existsSync(sourcePath)) {
    throw new Error(`Scope doc not found: ${sourcePath}`);
  }

  const projectsRoot = options.projectsRoot ?? process.env.PROJECTS_ROOT ?? DEFAULT_PROJECTS_ROOT;
  const notifyTo = options.notifyTo ?? INTAKE_NOTIFY_TO;

  logger.info(`Ingesting scope doc: ${sourcePath}`);

  // 1. Read + parse
  const text = await readScopeDoc(sourcePath);
  if (!text.trim()) {
    throw new Error(`Scope doc is empty: ${sourcePath}`);
  }
  const filenameHint = basename(sourcePath);
  const { scope, costUsd } = await parseScope(text, { filenameHint });

  // 2. Resolve a non-clashing project folder
  const baseSlug = scope.projectSlug || slugify(scope.projectName);
  const { path: projectPath, slug: finalSlug } = resolveProjectPath(projectsRoot, baseSlug);
  if (finalSlug !== scope.projectSlug) {
    logger.info(`Slug "${scope.projectSlug}" was taken; using "${finalSlug}"`);
    scope.projectSlug = finalSlug;
  }

  // 3. Create the folder + scaffolding files
  mkdirSync(projectPath, { recursive: true });
  const claudeMdPath = join(projectPath, 'CLAUDE.md');
  const playbookPath = join(projectPath, 'PLAYBOOK.md');
  writeFileSync(claudeMdPath, buildClaudeMd(scope), 'utf8');
  writeFileSync(playbookPath, buildPlaybookMd(scope), 'utf8');

  // 4. Register in the projects repo. Notes carries a compact JSON
  //    summary so the dashboard / future tooling can read it without
  //    re-running the parser.
  const notes = JSON.stringify({
    service: scope.serviceType,
    complexity: scope.complexity,
    techStack: scope.techStack,
    specialists: scope.specialists,
    milestoneCount: scope.milestones.length,
    taskCount: scope.tasks.length,
    client: scope.client ?? null,
    estimatedDuration: scope.estimatedDuration ?? null,
    intakeSource: basename(sourcePath),
    intakeAt: new Date().toISOString(),
  });

  const project = createProject({
    name: scope.projectName,
    path: projectPath,
    claude_md_path: claudeMdPath,
    status: 'active',
    priority: 50,
    max_iterations_per_day: iterationCapFor(scope.complexity),
    model_tier_override: modelTierFor(scope.complexity),
    notes,
  });

  // 5. Archive source so the watcher won't see it again
  const archivedPath = archiveSource(sourcePath);

  const result: IngestResult = {
    sourcePath,
    archivedPath,
    scope,
    projectId: project.id,
    projectPath,
    claudeMdPath,
    playbookPath,
    emailSent: false,
    parseCostUsd: costUsd,
  };

  // 6. Email the operator
  if (!options.skipEmail) {
    const { subject, html } = buildConfirmationEmail(result, project);
    const messageId = await sendNotification(subject, html, notifyTo);
    result.emailSent = !!messageId;
    if (!result.emailSent) {
      logger.warn(
        `Confirmation email not sent (SMTP likely unconfigured). Project ${project.id} still created on disk and in registry.`,
      );
    }
  }

  logger.info(
    `Intake complete: ${scope.projectName} → ${projectPath} (project id=${project.id})`,
  );
  return result;
}

/**
 * Resolve the default inbox directory (~/inbox). Honors INBOX_DIR env
 * override for testing.
 */
export function getInboxDir(): string {
  return process.env.INBOX_DIR ?? join(homedir(), 'inbox');
}

/**
 * Ensure the inbox directory exists. Called by both the watcher and
 * the manual CLI script.
 */
export function ensureInboxDir(): string {
  const dir = getInboxDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.info(`Created inbox directory: ${dir}`);
  }
  const processed = join(dir, '.processed');
  if (!existsSync(processed)) mkdirSync(processed, { recursive: true });
  return dir;
}

const SCOPE_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.docx']);

/**
 * True when this filename matches a supported scope-doc type and isn't
 * something we should ignore (dotfile, archive directory).
 */
export function isScopeDocCandidate(filename: string): boolean {
  if (!filename || filename.startsWith('.')) return false;
  const ext = extname(filename).toLowerCase();
  return SCOPE_EXTENSIONS.has(ext);
}
