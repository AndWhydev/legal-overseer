/**
 * 1.3 — Deposition and witness preparation.
 *
 * Reads an uploaded witness statement or deposition transcript (text
 * already extracted locally by uploads/extract.ts), runs Opus over the
 * redacted body, and produces a preparation brief containing likely
 * cross-examination questions, inconsistencies, areas to probe, and
 * documents needed.
 *
 * The brief flows through the review queue. Once approved it is
 * archived as a deposition_preps row attached to the matter.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { recordAiRun } from '../compliance/billing.js';
import { enqueueForReview } from '../compliance/reviewGate.js';
import { wrapWithDisclaimer } from '../compliance/disclaimer.js';
import { getMatterById } from '../db/repositories/matters.js';
import { getDocument, readDocumentText } from '../uploads/store.js';
import { callLlmWithRedaction } from './llm.js';

const logger = createSafeLogger('DepositionPrep');

export interface DepositionPrep {
  id: string;
  matter_id: string;
  witness_name: string;
  source_document_id: string | null;
  body_markdown: string;
  review_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface GenerateDepositionPrepInput {
  matterId: string;
  witnessName: string;
  sourceDocumentId: string;
  acting: string;
}

export async function generateDepositionPrep(
  input: GenerateDepositionPrepInput,
): Promise<DepositionPrep> {
  const startedAt = Date.now();
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);

  const doc = getDocument(matter.id, input.sourceDocumentId);
  if (!doc) throw new Error(`document ${input.sourceDocumentId} not found`);
  const text = readDocumentText(doc);
  if (!text) throw new Error(`document ${doc.id} has no extracted text — re-upload or install pdftotext`);

  const promptHeader = `You are an Australian litigation lawyer preparing your colleague to cross-examine the following witness.

Matter: ${matter.matter_number} — ${matter.title}
Witness: ${input.witnessName}
Source: ${doc.filename}

Produce a structured preparation brief in Markdown:

# Deposition / Cross-Examination Prep — ${input.witnessName}

## Likely cross-examination questions
- ...

## Inconsistencies detected in the statement
- ...

## Areas to probe further
- ...

## Supporting documents needed
- ...

## Suggested examination strategy
2-4 paragraphs.

Be specific. Cite paragraph numbers in the statement when relevant.
End the brief with the AI disclaimer block.`;

  const llm = await callLlmWithRedaction(matter.id, promptHeader, text, 'opus', 3.0);
  const body_markdown = wrapWithDisclaimer(
    llm.ok && llm.text
      ? llm.text
      : `Deposition prep failed: ${llm.error ?? 'no output'}`,
  );

  const review = enqueueForReview({
    matterId: matter.id,
    matterNumber: matter.matter_number,
    skillId: 'deposition_prep',
    outputKind: 'drafted_document',
    title: `Deposition prep — ${input.witnessName}`,
    bodyMarkdown: body_markdown,
    metadata: {
      kind: 'deposition_prep',
      witness_name: input.witnessName,
      source_document_id: input.sourceDocumentId,
      redactionCount: llm.redactionCount,
    },
    costUsd: llm.costUsd,
  });

  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO deposition_preps
       (id, matter_id, witness_name, source_document_id, body_markdown,
        review_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, matter.id, input.witnessName, input.sourceDocumentId, body_markdown, review.id, input.acting, now);

  if (llm.costUsd && llm.costUsd > 0) {
    recordAiRun({
      matterId: matter.id,
      skillId: 'deposition_prep',
      description: `Deposition prep: ${input.witnessName}`,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      costUsd: llm.costUsd,
      reviewId: review.id,
    });
  }

  appendLegalAudit({
    matterId: matter.id,
    actorId: input.acting,
    action: 'deposition.prep',
    detail: `Prep generated for ${input.witnessName}`,
    refTable: 'deposition_preps',
    refId: id,
    modelUsed: 'opus',
  });

  logger.info(`deposition prep for ${input.witnessName} on ${matter.matter_number}`);
  return getDepositionPrep(id) as DepositionPrep;
}

export function getDepositionPrep(id: string): DepositionPrep | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM deposition_preps WHERE id = ?').get(id) as
      | DepositionPrep
      | undefined) ?? null
  );
}

export function listMatterDepositionPreps(matterId: string): DepositionPrep[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM deposition_preps WHERE matter_id = ? ORDER BY created_at DESC`,
    )
    .all(matterId) as DepositionPrep[];
}
