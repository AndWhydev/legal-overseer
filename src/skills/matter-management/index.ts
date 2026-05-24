/**
 * Matter Management skill — public surface.
 *
 * Analyses a matter brief for deadlines, limitation periods, and SLAs.
 * Each finding is persisted into the deadlines table so the dashboard
 * can show a calendar view and the reminder scheduler can chase them.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../../governance/index.js';
import { wrapWithDisclaimer } from '../../compliance/disclaimer.js';
import { getSkillDefinition } from '../registry.js';
import {
  upsertDeadline,
  type Deadline,
} from '../../db/repositories/deadlines.js';
import type { DeadlineFinding, DeadlineType, MatterManagementResult } from './types.js';

export type { DeadlineFinding, DeadlineType, MatterManagementResult } from './types.js';

const logger = createSafeLogger('MatterManagement');

const MODEL_MAP = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const;

export interface MatterManagementInput {
  matterId: string;
  /** Free-text matter brief / dossier / event description. */
  brief: string;
  /** Today's date (YYYY-MM-DD) for consistent daysRemaining math. */
  asOf?: string;
  modelTier?: 'haiku' | 'sonnet' | 'opus';
}

export interface MatterManagementOutput {
  result: MatterManagementResult;
  resultMarkdown: string;
  persistedDeadlines: Deadline[];
  costUsd?: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ad = new Date(a).getTime();
  const bd = new Date(b).getTime();
  return Math.round((bd - ad) / (1000 * 60 * 60 * 24));
}

export async function runMatterManagement(
  input: MatterManagementInput,
): Promise<MatterManagementOutput> {
  const skill = getSkillDefinition('matter_management');
  const model = MODEL_MAP[input.modelTier ?? skill.defaultModel];
  const asOf = input.asOf ?? todayIso();

  const userPrompt = `${skill.systemPrompt}

---

Matter id: ${input.matterId}
As of (today's date): ${asOf}

Matter brief:
${input.brief}

Produce a JSON array of deadlines with shape:
[
  {
    "deadlineType": "limitation|court|procedural|internal_sla|client",
    "description": "...",
    "dueDate": "YYYY-MM-DD",
    "jurisdictionBasis": "...",
    "consequenceIfMissed": "...",
    "recommendedAction": "...",
    "reminderDraft": "..."
  }
]`;

  logger.info(`Managing matter ${input.matterId}`);

  let raw = '';
  let costUsd: number | undefined;
  try {
    for await (const msg of query({
      prompt: userPrompt,
      options: {
        model,
        maxTurns: 1,
        maxBudgetUsd: skill.maxBudgetUsd,
        allowedTools: skill.tools,
      },
    })) {
      if (typeof msg === 'object' && msg !== null && 'type' in msg && (msg as { type?: string }).type === 'result') {
        const m = msg as { result?: string; total_cost_usd?: number };
        raw = m.result ?? raw;
        costUsd = m.total_cost_usd ?? costUsd;
      }
    }
  } catch (err) {
    logger.error(`Matter management failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let findings: DeadlineFinding[] = [];
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]) as Array<Omit<DeadlineFinding, 'daysRemaining'>>;
      findings = parsed.map((p) => ({
        ...p,
        daysRemaining: daysBetween(asOf, p.dueDate),
      }));
    } catch (err) {
      logger.warn(`Could not parse deadlines JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  findings.sort((a, b) => a.daysRemaining - b.daysRemaining);

  const persistedDeadlines: Deadline[] = findings.map((f) =>
    upsertDeadline({
      matter_id: input.matterId,
      deadline_type: f.deadlineType,
      description: f.description,
      due_date: f.dueDate,
      jurisdiction_basis: f.jurisdictionBasis,
      consequence_if_missed: f.consequenceIfMissed,
      recommended_action: f.recommendedAction,
      reminder_draft: f.reminderDraft,
    }),
  );

  const result: MatterManagementResult = {
    matterId: input.matterId,
    deadlines: findings,
    mostUrgent: findings[0] ?? null,
    unverified: true,
    generatedAt: new Date().toISOString(),
  };

  return {
    result,
    resultMarkdown: wrapWithDisclaimer(renderManagementMarkdown(result)),
    persistedDeadlines,
    costUsd,
  };
}

function renderManagementMarkdown(r: MatterManagementResult): string {
  if (r.deadlines.length === 0) {
    return `# Matter Management — ${r.matterId}\n\nNo deadlines identified.`;
  }
  const rows = r.deadlines
    .map(
      (d) =>
        `- **${d.dueDate}** (${d.daysRemaining}d) — [${d.deadlineType}] ${d.description}\n` +
        `  - Basis: ${d.jurisdictionBasis}\n` +
        `  - If missed: ${d.consequenceIfMissed}\n` +
        `  - Action: ${d.recommendedAction}`,
    )
    .join('\n');

  return `# Matter Management — ${r.matterId}

**Most urgent:** ${r.mostUrgent ? `${r.mostUrgent.description} (${r.mostUrgent.daysRemaining}d)` : '_(none)_'}

## Deadlines

${rows}
`;
}
