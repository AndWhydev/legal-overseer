import { useRef, useState, useCallback, useEffect } from 'react';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { transcribeAudio } from '@/lib/voice';

export type VoiceState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'transcribing'
  | 'done'
  | 'error';

interface UseVoiceOptions {
  /** Called when transcription completes successfully */
  onTranscript: (text: string) => void;
}

/**
 * Voice recording state machine.
 * States: idle -> requesting_permission -> recording -> transcribing -> done/error
 *
 * Uses expo-audio (NOT deprecated expo-av) for recording.
 * Uploads to /api/ai/voice for Whisper transcription.
 */
export function useVoice({ onTranscript }: UseVoiceOptions) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationRef.current) {
        clearInterval(durationRef.current);
      }
      if (state === 'recording') {
        try {
          recorder.stop();
        } catch {
          // Best-effort cleanup
        }
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setState('requesting_permission');

      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setState('error');
        setError('Microphone permission denied');
        return;
      }

      await recorder.prepareToRecordAsync();
      recorder.record();

      setState('recording');
      setDuration(0);

      // Duration timer
      durationRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  }, [recorder]);

  const stopAndTranscribe = useCallback(async () => {
    try {
      // Stop the duration timer
      if (durationRef.current) {
        clearInterval(durationRef.current);
        durationRef.current = null;
      }

      await recorder.stop();
      setState('transcribing');

      const uri = recorder.uri;
      if (!uri) {
        setState('error');
        setError('No recording found');
        return;
      }

      const result = await transcribeAudio(uri);

      if (result.transcript) {
        setState('done');
        onTranscriptRef.current(result.transcript);
      } else {
        setState('error');
        setError('No speech detected');
      }
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Transcription failed');
    }
  }, [recorder]);

  const cancel = useCallback(() => {
    if (durationRef.current) {
      clearInterval(durationRef.current);
      durationRef.current = null;
    }
    if (state === 'recording') {
      try {
        recorder.stop();
      } catch {
        // Best-effort
      }
    }
    setState('idle');
    setError(null);
    setDuration(0);
  }, [recorder, state]);

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
    setDuration(0);
  }, []);

  return {
    state,
    error,
    duration,
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
    startRecording,
    stopAndTranscribe,
    cancel,
    reset,
  };
}
