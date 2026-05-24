/**
 * 1.7 — Plain English Explainer.
 *
 * "Explain to Client" — converts a legal document into plain English
 * that can be sent to the client after lawyer approval. The output
 * lands in the review queue as a draft client_email so the existing
 * outbound channel can ship it once the lawyer approves.
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

const logger = createSafeLogger('PlainEnglish');

export interface PlainEnglishExplainer {
  id: string;
  matter_id: string;
  source_document_id: string;
  body_markdown: string;
  review_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ExplainDocumentInput {
  matterId: string;
  sourceDocumentId: string;
  acting: string;
}

export async function explainDocument(input: ExplainDocumentInput): Promise<PlainEnglishExplainer> {
  const startedAt = Date.now();
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);
  const doc = getDocument(matter.id, input.sourceDocumentId);
  if (!doc) throw new Error(`document ${input.sourceDocumentId} not found`);
  const text = readDocumentText(doc);
  if (!text) throw new Error(`document ${doc.id} has no extracted text`);

  const promptHeader = `You are an Australian solicitor explaining a legal document to a client in plain English.

Matter: ${matter.matter_number} — ${matter.title}
Client: ${matter.client_name}
Source: ${doc.filename}

Write a plain-English explanation (Year 10 reading level) of the document.
Rules:
- No legal jargon. Where a defined term is unavoidable, give the
  client a one-sentence translation.
- Explain what each section means for the client in concrete terms.
- Highlight anything that requires client action or decision.
- Flag anything the client should be concerned about.
- Do NOT give legal advice — explain only.
- Do NOT recommend signing or refusing — that's the lawyer's call.

Structure:

# Plain-English explanation — ${doc.filename}

## What this document is

## What it means for you

## Things you need to do

## Things to be aware of

End with: "Please confirm receipt and ask any questions before you sign or act on this."`;

  const llm = await callLlmWithRedaction(matter.id, promptHeader, text, 'sonnet', 1.5);
  const body_markdown = wrapWithDisclaimer(
    llm.ok && llm.text
      ? `> **INTERNAL NOTE: This is a plain-English explanation, not legal advice.**\n\n${llm.text}`
      : `Plain-English explainer failed: ${llm.error ?? 'no output'}`,
  );

  const review = enqueueForReview({
    matterId: matter.id,
    matterNumber: matter.matter_number,
    skillId: 'plain_english',
    outputKind: 'client_email',
    title: `Plain-English explanation — ${doc.filename}`,
    bodyMarkdown: body_markdown,
    metadata: {
      kind: 'plain_english',
      source_document_id: input.sourceDocumentId,
      redactionCount: llm.redactionCount,
      to: matter.client_email ?? null,
    },
    costUsd: llm.costUsd,
  });

  const id = randomUUID();
  const now = new Date().toISOString();
  const db = getDatabase();
  db.prepare(
    `INSERT INTO plain_english_explainers
       (id, matter_id, source_document_id, body_markdown, review_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, matter.id, input.sourceDocumentId, body_markdown, review.id, input.acting, now);

  if (llm.costUsd && llm.costUsd > 0) {
    recordAiRun({
      matterId: matter.id,
      skillId: 'plain_english',
      description: `Plain-English explainer for ${doc.filename}`,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      costUsd: llm.costUsd,
      reviewId: review.id,
    });
  }

  appendLegalAudit({
    matterId: matter.id,
    actorId: input.acting,
    action: 'plain_english.generate',
    detail: doc.filename,
    refTable: 'plain_english_explainers',
    refId: id,
    modelUsed: 'sonnet',
  });

  logger.info(`plain-english for ${doc.filename} on ${matter.matter_number}`);
  return db
    .prepare('SELECT * FROM plain_english_explainers WHERE id = ?')
    .get(id) as PlainEnglishExplainer;
}

export function getPlainEnglishExplainer(id: string): PlainEnglishExplainer | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM plain_english_explainers WHERE id = ?').get(id) as
      | PlainEnglishExplainer
      | undefined) ?? null
  );
}

export function listMatterExplainers(matterId: string): PlainEnglishExplainer[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM plain_english_explainers WHERE matter_id = ? ORDER BY created_at DESC`,
    )
    .all(matterId) as PlainEnglishExplainer[];
}
