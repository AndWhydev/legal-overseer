/**
 * 6.4 — Monthly market intelligence reports.
 *
 * First Monday of each month, the compliance-monitor agent compiles a
 * report covering: significant court decisions, regulatory changes,
 * Law Society guidance, and market trends. Personalised per lawyer
 * (filtered by their subscribed practice areas).
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { recordAiRun } from '../compliance/billing.js';
import { searchAustLii } from '../integrations/austlii/search.js';
import { callLlm } from './llm.js';

const logger = createSafeLogger('MarketIntel');

export interface MarketReport {
  id: string;
  period: string;
  body_markdown: string;
  sections_json: string | null;
  generated_at: string;
}

export interface MarketReportSection {
  key: string;
  title: string;
  items: { title: string; url: string; summary: string }[];
}

const REPORT_TOPICS: { key: string; title: string; queries: string[] }[] = [
  { key: 'court_decisions', title: 'Significant Court Decisions', queries: ['recent High Court decision', 'recent NSW Court of Appeal decision', 'recent Federal Court decision'] },
  { key: 'regulatory_changes', title: 'Regulatory Changes', queries: ['ASIC regulatory guide', 'APRA guidance', 'ACCC consumer law'] },
  { key: 'law_society', title: 'Law Society Guidance', queries: ['Law Society of NSW practice note', 'Law Council of Australia'] },
];

async function buildSection(section: typeof REPORT_TOPICS[number]): Promise<MarketReportSection> {
  const items: { title: string; url: string; summary: string }[] = [];
  for (const q of section.queries) {
    const r = await searchAustLii({ query: q, limit: 3 });
    for (const hit of r.results) {
      items.push({ title: hit.citation || hit.title, url: hit.url, summary: hit.snippet });
    }
  }
  return { key: section.key, title: section.title, items };
}

export async function generateMarketReport(period: string): Promise<MarketReport> {
  const startedAt = Date.now();
  const sections: MarketReportSection[] = [];
  for (const topic of REPORT_TOPICS) sections.push(await buildSection(topic));

  // Ask Opus to summarise the findings into a partner-ready briefing.
  const prompt = `You are summarising the month's legal developments for partners at an Australian law firm.

Period: ${period}

Source items (AustLII / regulator hits):
${sections.map((s) => `\n## ${s.title}\n${s.items.map((i) => `- ${i.title} — ${i.url}\n  ${i.summary.slice(0, 200)}`).join('\n')}`).join('\n')}

Produce a Markdown briefing with sections matching the topics above.
For each item produce a 1-2 sentence summary aimed at partners. End
with a one-paragraph "What this means for the firm" outlook.`;

  const llm = await callLlm({ prompt, model: 'sonnet', maxBudgetUsd: 2.5 });
  const body = llm.ok && llm.text
    ? llm.text
    : `# Market intelligence — ${period}\n\nReport generation failed: ${llm.error ?? 'no output'}`;

  const id = randomUUID();
  const db = getDatabase();
  db.prepare(
    `INSERT INTO market_intelligence_reports (id, period, body_markdown, sections_json, generated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, period, body, JSON.stringify(sections), new Date().toISOString());

  if (llm.costUsd && llm.costUsd > 0) {
    // No matter to attribute — record at firm level via a synthetic matter_id is not possible;
    // we audit instead so the AI cost is visible in the firm-wide audit log.
    appendLegalAudit({
      matterId: null,
      actorId: 'market-intelligence',
      action: 'ai_cost',
      detail: `market intel ${period}: AUD ${(llm.costUsd * 1.5).toFixed(2)}`,
      refTable: 'market_intelligence_reports',
      refId: id,
      metadata: { costUsd: llm.costUsd },
    });
    // Suppress unused-import warning while keeping the import for future per-matter generation.
    void recordAiRun;
  }

  appendLegalAudit({
    matterId: null,
    actorId: 'market-intelligence',
    action: 'market_intel.generate',
    detail: period,
    refTable: 'market_intelligence_reports',
    refId: id,
    modelUsed: 'sonnet',
  });

  logger.info(`market intelligence report for ${period}: ${(body.length / 1024).toFixed(1)}kb in ${Date.now() - startedAt}ms`);
  return db.prepare('SELECT * FROM market_intelligence_reports WHERE id = ?').get(id) as MarketReport;
}

export function listReports(limit = 24): MarketReport[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM market_intelligence_reports ORDER BY period DESC LIMIT ?`)
    .all(limit) as MarketReport[];
}

export function getReport(id: string): MarketReport | null {
  const db = getDatabase();
  return (
    (db.prepare(`SELECT * FROM market_intelligence_reports WHERE id = ?`).get(id) as
      | MarketReport
      | undefined) ?? null
  );
}

/**
 * Filter a report's sections by practice area — used to personalise
 * the weekly intelligence briefing per lawyer.
 */
export function reportSectionsForPracticeAreas(report: MarketReport, areas: string[]): MarketReportSection[] {
  if (!report.sections_json) return [];
  try {
    const sections = JSON.parse(report.sections_json) as MarketReportSection[];
    if (!areas.length) return sections;
    return sections.filter((s) =>
      areas.some((a) => s.title.toLowerCase().includes(a.toLowerCase())),
    );
  } catch {
    return [];
  }
}
