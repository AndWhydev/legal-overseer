/**
 * 2.3 — Automatic document classification.
 *
 * Runs on every upload. Haiku classifies the first 2k characters into
 * document_type / practice_area / urgency, and extracts any explicit
 * deadlines (dates). User can correct the classification, which feeds
 * back as labelled data the next time we retune the prompt.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { recordAiRun } from '../compliance/billing.js';
import { getDocument, readDocumentText } from '../uploads/store.js';
import { upsertDeadline } from '../db/repositories/deadlines.js';
import { callLlmWithRedaction, extractJson } from '../intelligence/llm.js';

const logger = createSafeLogger('DocClassifier');

export type Urgency = 'routine' | 'priority' | 'urgent';

export interface DocumentClassification {
  document_id: string;
  matter_id: string | null;
  document_type: string;
  practice_area: string | null;
  suggested_matter_id: string | null;
  urgency: Urgency | null;
  has_deadlines: number;
  extracted_deadlines_json: string | null;
  confidence: number;
  classified_by: string;
  corrected_by: string | null;
  corrected_at: string | null;
  classified_at: string;
}

interface ModelOutput {
  documentType?: string;
  practiceArea?: string;
  urgency?: Urgency;
  hasDeadlines?: boolean;
  deadlines?: { dueDate: string; description: string }[];
  confidence?: number;
  suggestedMatterId?: string | null;
}

export interface ClassifyDocumentInput {
  documentId: string;
  matterId: string;
  acting: string;
}

export async function classifyDocument(
  input: ClassifyDocumentInput,
): Promise<DocumentClassification> {
  const startedAt = Date.now();
  const doc = getDocument(input.matterId, input.documentId);
  if (!doc) throw new Error(`document ${input.documentId} not found`);
  const text = readDocumentText(doc) ?? '';

  const promptHeader = `You classify legal documents for an Australian law firm.

Source: ${doc.filename}

Respond with strict JSON of shape:
{
  "documentType": "contract|court_document|correspondence|evidence|witness_statement|invoice|memo|legislation|other",
  "practiceArea": "commercial|family|property|litigation|estates|employment|criminal|immigration|regulatory|other",
  "urgency": "routine|priority|urgent",
  "hasDeadlines": true|false,
  "deadlines": [{"dueDate": "YYYY-MM-DD", "description": "..."}],
  "confidence": 0.0-1.0
}`;

  const llm = await callLlmWithRedaction(
    input.matterId,
    promptHeader,
    text.slice(0, 2000),
    'haiku',
    0.2,
  );

  const parsed = extractJson<ModelOutput>(llm.text) ?? {};
  const documentType = parsed.documentType ?? 'other';
  const practiceArea = parsed.practiceArea ?? null;
  const urgency = parsed.urgency ?? null;
  const has_deadlines = parsed.hasDeadlines && parsed.deadlines && parsed.deadlines.length ? 1 : 0;
  const extracted_deadlines_json = parsed.deadlines && parsed.deadlines.length
    ? JSON.stringify(parsed.deadlines)
    : null;
  const confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));
  const now = new Date().toISOString();

  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO document_classifications
       (document_id, matter_id, document_type, practice_area,
        suggested_matter_id, urgency, has_deadlines,
        extracted_deadlines_json, confidence, classified_by,
        corrected_by, corrected_at, classified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
  ).run(
    input.documentId,
    input.matterId,
    documentType,
    practiceArea,
    null,
    urgency,
    has_deadlines,
    extracted_deadlines_json,
    confidence,
    'auto:haiku',
    now,
  );

  // Create deadlines automatically when they were extracted.
  if (parsed.deadlines && parsed.deadlines.length) {
    for (const d of parsed.deadlines) {
      try {
        upsertDeadline({
          matter_id: input.matterId,
          deadline_type: 'procedural',
          description: d.description,
          due_date: d.dueDate,
          jurisdiction_basis: `Extracted from ${doc.filename}`,
          recommended_action: 'Review by responsible lawyer',
        });
      } catch (err) {
        logger.warn(
          `could not create deadline from doc ${doc.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  if (llm.costUsd && llm.costUsd > 0) {
    recordAiRun({
      matterId: input.matterId,
      skillId: 'document_classifier',
      description: `Classified ${doc.filename}`,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      costUsd: llm.costUsd,
    });
  }

  appendLegalAudit({
    matterId: input.matterId,
    actorId: input.acting,
    action: 'document.classify',
    detail: `${doc.filename} → ${documentType} / ${practiceArea ?? 'n/a'} (conf=${confidence.toFixed(2)})`,
    refTable: 'documents',
    refId: doc.id,
    modelUsed: 'haiku',
    metadata: { documentType, practiceArea, urgency, has_deadlines },
  });

  logger.info(`classified ${doc.filename}: ${documentType} / ${practiceArea ?? '?'} (urgency=${urgency ?? '?'}, conf=${confidence.toFixed(2)})`);
  return getDocumentClassification(input.documentId) as DocumentClassification;
}

export function getDocumentClassification(documentId: string): DocumentClassification | null {
  const db = getDatabase();
  return (
    (db
      .prepare('SELECT * FROM document_classifications WHERE document_id = ?')
      .get(documentId) as DocumentClassification | undefined) ?? null
  );
}

export interface CorrectClassificationInput {
  documentId: string;
  documentType?: string;
  practiceArea?: string | null;
  urgency?: Urgency | null;
  acting: string;
}

export function correctClassification(input: CorrectClassificationInput): DocumentClassification {
  const existing = getDocumentClassification(input.documentId);
  if (!existing) throw new Error(`document classification for ${input.documentId} not found`);
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE document_classifications
       SET document_type = COALESCE(?, document_type),
           practice_area = COALESCE(?, practice_area),
           urgency = COALESCE(?, urgency),
           corrected_by = ?, corrected_at = ?
     WHERE document_id = ?`,
  ).run(
    input.documentType ?? null,
    input.practiceArea ?? null,
    input.urgency ?? null,
    input.acting,
    now,
    input.documentId,
  );
  appendLegalAudit({
    matterId: existing.matter_id,
    actorId: input.acting,
    action: 'document.classify_corrected',
    detail: `${existing.document_id}: type=${input.documentType ?? existing.document_type}`,
    refTable: 'document_classifications',
    refId: existing.document_id,
  });
  return getDocumentClassification(input.documentId) as DocumentClassification;
}
