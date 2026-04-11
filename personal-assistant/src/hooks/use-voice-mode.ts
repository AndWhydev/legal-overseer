'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceRecording } from '@/hooks/use-voice-recording';
import { useVoicePlayback } from '@/hooks/use-voice-playback';

export type VoiceModeState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceAPIResponse {
  transcript: string;
  response: string;
  error?: string;
}

export interface UseVoiceMode {
  state: VoiceModeState;
  isActive: boolean;
  activate: () => Promise<void>;
  deactivate: () => void;
  toggleRecording: () => Promise<void>;
  audioLevel: number;
  frequencyData: Uint8Array | null;
  transcript: string | null;
  lastResponse: string | null;
  error: string | null;
}

export function useVoiceMode(): UseVoiceMode {
  const [state, setState] = useState<VoiceModeState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<string | null>(null);

  const isActiveRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  const { playBlob, stop: stopPlayback, isPlaying: isSpeaking } = useVoicePlayback();

  // Process a recorded audio blob through the voice API
  const processAudio = useCallback(
    async (blob: Blob): Promise<void> => {
      if (!isActiveRef.current) return;

      setState('thinking');
      setError(null);

      try {
        const formData = new FormData();
        formData.append('audio', blob, 'audio.webm');

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const res = await fetch('/api/ai/voice', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        if (!isActiveRef.current) return;

        if (!res.ok) {
          const errText = await res.text();
          console.error('[use-voice-mode] Voice API error:', res.status, errText);
          setError('Failed to process voice input');
          // Resume listening on error
          if (isActiveRef.current) {
            setState('listening');
            await startRecording();
          }
          return;
        }

        const data = (await res.json()) as VoiceAPIResponse;

        if (!isActiveRef.current) return;

        setTranscript(data.transcript || null);
        setLastResponse(data.response || null);

        if (data.error || !data.response) {
          setError(data.error ?? 'No response from AI');
          if (isActiveRef.current) {
            setState('listening');
            await startRecording();
          }
          return;
        }

        // Speak the AI response via TTS
        setState('speaking');
        const ttsRes = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.response }),
          signal: controller.signal,
        });
        if (!isActiveRef.current || !ttsRes.ok) {
          if (!ttsRes.ok) {
            console.error('[use-voice-mode] TTS failed:', ttsRes.status);
            setError('Failed to generate speech');
          }
          if (isActiveRef.current) {
            setState('listening');
            await startRecording();
          }
          return;
        }
        const ttsBlob = await ttsRes.blob();
        if (!isActiveRef.current) return;
        await playBlob(ttsBlob);

        // After playback finishes, auto-start recording again for continuous conversation
        if (isActiveRef.current) {
          setState('listening');
          await startRecording();
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Request was cancelled by deactivate — ignore
          return;
        }
        console.error('[use-voice-mode] Process audio error:', err);
        setError('Something went wrong. Try again.');
        if (isActiveRef.current) {
          setState('listening');
          await startRecording();
        }
      }
    },
    [playBlob, startRecording]
  );

  // Handle recording stop: when user taps to stop or silence is detected
  const handleRecordingStop = useCallback(async () => {
    if (!isActiveRef.current) return;

    const blob = await stopRecording();
    if (!blob) {
      // No audio captured — restart listening
      if (isActiveRef.current) {
        setState('listening');
        await startRecording();
      }
      return;
    }

    await processAudio(blob);
  }, [stopRecording, processAudio, startRecording]);

  const activate = useCallback(async () => {
    setError(null);
    isActiveRef.current = true;
    setState('listening');

    try {
      await startRecording();
    } catch (err) {
      console.error('[use-voice-mode] Failed to start recording:', err);
      setError('Could not start voice mode');
      isActiveRef.current = false;
      setState('idle');
    }
  }, [startRecording]);

  const toggleRecording = useCallback(async () => {
    if (!isActiveRef.current) return;
    if (state === 'listening' && isRecording) {
      const blob = await stopRecording();
      if (blob) {
        await processAudio(blob);
      } else if (isActiveRef.current) {
        setState('listening');
        await startRecording();
      }
    } else if (state === 'speaking') {
      stopPlayback();
      if (isActiveRef.current) {
        setState('listening');
        await startRecording();
      }
    }
  }, [state, isRecording, stopRecording, processAudio, startRecording, stopPlayback]);

  const deactivate = useCallback(() => {
    isActiveRef.current = false;

    // Abort any in-flight API request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop recording if active
    stopRecording().catch(() => {});

    // Stop playback if active
    stopPlayback();

    setError(null);
    setState('idle');
  }, [stopRecording, stopPlayback]);

  // When recording state changes from true to false while active, process the audio
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (wasRecordingRef.current && !isRecording && isActiveRef.current && state === 'listening') {
      handleRecordingStop();
    }
    wasRecordingRef.current = isRecording;
  }, [isRecording, state, handleRecordingStop]);

  // Sync playback state
  useEffect(() => {
    if (!isSpeaking && state === 'speaking' && isActiveRef.current) {
      // Playback finished — transition handled in processAudio
    }
  }, [isSpeaking, state]);

  // Propagate recording errors
  useEffect(() => {
    if (recordingError) {
      setError(recordingError);
    }
  }, [recordingError]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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
    error,
  };
}