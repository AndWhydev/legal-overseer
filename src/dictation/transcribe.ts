/**
 * Audio transcription.
 *
 * The product calls OpenAI Whisper when WHISPER_API_KEY is set. We
 * don't ship raw audio anywhere else — if the firm hasn't provided a
 * key, transcription is unavailable and the dictation page tells the
 * lawyer to type the brief instead.
 *
 * Wire format: multipart POST to api.openai.com/v1/audio/transcriptions
 * with model=whisper-1. The Whisper endpoint accepts MP3 / WAV / M4A
 * up to 25MB; the dictation route enforces that cap upstream.
 *
 * Privilege caveat: Whisper is an external service. The dictation
 * route stores a copy of the lawyer's intended use-case (which skill
 * to feed the transcription into) so the audit trail records the
 * external upload.
 */

import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('Dictation');

const WHISPER_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';

export interface TranscriptionResult {
  ok: boolean;
  text: string;
  error: string | null;
  /** Wall-clock duration of the transcription request. */
  durationMs: number;
}

export function isTranscriptionAvailable(): boolean {
  return !!process.env.WHISPER_API_KEY;
}

export async function transcribeAudio(
  data: Buffer,
  filename: string,
  contentType: string,
): Promise<TranscriptionResult> {
  const start = Date.now();
  if (!isTranscriptionAvailable()) {
    return {
      ok: false,
      text: '',
      error: 'WHISPER_API_KEY is not set; transcription disabled. Type your brief instead.',
      durationMs: 0,
    };
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(data)], { type: contentType || 'audio/mpeg' }), filename);
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'text');
  form.append('language', 'en');

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120_000);
  try {
    const res = await fetch(WHISPER_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.WHISPER_API_KEY}` },
      body: form,
      signal: ac.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { ok: false, text: '', error: `Whisper HTTP ${res.status}: ${errBody.slice(0, 240)}`, durationMs: Date.now() - start };
    }
    const text = (await res.text()).trim();
    logger.info(`transcribed ${filename}: ${text.length} chars in ${Date.now() - start}ms`);
    return { ok: true, text, error: null, durationMs: Date.now() - start };
  } catch (err) {
    return { ok: false, text: '', error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}
