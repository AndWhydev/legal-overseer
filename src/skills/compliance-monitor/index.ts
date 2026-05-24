/**
 * Compliance Monitor skill — public surface.
 *
 * Surveys recent regulatory / legislative change and returns a list of
 * items relevant to the firm's matter types. Output lands in the
 * review queue tagged "regulatory_alert" so the responsible lawyer can
 * triage each item.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../../governance/index.js';
import { wrapWithDisclaimer } from '../../compliance/disclaimer.js';
import { getSkillDefinition } from '../registry.js';
import type { ComplianceMonitorResult, RegulatoryChange } from './types.js';

export type { ComplianceMonitorResult, RegulatoryChange, Urgency } from './types.js';

const logger = createSafeLogger('ComplianceMonitor');

const MODEL_MAP = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const;

export interface ComplianceMonitorInput {
  /** How many days back to scan for change. */
  scanWindowDays: number;
  /** Matter types the firm currently handles. */
  matterTypes: string[];
  /** Source URLs to focus the scan on. */
  sourceUrls?: string[];
  modelTier?: 'haiku' | 'sonnet' | 'opus';
}

export interface ComplianceMonitorOutput {
  result: ComplianceMonitorResult;
  resultMarkdown: string;
  costUsd?: number;
}

export async function runComplianceMonitor(
  input: ComplianceMonitorInput,
): Promise<ComplianceMonitorOutput> {
  const skill = getSkillDefinition('compliance_monitor');
  const model = MODEL_MAP[input.modelTier ?? skill.defaultModel];

  const userPrompt = `${skill.systemPrompt}

---

Scan window: last ${input.scanWindowDays} days
Matter types the firm handles: ${input.matterTypes.join(', ')}
${input.sourceUrls?.length ? `Focus sources:\n${input.sourceUrls.join('\n')}\n\n` : ''}

Produce a JSON array of regulatory change items relevant to the listed
matter types. Each item must include source, title, url,
datePublished, summary, matterTypesAffected, recommendedReview, and
urgency (immediate|this_quarter|monitoring_only).`;

  logger.info(`Scanning compliance change (last ${input.scanWindowDays}d, ${input.matterTypes.length} matter types)`);

  let raw = '';
  let costUsd: number | undefined;
  try {
    for await (const msg of query({
      prompt: userPrompt,
      options: {
        model,
        maxTurns: 4,
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
    logger.error(`Compliance scan failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let changes: RegulatoryChange[] = [];
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      changes = JSON.parse(arrMatch[0]) as RegulatoryChange[];
    } catch (err) {
      logger.warn(`Could not parse compliance JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const urgencyOrder: Record<RegulatoryChange['urgency'], number> = {
    immediate: 0,
    this_quarter: 1,
    monitoring_only: 2,
  };
  changes.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  const result: ComplianceMonitorResult = {
    scanWindowDays: input.scanWindowDays,
    changes,
    unverified: true,
    generatedAt: new Date().toISOString(),
  };

  return {
    result,
    resultMarkdown: wrapWithDisclaimer(renderComplianceMarkdown(result)),
    costUsd,
  };
}

function renderComplianceMarkdown(r: ComplianceMonitorResult): string {
  if (r.changes.length === 0) {
    return `# Compliance Monitor (last ${r.scanWindowDays} days)\n\nNo relevant regulatory change detected.`;
  }
  const items = r.changes
    .map(
      (c) =>
        `### [${c.urgency.toUpperCase()}] ${c.title}\n\n` +
        `**Source:** ${c.source} (${c.datePublished})\n\n` +
        `${c.url}\n\n` +
        `${c.summary}\n\n` +
        `**Matter types affected:** ${c.matterTypesAffected.join(', ')}\n\n` +
        `**Recommended review:** ${c.recommendedReview}`,
    )
    .join('\n\n---\n\n');

  return `# Compliance Monitor (last ${r.scanWindowDays} days)\n\n${items}\n`;
}
