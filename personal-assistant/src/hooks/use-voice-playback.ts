'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface QueueItem {
  text: string;
}

export interface UseVoicePlayback {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
}

export function useVoicePlayback(): UseVoicePlayback {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const isPlayingRef = useRef(false);
  const stoppedRef = useRef(false);

  // Lazily initialise or resume AudioContext
  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  // Play a single text utterance
  const playOne = useCallback(async (text: string): Promise<void> => {
    const ctx = getAudioContext();

    const res = await fetch('/api/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[use-voice-playback] TTS request failed:', res.status, errBody);
      return;
    }

    const arrayBuffer = await res.arrayBuffer();
    if (stoppedRef.current) return;

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    if (stoppedRef.current) return;

    return new Promise<void>((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      sourceNodeRef.current = source;

      source.onended = () => {
        sourceNodeRef.current = null;
        resolve();
      };

      source.start(0);
    });
  }, [getAudioContext]);

  // Process the queue sequentially
  const processQueue = useCallback(async () => {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;
    setIsSpeaking(true);

    while (queueRef.current.length > 0 && !stoppedRef.current) {
      const item = queueRef.current.shift();
      if (!item) break;

      try {
        await playOne(item.text);
      } catch (err) {
        console.error('[use-voice-playback] Playback error:', err);
      }
    }

    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, [playOne]);

  const speak = useCallback(async (text: string): Promise<void> => {
    stoppedRef.current = false;
    queueRef.current.push({ text });
    // If not already processing, kick off the queue
    if (!isPlayingRef.current) {
      await processQueue();
    }
  }, [processQueue]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    queueRef.current = [];

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {
        // Already stopped — ignore
      }
      sourceNodeRef.current = null;
    }

    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      queueRef.current = [];
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch {
          // Already stopped
        }
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return { speak, stop, isSpeaking };
}
