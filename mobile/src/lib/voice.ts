import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

export interface TranscriptionResult {
  transcript: string;
  response?: string;
}

/**
 * Upload an audio recording to the /api/ai/voice endpoint for Whisper transcription.
 * Returns the transcript text and optional AI response.
 */
export async function transcribeAudio(uri: string): Promise<TranscriptionResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const formData = new FormData();
  formData.append('audio', {
    uri,
    type: 'audio/m4a',
    name: 'voice.m4a',
  } as unknown as Blob);

  const response = await fetch(`${API_URL}/api/ai/voice`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Transcription failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as TranscriptionResult;
  return data;
}
