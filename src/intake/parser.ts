/**
 * Scope-doc parser.
 *
 * Reads a .md or .docx file dropped into the inbox, feeds its text to
 * Opus with a strict JSON schema, and returns a ParsedScope.
 *
 * Tolerant of imperfect doc structure: the prompt instructs Opus to
 * infer reasonable defaults (e.g. complexity, specialists) when the
 * doc doesn't say. We post-validate to make sure service type +
 * specialist slugs are members of our canonical sets.
 */

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { MODELS } from '../agent/models.js';
import { createSafeLogger } from '../governance/index.js';
import { extractTextFromDocx } from './docx.js';
import {
  SERVICE_TYPES,
  isServiceType,
  servicesPromptBlock,
  type ServiceType,
} from './services.js';
import {
  SPECIALIST_AGENTS,
  isSpecialistAgent,
  specialistsPromptBlock,
  type SpecialistAgent,
} from './specialists.js';
import type { Complexity, ParsedScope, ScopeMilestone, ScopeTask } from './types.js';

const logger = createSafeLogger('IntakeParser');

const PARSER_BUDGET_USD = 0.5;
const COMPLEXITY_VALUES: Complexity[] = ['simple', 'standard', 'complex', 'epic'];

/**
 * Read a scope doc from disk regardless of extension and return its
 * plain-text body. Only .md / .markdown / .txt and .docx are supported.
 */
export async function readScopeDoc(path: string): Promise<string> {
  const ext = extname(path).toLowerCase();
  if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    return (await readFile(path, 'utf8')).trim();
  }
  if (ext === '.docx') {
    return await extractTextFromDocx(path);
  }
  throw new Error(`Unsupported scope doc extension: ${ext} (${path})`);
}

const PARSER_SYSTEM_PROMPT = `You are the BitBit Scope Intake parser.

Given a free-form scope document (Markdown or Word), produce ONE JSON object that classifies the engagement against BitBit's fixed service catalog and breaks it down into actionable structure for the overseer.

VALID service types — pick exactly one slug:
{SERVICES_BLOCK}

VALID specialist agents — pick any subset (1–6 is typical):
{SPECIALISTS_BLOCK}

Rules:
- Infer sensible defaults when the doc is sparse — never refuse, never leave required fields empty.
- projectName: extract from the document content (title, headings, "Project:" line). If only the filename is informative, fall back to it. Strip generic boilerplate like "Scope Document for".
- projectSlug: lowercase, hyphenated, ASCII only, no punctuation, no leading digits if avoidable. Max ~40 chars.
- summary: one declarative sentence ≤140 chars suitable for a dashboard row.
- serviceType: best single match from the legal slug list above.
- techStack: concrete labels mentioned or strongly implied (e.g. "Next.js", "Postgres", "Solidity", "AWS", "Stripe"). 3–10 items typical.
- milestones: 3–7 logical chunks of work. Each has title + description; "target" only if the doc gives a date/week.
- tasks: 5–20 specific, actionable, sized for one worker cycle. Title is imperative ("Set up Supabase auth"). Attach a milestone title when obvious. Attach an owner only when one specialist clearly fits.
- acceptanceCriteria: 3–10 testable conditions the operator will judge "done" by.
- complexity: simple | standard | complex | epic
    simple   = a few hours of focused work
    standard = a sprint of 1–2 weeks
    complex  = a multi-sprint build, multiple specialists, integrations
    epic     = a multi-month programme with several workstreams
- specialists: only slugs from the legal list. Order by descending importance.
- estimatedDuration: short phrase from the doc (e.g. "4–6 weeks", "Q3 2026"). Omit if doc doesn't say.
- client: stakeholder/company name if the doc names one. Omit if unclear.
- notes: 1–3 short sentences flagging assumptions or gaps you had to fill in.

Output: ONE JSON object, no surrounding prose, no markdown fences. Schema:
{
  "projectName": "string",
  "projectSlug": "string",
  "summary": "string",
  "serviceType": "<one of the slugs above>",
  "techStack": ["string", ...],
  "milestones": [{"title":"string","description":"string","target":"string?"}, ...],
  "tasks": [{"title":"string","milestone":"string?","owner":"<specialist slug>?"}, ...],
  "acceptanceCriteria": ["string", ...],
  "complexity": "simple|standard|complex|epic",
  "specialists": ["<specialist slug>", ...],
  "estimatedDuration": "string?",
  "client": "string?",
  "notes": "string?"
}`;

