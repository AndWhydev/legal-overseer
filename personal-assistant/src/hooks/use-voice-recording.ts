'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseVoiceRecordingOptions {
  silenceDetection?: boolean;
  silenceThreshold?: number;
  silenceDurationMs?: number;
  minRecordingMs?: number;
}

export interface UseVoiceRecording {
  isRecording: boolean;
  isProcessing: boolean;
  audioLevel: number;
  frequencyData: Uint8Array | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  error: string | null;
}

export function useVoiceRecording(options?: UseVoiceRecordingOptions): UseVoiceRecording {
  const silenceDetection = options?.silenceDetection ?? false;
  const silenceThreshold = options?.silenceThreshold ?? 0.01;
  const silenceDurationMs = options?.silenceDurationMs ?? 2000;
  const minRecordingMs = options?.minRecordingMs ?? 500;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const chunksRef = useRef<Blob[]>([]);
  const silenceStartRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number>(0);
  const autoStopTriggeredRef = useRef(false);

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    silenceStartRef.current = null;
    autoStopTriggeredRef.current = false;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const updateFrequencyData = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    setFrequencyData(data);

    // Compute RMS level 0-1
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const level = sum / (data.length * 255);
    setAudioLevel(level);

    if (silenceDetection && !autoStopTriggeredRef.current) {
      const elapsed = Date.now() - recordingStartRef.current;
      if (elapsed > minRecordingMs) {
        if (level < silenceThreshold) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current >= silenceDurationMs) {
            autoStopTriggeredRef.current = true;
            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state === 'recording') {
              recorder.stop();
            }
            return;
          }
        } else {
          silenceStartRef.current = null;
        }
      }
    }

    rafRef.current = requestAnimationFrame(updateFrequencyData);
  }, [silenceDetection, silenceThreshold, silenceDurationMs, minRecordingMs]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      silenceStartRef.current = null;
      autoStopTriggeredRef.current = false;
      recordingStartRef.current = Date.now();
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();

      setIsRecording(true);
      rafRef.current = requestAnimationFrame(updateFrequencyData);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Microphone permission denied'
        : 'Could not access microphone';
      setError(msg);
      cleanup();
    }
  }, [cleanup, updateFrequencyData]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanup();
      setIsRecording(false);
      return null;
    }

    setIsProcessing(true);

    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const blob = chunksRef.current.length > 0
          ? new Blob(chunksRef.current, { type: recorder.mimeType })
          : null;
        cleanup();
        setIsRecording(false);
        resolve(blob);
      };
      recorder.stop();
    });
  }, [cleanup]);

  return {
    isRecording,
    isProcessing,
    audioLevel,
    frequencyData,
    startRecording,
    stopRecording,
    error,
  };
}