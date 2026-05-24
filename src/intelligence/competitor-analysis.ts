/**
 * 6.5 — Competitor analysis.
 *
 * Operator configures a list of competitor firms. Monthly the system
 * fetches publicly available signals (website, news mentions) and
 * Opus summarises notable developments. All data from publicly
 * available sources.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { callLlm } from './llm.js';

const logger = createSafeLogger('CompetitorAnalysis');

export interface Competitor {
  id: string;
  firm_name: string;
  website: string | null;
  linkedin_url: string | null;
  notes: string | null;
  active: number;
  created_at: string;
}

export interface CompetitorReport {
  id: string;
  competitor_id: string;
  period: string;
  body_markdown: string;
  observations_json: string | null;
  generated_at: string;
}

export function addCompetitor(input: { firmName: string; website?: string; linkedinUrl?: string; notes?: string; acting: string }): Competitor {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO competitors (id, firm_name, website, linkedin_url, notes)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.firmName, input.website ?? null, input.linkedinUrl ?? null, input.notes ?? null);
  appendLegalAudit({
    matterId: null,
    actorId: input.acting,
    action: 'competitor.add',
    detail: input.firmName,
    refTable: 'competitors',
    refId: id,
  });
  return db.prepare('SELECT * FROM competitors WHERE id = ?').get(id) as Competitor;
}

export function listCompetitors(): Competitor[] {
  const db = getDatabase();
  return db.prepare(`SELECT * FROM competitors WHERE active = 1 ORDER BY firm_name`).all() as Competitor[];
}

export function deactivateCompetitor(id: string, acting: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE competitors SET active = 0 WHERE id = ?`).run(id);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'competitor.deactivate',
    detail: id,
    refTable: 'competitors',
    refId: id,
  });
}

async function fetchPublicSnippet(url: string): Promise<string> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    const res = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'LegalOverseer/1.0 (+https://legaloverseer.com.au) Competitor Snapshot' } });
    clearTimeout(timer);
    if (!res.ok) return `[HTTP ${res.status}]`;
    const text = await res.text();
    return text.slice(0, 5000);
  } catch (err) {
    return `[fetch failed: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

export async function generateCompetitorReport(competitorId: string, period: string): Promise<CompetitorReport> {
  const db = getDatabase();
  const c = db.prepare('SELECT * FROM competitors WHERE id = ?').get(competitorId) as Competitor | undefined;
  if (!c) throw new Error(`competitor ${competitorId} not found`);

  const sources: { kind: string; url: string; snippet: string }[] = [];
  if (c.website) sources.push({ kind: 'website', url: c.website, snippet: await fetchPublicSnippet(c.website) });
  if (c.linkedin_url) sources.push({ kind: 'linkedin', url: c.linkedin_url, snippet: await fetchPublicSnippet(c.linkedin_url) });

  const prompt = `You are summarising publicly available signals about a competing Australian law firm.

Competitor: ${c.firm_name}
Period: ${period}

Source extracts (all from publicly available pages):
${sources.map((s) => `\n## ${s.kind} — ${s.url}\n${s.snippet}`).join('\n')}

Produce a Markdown report with:
- Notable developments (hires, departures, office changes, new practice areas)
- Public client wins or court appearances visible from the source
- Implications for our firm

Mark anything speculative explicitly. All facts must trace back to the source extracts above.`;

  const llm = await callLlm({ prompt, model: 'sonnet', maxBudgetUsd: 1.0 });
  const body = llm.ok && llm.text
    ? llm.text
    : `# Competitor report — ${c.firm_name}\n\nReport generation failed: ${llm.error ?? 'no output'}`;

  const id = randomUUID();
  db.prepare(
    `INSERT INTO competitor_reports (id, competitor_id, period, body_markdown, observations_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, c.id, period, body, JSON.stringify(sources));

  appendLegalAudit({
    matterId: null,
    actorId: 'competitor-analysis',
    action: 'competitor.report',
    detail: `${c.firm_name} — ${period}`,
    refTable: 'competitor_reports',
    refId: id,
    modelUsed: 'sonnet',
    metadata: { costUsd: llm.costUsd ?? null },
  });
  logger.info(`competitor report for ${c.firm_name} (${period})`);
  return db.prepare('SELECT * FROM competitor_reports WHERE id = ?').get(id) as CompetitorReport;
}

export function listReports(competitorId?: string): CompetitorReport[] {
  const db = getDatabase();
  if (competitorId) {
    return db
      .prepare(`SELECT * FROM competitor_reports WHERE competitor_id = ? ORDER BY period DESC`)
      .all(competitorId) as CompetitorReport[];
  }
  return db
    .prepare(`SELECT * FROM competitor_reports ORDER BY generated_at DESC LIMIT 50`)
    .all() as CompetitorReport[];
}
