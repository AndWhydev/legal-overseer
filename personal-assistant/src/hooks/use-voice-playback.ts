'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseVoicePlaybackReturn {
  play: (audioUrl: string) => Promise<void>;
  playBlob: (blob: Blob) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  analyserNode: AnalyserNode | null;
}

export function useVoicePlayback(): UseVoicePlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const unmountedRef = useRef(false);

  // ── Lazy AudioContext initialisation ───────────────────────────

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      setAnalyserNode(analyser);
    }
    return audioContextRef.current;
  }, []);

  // ── requestAnimationFrame time-tracking loop ───────────────────

  const stopTimeTracking = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const startTimeTracking = useCallback(() => {
    stopTimeTracking();

    const tick = () => {
      if (unmountedRef.current) return;
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === 'running') {
        const elapsed = ctx.currentTime - startTimeRef.current + pausedAtRef.current;
        setCurrentTime(elapsed);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [stopTimeTracking]);

  // ── Core: decode buffer and play ──────────────────────────────

  const playBuffer = useCallback(
    (arrayBuffer: ArrayBuffer): Promise<void> => {
      const ctx = getAudioContext();

      return ctx.decodeAudioData(arrayBuffer).then((audioBuffer) => {
        if (unmountedRef.current) return;

        // Stop any prior source
        if (sourceNodeRef.current) {
          try {
            sourceNodeRef.current.stop();
          } catch {
            // already stopped
          }
        }

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        // Wire: source → analyser → destination
        const analyser = analyserRef.current;
        if (analyser) {
          source.connect(analyser);
          analyser.connect(ctx.destination);
        } else {
          source.connect(ctx.destination);
        }

        sourceNodeRef.current = source;
        startTimeRef.current = ctx.currentTime;
        pausedAtRef.current = 0;

        setDuration(audioBuffer.duration);
        setIsLoading(false);
        setIsPlaying(true);
        startTimeTracking();

        return new Promise<void>((resolve) => {
          source.onended = () => {
            if (unmountedRef.current) return;
            sourceNodeRef.current = null;
            stopTimeTracking();
            setIsPlaying(false);
            setCurrentTime(0);
            setDuration(0);
            resolve();
          };

          source.start(0);
        });
      });
    },
    [getAudioContext, startTimeTracking, stopTimeTracking]
  );

  // ── Public: play from URL ─────────────────────────────────────

  const play = useCallback(
    async (audioUrl: string): Promise<void> => {
      setIsLoading(true);
      setIsPlaying(false);

      // Ensure AudioContext exists before fetch
      getAudioContext();

      const res = await fetch(audioUrl);
      if (!res.ok) {
        if (!unmountedRef.current) setIsLoading(false);
        console.error('[use-voice-playback] Fetch failed:', res.status);
        return;
      }

      const arrayBuffer = await res.arrayBuffer();
      if (unmountedRef.current) return;

      return playBuffer(arrayBuffer);
    },
    [getAudioContext, playBuffer]
  );

  // ── Public: play from Blob ────────────────────────────────────

  const playBlob = useCallback(
    async (blob: Blob): Promise<void> => {
      setIsLoading(true);
      setIsPlaying(false);

      // Ensure AudioContext exists
      getAudioContext();

      const arrayBuffer = await blob.arrayBuffer();
      if (unmountedRef.current) return;

      return playBuffer(arrayBuffer);
    },
    [getAudioContext, playBuffer]
  );

  // ── Public: pause ─────────────────────────────────────────────

  const pause = useCallback(() => {
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'running') {
      pausedAtRef.current += ctx.currentTime - startTimeRef.current;
      ctx.suspend().catch(() => {});
      stopTimeTracking();
      setIsPlaying(false);
    }
  }, [stopTimeTracking]);

  // ── Public: resume ────────────────────────────────────────────

  const resume = useCallback(() => {
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'suspended' && sourceNodeRef.current) {
      ctx.resume().then(() => {
        if (unmountedRef.current) return;
        startTimeRef.current = ctx.currentTime;
        setIsPlaying(true);
        startTimeTracking();
      }).catch(() => {});
    }
  }, [startTimeTracking]);

  // ── Public: stop ──────────────────────────────────────────────

  const stop = useCallback(() => {
    stopTimeTracking();

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {
        // already stopped
      }
      sourceNodeRef.current = null;
    }

    // Resume a suspended context so it can be reused
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    setIsPlaying(false);
    setIsLoading(false);
    setCurrentTime(0);
    setDuration(0);
  }, [stopTimeTracking]);

  // ── Cleanup on unmount ────────────────────────────────────────

  useEffect(() => {
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }

      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch {
          // already stopped
        }
        sourceNodeRef.current = null;
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    play,
    playBlob,
    pause,
    resume,
    stop,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    analyserNode,
  };
}
