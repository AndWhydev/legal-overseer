/**
 * 1.4 — Contract Negotiation Tracker.
 *
 * Tracks each contract version uploaded against a matter. Two
 * consecutive versions are diffed clause-by-clause; an Opus run
 * produces a redline summary, concessions, and gains. The cumulative
 * negotiation summary is updated after each version is added.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { recordAiRun } from '../compliance/billing.js';
import { getMatterById } from '../db/repositories/matters.js';
import { getDocument, readDocumentText } from '../uploads/store.js';
import { callLlmWithRedaction, extractJson } from './llm.js';

const logger = createSafeLogger('NegotiationTracker');

export interface ContractNegotiation {
  id: string;
  matter_id: string;
  contract_name: string;
  status: 'active' | 'executed' | 'abandoned';
  client_position: string | null;
  opposing_position: string | null;
  summary_markdown: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractVersion {
  id: string;
  negotiation_id: string;
  version_number: number;
  document_id: string;
  uploaded_by: string | null;
  from_party: string | null;
  notes: string | null;
  changes_summary: string | null;
  added_clauses_json: string | null;
  removed_clauses_json: string | null;
  modified_clauses_json: string | null;
  uploaded_at: string;
}

export interface DiffOutput {
  changesSummary?: string;
  addedClauses?: string[];
  removedClauses?: string[];
  modifiedClauses?: { clause: string; change: string }[];
  concessions?: string[];
  gains?: string[];
}

export interface CreateNegotiationInput {
  matterId: string;
  contractName: string;
  clientPosition?: string;
  opposingPosition?: string;
  acting: string;
}

export function createNegotiation(input: CreateNegotiationInput): ContractNegotiation {
  const db = getDatabase();
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO contract_negotiations
       (id, matter_id, contract_name, status, client_position, opposing_position, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
  ).run(
    id,
    matter.id,
    input.contractName,
    input.clientPosition ?? null,
    input.opposingPosition ?? null,
    now,
    now,
  );
  appendLegalAudit({
    matterId: matter.id,
    actorId: input.acting,
    action: 'negotiation.create',
    detail: input.contractName,
    refTable: 'contract_negotiations',
    refId: id,
  });
  return getNegotiation(id) as ContractNegotiation;
}

export function getNegotiation(id: string): ContractNegotiation | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM contract_negotiations WHERE id = ?').get(id) as
      | ContractNegotiation
      | undefined) ?? null
  );
}

export function listMatterNegotiations(matterId: string): ContractNegotiation[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM contract_negotiations WHERE matter_id = ? ORDER BY created_at DESC`,
    )
    .all(matterId) as ContractNegotiation[];
}

export function listVersions(negotiationId: string): ContractVersion[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM contract_versions WHERE negotiation_id = ? ORDER BY version_number ASC`,
    )
    .all(negotiationId) as ContractVersion[];
}

export interface AddVersionInput {
  negotiationId: string;
  documentId: string;
  uploadedBy: string;
  fromParty: 'client' | 'opposing' | 'other';
  notes?: string;
}

export async function addContractVersion(input: AddVersionInput): Promise<ContractVersion> {
  const startedAt = Date.now();
  const negotiation = getNegotiation(input.negotiationId);
  if (!negotiation) throw new Error(`negotiation ${input.negotiationId} not found`);
  const matter = getMatterById(negotiation.matter_id);
  if (!matter) throw new Error(`matter ${negotiation.matter_id} not found`);

  const versions = listVersions(input.negotiationId);
  const nextVersion = versions.length + 1;
  const id = randomUUID();
  const now = new Date().toISOString();

  const newDoc = getDocument(matter.id, input.documentId);
  if (!newDoc) throw new Error(`document ${input.documentId} not found`);
  const newText = readDocumentText(newDoc) ?? '';

  let changes_summary: string | null = null;
  let added_clauses_json: string | null = null;
  let removed_clauses_json: string | null = null;
  let modified_clauses_json: string | null = null;
  let costUsd: number | undefined;

  if (versions.length >= 1) {
    const prev = versions[versions.length - 1];
    const prevDoc = getDocument(matter.id, prev.document_id);
    const prevText = prevDoc ? readDocumentText(prevDoc) ?? '' : '';

    const promptHeader = `You are an Australian commercial lawyer comparing two consecutive drafts of a contract.

Previous version: v${prev.version_number}, uploaded ${prev.uploaded_at}, from ${prev.from_party ?? 'unknown'}.
New version: v${nextVersion}, from ${input.fromParty}.

Produce a JSON object describing the changes:
{
  "changesSummary": "1-3 sentences",
  "addedClauses": ["...", "..."],
  "removedClauses": ["...", "..."],
  "modifiedClauses": [{ "clause": "name", "change": "what changed" }],
  "concessions": ["concessions made by ${input.fromParty === 'client' ? 'the client' : 'the opposing party'}"],
  "gains": ["gains by ${input.fromParty === 'client' ? 'the client' : 'the opposing party'}"]
}`;

    const combined = `PREVIOUS VERSION:\n${prevText.slice(0, 30000)}\n\n---\n\nNEW VERSION:\n${newText.slice(0, 30000)}`;
    const llm = await callLlmWithRedaction(matter.id, promptHeader, combined, 'sonnet', 3.0);
    costUsd = llm.costUsd;
    const parsed = extractJson<DiffOutput>(llm.text);
    if (parsed) {
      changes_summary = parsed.changesSummary ?? null;
      added_clauses_json = parsed.addedClauses ? JSON.stringify(parsed.addedClauses) : null;
      removed_clauses_json = parsed.removedClauses ? JSON.stringify(parsed.removedClauses) : null;
      modified_clauses_json = parsed.modifiedClauses ? JSON.stringify(parsed.modifiedClauses) : null;
    } else {
      changes_summary = `Could not parse diff: ${llm.text.slice(0, 500)}`;
    }
  } else {
    changes_summary = 'Initial version uploaded.';
  }

  const db = getDatabase();
  db.prepare(
    `INSERT INTO contract_versions
       (id, negotiation_id, version_number, document_id, uploaded_by, from_party,
        notes, changes_summary, added_clauses_json, removed_clauses_json,
        modified_clauses_json, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.negotiationId,
    nextVersion,
    input.documentId,
    input.uploadedBy,
    input.fromParty,
    input.notes ?? null,
    changes_summary,
    added_clauses_json,
    removed_clauses_json,
    modified_clauses_json,
    now,
  );

  db.prepare(`UPDATE contract_negotiations SET updated_at = ? WHERE id = ?`).run(
    now,
    input.negotiationId,
  );

  if (costUsd && costUsd > 0) {
    recordAiRun({
      matterId: matter.id,
      skillId: 'negotiation_tracker',
      description: `Diff v${nextVersion - 1} → v${nextVersion} of ${negotiation.contract_name}`,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      costUsd,
    });
  }

  appendLegalAudit({
    matterId: matter.id,
    actorId: input.uploadedBy,
    action: 'negotiation.version_added',
    detail: `v${nextVersion} from ${input.fromParty}`,
    refTable: 'contract_versions',
    refId: id,
  });

  logger.info(`negotiation ${negotiation.contract_name}: v${nextVersion} added from ${input.fromParty}`);

  await rebuildNegotiationSummary(input.negotiationId);
  return db.prepare('SELECT * FROM contract_versions WHERE id = ?').get(id) as ContractVersion;
}

async function rebuildNegotiationSummary(negotiationId: string): Promise<void> {
  const versions = listVersions(negotiationId);
  if (!versions.length) return;
  const negotiation = getNegotiation(negotiationId);
  if (!negotiation) return;

  const lines: string[] = [`# Negotiation summary — ${negotiation.contract_name}`, ''];
  for (const v of versions) {
    lines.push(`## Version ${v.version_number} (from ${v.from_party ?? 'unknown'}, ${v.uploaded_at.slice(0, 10)})`);
    lines.push(v.changes_summary ?? '_no summary_');
    if (v.added_clauses_json) {
      const added = JSON.parse(v.added_clauses_json) as string[];
      if (added.length) lines.push(`**Added:** ${added.join('; ')}`);
    }
    if (v.removed_clauses_json) {
      const removed = JSON.parse(v.removed_clauses_json) as string[];
      if (removed.length) lines.push(`**Removed:** ${removed.join('; ')}`);
    }
    if (v.modified_clauses_json) {
      const modified = JSON.parse(v.modified_clauses_json) as { clause: string; change: string }[];
      if (modified.length) {
        for (const m of modified) lines.push(`- _${m.clause}_: ${m.change}`);
      }
    }
    lines.push('');
  }
  const summary = lines.join('\n');
  const db = getDatabase();
  db.prepare(`UPDATE contract_negotiations SET summary_markdown = ? WHERE id = ?`).run(
    summary,
    negotiationId,
  );
}

export function setNegotiationStatus(
  id: string,
  status: 'active' | 'executed' | 'abandoned',
  acting: string,
): ContractNegotiation {
  const db = getDatabase();
  db.prepare(`UPDATE contract_negotiations SET status = ?, updated_at = ? WHERE id = ?`).run(
    status,
    new Date().toISOString(),
    id,
  );
  const fresh = getNegotiation(id);
  if (!fresh) throw new Error(`negotiation ${id} disappeared`);
  appendLegalAudit({
    matterId: fresh.matter_id,
    actorId: acting,
    action: `negotiation.${status}`,
    detail: fresh.contract_name,
    refTable: 'contract_negotiations',
    refId: id,
  });
  return fresh;
}
