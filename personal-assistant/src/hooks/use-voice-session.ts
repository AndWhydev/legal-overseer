'use client';

/**
 * useVoiceSession — client-side driver for BitBit's realtime voice mode.
 *
 * Replaces `use-voice-mode.ts`. Phase 1 transport is SSE over POST: record a
 * turn → POST audio to `/api/voice/stream` → consume an event stream
 * containing live transcript, agent events, and sentence-level TTS audio.
 *
 * Response surface matches `UseVoiceMode` so the voice overlay doesn't need
 * shape changes to flip over.
 *
 * Phase 2 will swap the SSE transport for a WebSocket with streaming mic
 * upload, but the hook's public API stays the same.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceRecording } from '@/hooks/use-voice-recording';

export type VoiceSessionState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface UseVoiceSession {
  state: VoiceSessionState;
  isActive: boolean;
  activate: () => Promise<void>;
  deactivate: () => void;
  toggleRecording: () => Promise<void>;
  audioLevel: number;
  frequencyData: Uint8Array | null;
  transcript: string | null;
  lastResponse: string | null;
  /** Current partial assistant text (updates while content_delta streams). */
  interimResponse: string | null;
  /** When the assistant's response can't be spoken (table/code), this is set. */
  voiceSuppressed: string | null;
  error: string | null;
}

interface SessionCredentials {
  token: string;
  expiresAt: number; // ms
}

