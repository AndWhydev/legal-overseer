'use client';

/**
 * useVoiceSession — client-side driver for BitBit's realtime voice mode.
 *
 * Replaces the legacy `use-voice-mode.ts`. Phase 1 transport is SSE over POST:
 * record a turn → POST audio to `/api/voice/stream` → consume an event
 * stream containing live transcript, agent events, and sentence-level TTS
 * audio. Phase 2 swaps SSE for WebSocket + streaming STT without changing
 * this hook's public surface.
 *
 * Polish wired in P1:
 *   - Orb reactivity while speaking: hooks an AnalyserNode onto each Audio
 *     element so the overlay's visualiser pulses with the assistant voice.
 *   - threadId forwarding: voice turns land in the same Postgres thread as
 *     the active text chat, enabling seamless voice↔text handoff.
 *   - Soft barge-in: tapping during speaking aborts both local playback AND
 *     the in-flight fetch so the server stops generating more TTS (cost + UX).
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
  /** Streaming assistant text (updates per content_delta). */
  interimResponse: string | null;
  /** Non-null when the reply won't be spoken (table/code). */
  voiceSuppressed: string | null;
  error: string | null;
}

export interface UseVoiceSessionOptions {
  /** Current active chat thread so voice turns share Postgres thread + history.
   *  If omitted, the hook falls back to reading `bb-active-thread` from
   *  localStorage (the key written by `ChatThreadsProvider`) so voice mode
   *  still shares the open chat even when mounted outside the provider. */
  threadId?: string | null;
}

const THREAD_STORAGE_KEY = 'bb-active-thread';

function readPersistedThreadId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(THREAD_STORAGE_KEY);
  } catch {
    return null;
  }
}

