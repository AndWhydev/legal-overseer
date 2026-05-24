/**
 * 5.4 — Automated file notes (from dictation).
 *
 * Takes a transcript (from Whisper via src/dictation) and asks Opus to
 * structure it into a file note: date/time, parties, topics, decisions,
 * action items, next steps. The note lands in the review queue. Once
 * approved, action items are extracted into matter chat as
 * action_items.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { recordAiRun } from '../compliance/billing.js';
import { enqueueForReview } from '../compliance/reviewGate.js';
import { wrapWithDisclaimer } from '../compliance/disclaimer.js';
import { getMatterById } from '../db/repositories/matters.js';
import { callLlmWithRedaction, extractJson } from '../intelligence/llm.js';
import { postMessage } from './matter-chat.js';

const logger = createSafeLogger('FileNotes');

export type FileNoteKind = 'meeting' | 'phone_call' | 'dictation' | 'other';

export interface FileNote {
  id: string;
  matter_id: string;
  author_email: string;
  kind: FileNoteKind;
  body_markdown: string;
  review_id: string | null;
  audio_path: string | null;
  transcription_source: string | null;
  action_items_json: string | null;
  created_at: string;
}

interface ModelOutput {
  bodyMarkdown?: string;
  actionItems?: { description: string; assignee?: string; dueDate?: string }[];
}

export interface CreateFileNoteFromTranscriptInput {
  matterId: string;
  authorEmail: string;
  kind: FileNoteKind;
  transcript: string;
  audioPath?: string;
  transcriptionSource?: string;
}

export async function createFileNoteFromTranscript(
  input: CreateFileNoteFromTranscriptInput,
): Promise<FileNote> {
  const startedAt = Date.now();
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);
  const promptHeader = `You are a paralegal turning a lawyer's dictated note into a formal file note.

Matter: ${matter.matter_number} — ${matter.title}
Kind: ${input.kind}
Author: ${input.authorEmail}
Date: ${new Date().toISOString()}

Reformat the transcript as a structured file note (Markdown), then list
action items in JSON. Respond with strict JSON of shape:
{
  "bodyMarkdown": "<the formal file note>",
  "actionItems": [{"description": "...", "assignee": "...", "dueDate": "YYYY-MM-DD"}]
}

File note structure:
# File note — ${matter.matter_number}
Date/time: ...
Parties: ...
Topics: ...
Decisions: ...
Next steps: ...`;

  const llm = await callLlmWithRedaction(matter.id, promptHeader, input.transcript, 'sonnet', 1.5);
  const parsed = extractJson<ModelOutput>(llm.text) ?? {};
  const body = parsed.bodyMarkdown
    ?? `# File note (auto-formatted)\n\n${input.transcript}`;
  const body_markdown = wrapWithDisclaimer(body);
  const actionItems = parsed.actionItems ?? [];

  const review = enqueueForReview({
    matterId: matter.id,
    matterNumber: matter.matter_number,
    skillId: 'file_notes',
    outputKind: 'matter_management',
    title: `File note — ${matter.matter_number} (${input.kind})`,
    bodyMarkdown: body_markdown,
    metadata: { kind: 'file_note', actionItems, author: input.authorEmail },
    costUsd: llm.costUsd,
  });

  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO file_notes
       (id, matter_id, author_email, kind, body_markdown, review_id,
        audio_path, transcription_source, action_items_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    matter.id,
    input.authorEmail,
    input.kind,
    body_markdown,
    review.id,
    input.audioPath ?? null,
    input.transcriptionSource ?? null,
    actionItems.length ? JSON.stringify(actionItems) : null,
  );

  if (llm.costUsd && llm.costUsd > 0) {
    recordAiRun({
      matterId: matter.id,
      skillId: 'file_notes',
      description: `File note (${input.kind})`,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      costUsd: llm.costUsd,
      reviewId: review.id,
    });
  }

  appendLegalAudit({
    matterId: matter.id,
    actorId: input.authorEmail,
    action: 'file_note.create',
    detail: `${input.kind}: ${body.slice(0, 200)}`,
    refTable: 'file_notes',
    refId: id,
    modelUsed: 'sonnet',
  });

  return db.prepare('SELECT * FROM file_notes WHERE id = ?').get(id) as FileNote;
}

export function getFileNote(id: string): FileNote | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM file_notes WHERE id = ?').get(id) as FileNote | undefined) ?? null;
}

export function listFileNotes(matterId: string): FileNote[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM file_notes WHERE matter_id = ? ORDER BY created_at DESC`)
    .all(matterId) as FileNote[];
}

/**
 * Once the review is approved, push the extracted action items into
 * matter chat so they appear in the assignee's task list. Called from
 * the review-approval flow.
 */
export function promoteActionItemsToChat(fileNoteId: string, acting: string): number {
  const note = getFileNote(fileNoteId);
  if (!note || !note.action_items_json) return 0;
  const items = JSON.parse(note.action_items_json) as {
    description: string;
    assignee?: string;
    dueDate?: string;
  }[];
  let count = 0;
  for (const item of items) {
    postMessage({
      matterId: note.matter_id,
      authorEmail: acting,
      body: item.description,
      isActionItem: true,
      actionAssignee: item.assignee ?? acting,
      actionDueDate: item.dueDate,
    });
    count += 1;
  }
  return count;
}