function buildSystemPrompt(): string {
  return PARSER_SYSTEM_PROMPT
    .replace('{SERVICES_BLOCK}', servicesPromptBlock())
    .replace('{SPECIALISTS_BLOCK}', specialistsPromptBlock());
}

function extractJson(raw: string): unknown | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Normalise a string into a filesystem-safe, lowercase, hyphenated slug.
 * Used both to clean up whatever the LLM returned for projectSlug and
 * as a fallback when the LLM gives us garbage.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled-project';
}

function ensureArrayOfStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function normaliseMilestones(v: unknown): ScopeMilestone[] {
  if (!Array.isArray(v)) return [];
  const out: ScopeMilestone[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const description = typeof obj.description === 'string' ? obj.description.trim() : '';
    if (!title) continue;
    out.push({
      title,
      description,
      target: typeof obj.target === 'string' && obj.target.trim() ? obj.target.trim() : undefined,
    });
  }
  return out;
}

function normaliseTasks(v: unknown): ScopeTask[] {
  if (!Array.isArray(v)) return [];
  const out: ScopeTask[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    if (!title) continue;
    const owner = typeof obj.owner === 'string' && isSpecialistAgent(obj.owner) ? obj.owner : undefined;
    out.push({
      title,
      milestone: typeof obj.milestone === 'string' && obj.milestone.trim() ? obj.milestone.trim() : undefined,
      owner,
    });
  }
  return out;
}

function normaliseSpecialists(v: unknown): SpecialistAgent[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<SpecialistAgent>();
  for (const item of v) {
    if (typeof item === 'string' && isSpecialistAgent(item)) seen.add(item);
  }
  return Array.from(seen);
}

function normaliseComplexity(v: unknown): Complexity {
  if (typeof v === 'string' && (COMPLEXITY_VALUES as string[]).includes(v)) {
    return v as Complexity;
  }
  return 'standard';
}

function normaliseServiceType(v: unknown, hint: string): ServiceType {
  if (typeof v === 'string' && isServiceType(v)) return v;
  // Light salvage: try matching by basename of slug
  if (typeof v === 'string') {
    const cleaned = v.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (isServiceType(cleaned)) return cleaned;
  }
  logger.warn(
    `Parser returned unknown serviceType "${String(v)}" for "${hint}" — defaulting to custom_app`,
  );
  return 'custom_app';
}

export interface ParseScopeOptions {
  /** Optional filename hint so the parser can fall back to it for naming */
  filenameHint?: string;
}

export interface ParseScopeOutcome {
  scope: ParsedScope;
  costUsd?: number;
}

/**
 * Send the scope text to Opus and return a fully-validated ParsedScope.
 */