interface SessionCredentials {
  token: string;
  expiresAt: number;
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

export function useVoiceSession(options: UseVoiceSessionOptions = {}): UseVoiceSession {
  const { threadId } = options;

  const [state, setState] = useState<VoiceSessionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const [interimResponse, setInterimResponse] = useState<string | null>(null);
  const [voiceSuppressed, setVoiceSuppressed] = useState<string | null>(null);

  // Playback-analyser outputs: distinct from the mic analyser so the overlay
  // can show "this is the *assistant* pulsing" during speaking.
  const [speakingLevel, setSpeakingLevel] = useState(0);
  const [speakingFreqData, setSpeakingFreqData] = useState<Uint8Array | null>(null);

  const isActiveRef = useRef(false);
  const credentialsRef = useRef<SessionCredentials | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Resolve the current thread at call time. Explicit prop wins; otherwise
  // we re-read localStorage so a user switching threads in the sidebar is
  // picked up on the next voice turn without re-mounting the hook.
  const resolveActiveThreadId = useCallback((): string | null => {
    return threadId ?? readPersistedThreadId();
  }, [threadId]);

  // Playback queue: sentences play back-to-back in arrival order.
  const playbackQueueRef = useRef<PendingSentence[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);

  // Single AudioContext reused across turns for the playback analyser. Lazy-
  // initialised inside a user-gesture path (activate) so Safari doesn't block it.
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackRafRef = useRef<number>(0);
  const activeAnalyserRef = useRef<AnalyserNode | null>(null);

  const {
    isRecording,
    audioLevel: micLevel,
    frequencyData: micFreqData,
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
    if (existing && existing.expiresAt - Date.now() > 30_000) return existing;

    const res = await fetch('/api/voice/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: resolveActiveThreadId() ?? undefined }),
    });
    if (!res.ok) throw new Error(`Session mint failed: ${res.status}`);

    const json = (await res.json()) as { token: string; expiresIn: number };
    const creds: SessionCredentials = {
      token: json.token,
      expiresAt: Date.now() + json.expiresIn * 1000,
    };
    credentialsRef.current = creds;
    return creds;
  }, [resolveActiveThreadId]);

  // ── Playback analyser ──────────────────────────────────────────────────
  const teardownPlaybackAnalyser = useCallback(() => {
    if (playbackRafRef.current) {
      cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = 0;
    }
    activeAnalyserRef.current = null;
    setSpeakingLevel(0);
    setSpeakingFreqData(null);
  }, []);

  const hookupPlaybackAnalyser = useCallback((audio: HTMLAudioElement) => {
    try {
      if (!playbackCtxRef.current) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        playbackCtxRef.current = new Ctor();
      }
      const ctx = playbackCtxRef.current;
      // AudioContext may be in "suspended" state on Safari; resume is a no-op
      // inside the user-gesture chain (activate → tap → audio.play).
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      activeAnalyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (activeAnalyserRef.current !== analyser) return;
        analyser.getByteFrequencyData(data);
        // Copy into a fresh buffer so React notices the state change.
        setSpeakingFreqData(new Uint8Array(data));
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setSpeakingLevel(sum / data.length / 255);
        playbackRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      // Creating a MediaElementSource for an already-connected element throws.
      // Not fatal — playback still works, the orb just won't pulse for that clip.
      console.warn('[use-voice-session] analyser hookup failed', err);
    }
  }, []);

  // ── Playback queue ─────────────────────────────────────────────────────
  // Enforce strict sentence order: only play the queue head once it is
  // complete, even if later sentences have already finished synthesizing.
  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    const next = playbackQueueRef.current[0];
    if (!next || !next.complete) return;

    playbackQueueRef.current.shift();

    const blob = new Blob(next.chunks as BlobPart[], { type: next.contentType });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    currentAudioRef.current = audio;
    isPlayingRef.current = true;
    setState('speaking');

    const cleanupThis = () => {
      URL.revokeObjectURL(url);
      if (currentAudioRef.current === audio) currentAudioRef.current = null;
      isPlayingRef.current = false;
      teardownPlaybackAnalyser();
    };

    audio.onended = () => {
      cleanupThis();
      if (playbackQueueRef.current.length > 0) {
        playNext();
      } else if (isActiveRef.current) {
        setState('listening');
        startRecording().catch(err => {
          console.error('[use-voice-session] failed to restart recording', err);
        });
      }
    };
    audio.onerror = err => {
      console.error('[use-voice-session] audio playback error', err);
      cleanupThis();
      if (playbackQueueRef.current.length > 0) playNext();
    };

    hookupPlaybackAnalyser(audio);
    audio.play().catch(err => {
      console.error('[use-voice-session] audio play() rejected', err);
      cleanupThis();
      setError('Tap the orb to resume playback');
    });
  }, [hookupPlaybackAnalyser, teardownPlaybackAnalyser, startRecording]);

  const clearPlayback = useCallback(() => {
    playbackQueueRef.current = [];
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.onended = null;
      currentAudioRef.current.onerror = null;
      currentAudioRef.current = null;
    }
    isPlayingRef.current = false;
    teardownPlaybackAnalyser();
  }, [teardownPlaybackAnalyser]);

  // ── SSE event dispatch ────────────────────────────────────────────────
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

  // ── Main turn orchestration ───────────────────────────────────────────
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
      console.error('[use-voice-session] session mint failed', err);
      setError('Could not start voice session');
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
    const currentThreadId = resolveActiveThreadId();
    if (currentThreadId) form.append('threadId', currentThreadId);

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

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (!isActiveRef.current) break;
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          for (const line of frame.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice('data: '.length);
            try {
              handleEvent(JSON.parse(json));
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
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [fetchCredentials, handleEvent, startRecording, resolveActiveThreadId]);

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

  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (wasRecordingRef.current && !isRecording && isActiveRef.current && state === 'listening') {
      handleRecordingStop();
    }
    wasRecordingRef.current = isRecording;
  }, [isRecording, state, handleRecordingStop]);

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
      // Pre-warm the AudioContext inside the user gesture so Safari doesn't
      // block the first playback.
      if (!playbackCtxRef.current) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (Ctor) playbackCtxRef.current = new Ctor();
      }
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
      // Soft barge-in: abort the fetch so the server stops generating more
      // TTS (cost + latency), drop local playback, start a new turn.
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
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
      if (playbackCtxRef.current) {
        playbackCtxRef.current.close().catch(() => {});
        playbackCtxRef.current = null;
      }
    };
  }, [clearPlayback]);

  // Expose the analyser that corresponds to the current state: mic while
  // listening/idle, playback while speaking. `thinking` falls back to mic
  // (frozen since recording is stopped) — acceptable idle-ish visual.
  const showSpeaking = state === 'speaking';
  const audioLevel = showSpeaking ? speakingLevel : micLevel;
  const frequencyData = showSpeaking ? speakingFreqData : micFreqData;

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
