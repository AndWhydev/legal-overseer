/**
 * 8.3 — Phone call logging.
 *
 * Re-exports the file-notes generator with a phone-call shape:
 * lawyer dictates a 30s-5min summary after a call, the system
 * transcribes via Whisper, reformats with Sonnet, lands in review
 * queue.
 *
 * Follow-up correspondence is drafted (separately, also for review)
 * when the dictation mentions a commitment.
 */

import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { enqueueForReview } from '../compliance/reviewGate.js';
import { wrapWithDisclaimer } from '../compliance/disclaimer.js';
import { transcribeAudio } from '../dictation/transcribe.js';
import { createFileNoteFromTranscript, type FileNote } from '../collaboration/file-notes.js';
import { callLlmWithRedaction, extractJson } from '../intelligence/llm.js';
import { getMatterById } from '../db/repositories/matters.js';

const logger = createSafeLogger('CallLogging');

export interface LogCallInput {
  matterId: string;
  authorEmail: string;
  audioData: Buffer;
  filename: string;
  contentType: string;
}

export async function logCallFromAudio(input: LogCallInput): Promise<FileNote> {
  const trans = await transcribeAudio(input.audioData, input.filename, input.contentType);
  if (!trans.ok) throw new Error(trans.error ?? 'transcription failed');
  return createFileNoteFromTranscript({
    matterId: input.matterId,
    authorEmail: input.authorEmail,
    kind: 'phone_call',
    transcript: trans.text,
    transcriptionSource: 'whisper',
  });
}

export interface CommitmentExtraction {
  commitments?: { who: 'us' | 'them'; what: string; by?: string }[];
}

export async function draftFollowUpFromCallNote(fileNote: FileNote): Promise<number> {
  const matter = getMatterById(fileNote.matter_id);
  if (!matter) return 0;

  const llm = await callLlmWithRedaction(
    matter.id,
    `You are an Australian lawyer's paralegal.

Read this file note and extract every commitment that was made on the
call. Respond with strict JSON of shape:
{
  "commitments": [{"who": "us|them", "what": "...", "by": "YYYY-MM-DD or null"}]
}

Only commitments that need outbound correspondence — ignore internal
follow-ups.`,
    fileNote.body_markdown,
    'haiku',
    0.3,
  );

  const parsed = extractJson<CommitmentExtraction>(llm.text) ?? {};
  const ours = (parsed.commitments ?? []).filter((c) => c.who === 'us');
  if (!ours.length) return 0;

  const body = wrapWithDisclaimer(`# Follow-up to our recent call — ${matter.matter_number}

Dear ${matter.client_name},

Thank you for the call. Following on from what we discussed, this
note confirms what we agreed to do on our side:

${ours.map((c) => `- ${c.what}${c.by ? ` (by ${c.by})` : ''}`).join('\n')}

I will be in touch as I progress these. Please let me know if I have
missed anything from our conversation.

Kind regards,
[YOUR NAME]`);

  enqueueForReview({
    matterId: matter.id,
    matterNumber: matter.matter_number,
    skillId: 'call_logging',
    outputKind: 'client_email',
    title: `Follow-up to call — ${matter.matter_number}`,
    bodyMarkdown: body,
    metadata: { kind: 'call_follow_up', source_file_note: fileNote.id, commitment_count: ours.length },
  });
  appendLegalAudit({
    matterId: matter.id,
    actorId: fileNote.author_email,
    action: 'call.follow_up_drafted',
    detail: `${ours.length} commitments`,
    refTable: 'file_notes',
    refId: fileNote.id,
  });
  return ours.length;
}

export function listMatterCallNotes(matterId: string): FileNote[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM file_notes WHERE matter_id = ? AND kind = 'phone_call' ORDER BY created_at DESC`,
    )
    .all(matterId) as FileNote[];
}