interface PendingSentence {
  sentenceId: string;
  chunks: Uint8Array[];
  contentType: string;
  text: string;
  complete: boolean;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function useVoiceSession(): UseVoiceSession {
  const [state, setState] = useState<VoiceSessionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const [interimResponse, setInterimResponse] = useState<string | null>(null);
  const [voiceSuppressed, setVoiceSuppressed] = useState<string | null>(null);

  const isActiveRef = useRef(false);
  const credentialsRef = useRef<SessionCredentials | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Playback queue: sentences are played back-to-back in arrival order.
  const playbackQueueRef = useRef<PendingSentence[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);

  const {
    isRecording,
    audioLevel,
    frequencyData,
    startRecording,
    stopRecording,
    error: recordingError,
  } = useVoiceRecording({
    silenceDetection: true,
    silenceThreshold: 0.01,
    silenceDurationMs: 2000,
    minRecordingMs: 800,
  });

  // ── Session credentials ────────────────────────────────────────────────
  const fetchCredentials = useCallback(async (): Promise<SessionCredentials> => {
    const existing = credentialsRef.current;
    // Use cached token if it's got at least 30s of life left
    if (existing && existing.expiresAt - Date.now() > 30_000) {
      return existing;
    }
    const res = await fetch('/api/voice/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      throw new Error(`Session mint failed: ${res.status}`);
    }
    const json = await res.json() as { token: string; expiresIn: number };
    const creds: SessionCredentials = {
      token: json.token,
      expiresAt: Date.now() + json.expiresIn * 1000,
    };
    credentialsRef.current = creds;
    return creds;
  }, []);

  // ── Playback queue ─────────────────────────────────────────────────────
  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    const next = playbackQueueRef.current.find(p => p.complete);
    if (!next) return;

    // Remove it from the queue
    const idx = playbackQueueRef.current.indexOf(next);
    playbackQueueRef.current.splice(idx, 1);

    const blob = new Blob(next.chunks, { type: next.contentType });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudioRef.current = audio;
    isPlayingRef.current = true;
    setState('speaking');

    const cleanupThis = () => {
      URL.revokeObjectURL(url);
      if (currentAudioRef.current === audio) currentAudioRef.current = null;
      isPlayingRef.current = false;
    };

    audio.onended = () => {
      cleanupThis();
      if (playbackQueueRef.current.length > 0) {
        playNext();
      } else if (isActiveRef.current) {
        // No more audio queued — back to listening
        setState('listening');
        startRecording().catch(err => {
          console.error('[use-voice-session] Failed to restart recording', err);
        });
      }
    };
    audio.onerror = (err) => {
      console.error('[use-voice-session] Audio playback error', err);
      cleanupThis();
      if (playbackQueueRef.current.length > 0) playNext();
    };
    audio.play().catch(err => {
      // Autoplay blocked — user-gesture required. Surface as error.
      console.error('[use-voice-session] Audio play() rejected', err);
      cleanupThis();
      setError('Tap to allow playback');
    });
  }, [startRecording]);

  const clearPlayback = useCallback(() => {
    playbackQueueRef.current = [];
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.onended = null;
      currentAudioRef.current.onerror = null;
      currentAudioRef.current = null;
    }
    isPlayingRef.current = false;
  }, []);

  // ── SSE event handling ─────────────────────────────────────────────────
  const handleEvent = useCallback((ev: { type: string; data: unknown }) => {
    switch (ev.type) {
      case 'transcript': {
        const d = ev.data as { text: string };
        setTranscript(d.text);
        setState('thinking');
        setInterimResponse('');
        setVoiceSuppressed(null);
        break;
      }
      case 'agent_event': {
        const inner = ev.data as { type: string; data: unknown };
        if (inner.type === 'content_delta') {
          setInterimResponse(prev => (prev ?? '') + (inner.data as string));
        } else if (inner.type === 'message') {
          const txt = inner.data as string;
          setLastResponse(txt);
          setInterimResponse(txt);
        }
        break;
      }
      case 'voice_suppressed': {
        const d = ev.data as { reason: string };
        setVoiceSuppressed(d.reason);
        break;
      }
      case 'tts_sentence_start': {
        const d = ev.data as { sentenceId: string; text: string };
        playbackQueueRef.current.push({
          sentenceId: d.sentenceId,
          chunks: [],
          contentType: 'audio/mpeg',
          text: d.text,
          complete: false,
        });
        break;
      }
      case 'tts_audio': {
        const d = ev.data as { sentenceId: string; audioBase64: string; contentType: string };
        const pending = playbackQueueRef.current.find(p => p.sentenceId === d.sentenceId);
        if (pending) {
          pending.chunks.push(base64ToBytes(d.audioBase64));
          pending.contentType = d.contentType;
        }
        break;
      }
      case 'tts_sentence_end': {
        const d = ev.data as { sentenceId: string };
        const pending = playbackQueueRef.current.find(p => p.sentenceId === d.sentenceId);
        if (pending) {
          pending.complete = true;
          playNext();
        }
        break;
      }
      case 'error': {
        const d = ev.data as { message: string };
        setError(d.message);
        break;
      }
      case 'done': {
        // The server has finished the turn. If nothing ended up playing
        // (e.g. voice was suppressed), return to listening.
        if (!isPlayingRef.current && playbackQueueRef.current.length === 0 && isActiveRef.current) {
          setState('listening');
          startRecording().catch(err => {
            console.error('[use-voice-session] restart recording failed', err);
          });
        }
        break;
      }
    }
  }, [playNext, startRecording]);

  // ── Main turn: upload audio + consume SSE ──────────────────────────────
  const processTurn = useCallback(async (blob: Blob): Promise<void> => {
    if (!isActiveRef.current) return;

    setError(null);
    setState('thinking');
    setInterimResponse(null);
    setLastResponse(null);
    setVoiceSuppressed(null);

    let credentials: SessionCredentials;
    try {
      credentials = await fetchCredentials();
    } catch (err) {
      setError('Could not start voice session');
      console.error('[use-voice-session] Session mint failed', err);
      if (isActiveRef.current) {
        setState('listening');
        await startRecording().catch(() => {});
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const form = new FormData();
    form.append('audio', blob, 'audio.webm');
    form.append('token', credentials.token);

    let res: Response;
    try {
      res = await fetch('/api/voice/stream', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        console.error('[use-voice-session] fetch failed', err);
        setError('Could not reach BitBit');
      }
      if (isActiveRef.current) {
        setState('listening');
        await startRecording().catch(() => {});
      }
      return;
    }

    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => '');
      console.error('[use-voice-session] stream not ok', res.status, txt);
      setError('Voice request failed');
      if (isActiveRef.current) {
        setState('listening');
        await startRecording().catch(() => {});
      }
      return;
    }

    // Read SSE stream line-by-line
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (!isActiveRef.current) break;
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split on SSE event boundaries (blank lines)
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          // Each frame is a set of lines; we only care about "data: ..." lines.
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice('data: '.length);
            try {
              const parsed = JSON.parse(json);
              handleEvent(parsed);
            } catch (err) {
              console.warn('[use-voice-session] bad SSE frame', err);
            }
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        console.error('[use-voice-session] stream read error', err);
      }
    } finally {
      try { reader.releaseLock(); } catch { /* noop */ }
    }
  }, [fetchCredentials, handleEvent, startRecording]);

  // ── Recording lifecycle ────────────────────────────────────────────────
  const handleRecordingStop = useCallback(async () => {
    if (!isActiveRef.current) return;
    const blob = await stopRecording();
    if (!blob) {
      if (isActiveRef.current) {
        setState('listening');
        await startRecording().catch(() => {});
      }
      return;
    }
    await processTurn(blob);
  }, [stopRecording, startRecording, processTurn]);

  // Detect recording → stopped transition
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (wasRecordingRef.current && !isRecording && isActiveRef.current && state === 'listening') {
      handleRecordingStop();
    }
    wasRecordingRef.current = isRecording;
  }, [isRecording, state, handleRecordingStop]);

  // Propagate recording errors
  useEffect(() => {
    if (recordingError) setError(recordingError);
  }, [recordingError]);

  // ── Public controls ────────────────────────────────────────────────────
  const activate = useCallback(async () => {
    if (isActiveRef.current) return;
    setError(null);
    isActiveRef.current = true;
    setState('listening');
    try {
      // Mint token eagerly so the first turn doesn't pay the round-trip.
      await fetchCredentials();
      await startRecording();
    } catch (err) {
      console.error('[use-voice-session] activate failed', err);
      setError('Could not start voice mode');
      isActiveRef.current = false;
      setState('idle');
    }
  }, [fetchCredentials, startRecording]);

  const deactivate = useCallback(() => {
    isActiveRef.current = false;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    stopRecording().catch(() => {});
    clearPlayback();
    setError(null);
    setState('idle');
  }, [stopRecording, clearPlayback]);

  const toggleRecording = useCallback(async () => {
    if (!isActiveRef.current) return;
    if (state === 'listening' && isRecording) {
      const blob = await stopRecording();
      if (blob) {
        await processTurn(blob);
      } else if (isActiveRef.current) {
        setState('listening');
        await startRecording();
      }
    } else if (state === 'speaking') {
      // Phase 1: manual tap during playback stops and resumes listening.
      // Phase 2 will hook this to server-side barge-in via AbortController.
      clearPlayback();
      if (isActiveRef.current) {
        setState('listening');
        await startRecording();
      }
    }
  }, [state, isRecording, stopRecording, startRecording, processTurn, clearPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      abortRef.current?.abort();
      clearPlayback();
    };
  }, [clearPlayback]);

  return {
    state,
    isActive: isActiveRef.current,
    activate,
    deactivate,
    toggleRecording,
    audioLevel,
    frequencyData,
    transcript,
    lastResponse,
    interimResponse,
    voiceSuppressed,
    error,
  };
}