export async function parseScope(
  scopeText: string,
  options: ParseScopeOptions = {},
): Promise<ParseScopeOutcome> {
  const filename = options.filenameHint ?? 'scope.md';

  const userPrompt = `${buildSystemPrompt()}\n\n---\n\nSource filename: ${filename}\n\nSource document:\n${scopeText.slice(0, 60_000)}`;

  let raw = '';
  let costUsd: number | undefined;

  for await (const msg of query({
    prompt: userPrompt,
    options: {
      model: MODELS.opus,
      maxTurns: 1,
      maxBudgetUsd: PARSER_BUDGET_USD,
    },
  })) {
    const m = msg as { type?: string; subtype?: string; result?: string; total_cost_usd?: number };
    if (m.type === 'result' && m.subtype === 'success' && m.result) raw = m.result;
    if (m.type === 'result' && typeof m.total_cost_usd === 'number') costUsd = m.total_cost_usd;
  }

  if (!raw) throw new Error('Scope parser returned no result from Opus');

  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Scope parser response was not parseable JSON. First 400 chars: ${raw.slice(0, 400)}`);
  }

  const obj = parsed as Record<string, unknown>;

  // Derive a name even if the model omitted it
  const fallbackName = basename(filename, extname(filename)).replace(/[-_]+/g, ' ').trim() || 'Untitled Project';
  const projectName = typeof obj.projectName === 'string' && obj.projectName.trim()
    ? obj.projectName.trim()
    : fallbackName;

  const projectSlug = (() => {
    const candidate = typeof obj.projectSlug === 'string' ? obj.projectSlug : '';
    const slug = slugify(candidate || projectName);
    return slug;
  })();

  const serviceType = normaliseServiceType(obj.serviceType, projectName);

  const scope: ParsedScope = {
    projectName,
    projectSlug,
    summary: (typeof obj.summary === 'string' && obj.summary.trim()) ? obj.summary.trim().slice(0, 280) : projectName,
    serviceType,
    techStack: ensureArrayOfStrings(obj.techStack).slice(0, 20),
    milestones: normaliseMilestones(obj.milestones),
    tasks: normaliseTasks(obj.tasks),
    acceptanceCriteria: ensureArrayOfStrings(obj.acceptanceCriteria).slice(0, 20),
    complexity: normaliseComplexity(obj.complexity),
    specialists: normaliseSpecialists(obj.specialists),
    estimatedDuration: typeof obj.estimatedDuration === 'string' && obj.estimatedDuration.trim()
      ? obj.estimatedDuration.trim()
      : undefined,
    client: typeof obj.client === 'string' && obj.client.trim() ? obj.client.trim() : undefined,
    notes: typeof obj.notes === 'string' && obj.notes.trim() ? obj.notes.trim() : undefined,
  };

  // Guarantee we always have at least one specialist; default by service.
  if (scope.specialists.length === 0) {
    scope.specialists = defaultSpecialistsForService(scope.serviceType);
  }

  logger.info(
    `Parsed scope: "${scope.projectName}" (${scope.serviceType}, ${scope.complexity}, ${scope.specialists.length} specialists)`,
  );

  return { scope, costUsd };
}

/**
 * Sensible specialist defaults per service type, used only when Opus
 * forgets to populate the field.
 */
function defaultSpecialistsForService(s: ServiceType): SpecialistAgent[] {
  switch (s) {
    case 'react_nextjs':
    case 'custom_saas':
    case 'custom_app':
      return ['frontend_engineer', 'backend_engineer'];
    case 'flutter':
      return ['mobile_engineer'];
    case 'api_development':
      return ['backend_engineer'];
    case 'legacy_modernisation':
      return ['fullstack_engineer', 'devops_engineer'];
    case 'llm_integration':
    case 'rag_knowledge_base':
    case 'ai_chatbot':
      return ['ai_engineer', 'backend_engineer'];
    case 'data_analytics':
      return ['data_engineer'];
    case 'workflow_automation':
      return ['backend_engineer'];
    case 'cloud_devops':
    case 'deployment':
      return ['devops_engineer'];
    case 'cybersecurity':
      return ['security_engineer'];
    case 'database_architecture':
      return ['database_engineer'];
    case 'smart_contracts':
    case 'defi_platform':
    case 'nft_marketplace':
      return ['blockchain_engineer'];
    case 'qa_testing':
      return ['qa_engineer'];
    case 'seo_backlinks':
      return ['seo_specialist'];
    default:
      return ['fullstack_engineer'];
  }
}

// Re-exports so callers can pull everything from intake/parser
export { SERVICE_TYPES, SPECIALIST_AGENTS };
