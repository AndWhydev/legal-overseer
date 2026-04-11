'use client';

import { useCallback, useRef } from 'react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

function playTone(
  ctx: AudioContext,
  startHz: number,
  endHz: number,
  durationSec: number,
  gain: number
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(startHz, ctx.currentTime);
  oscillator.frequency.linearRampToValueAtTime(endHz, ctx.currentTime + durationSec);

  gainNode.gain.setValueAtTime(gain, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + durationSec);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + durationSec);
}

export interface UseVoiceFeedback {
  onRecordStart: () => void;
  onRecordStop: () => void;
}

export function useVoiceFeedback(): UseVoiceFeedback {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : (typeof (window as any).webkitAudioContext !== 'undefined'
              ? (window as any).webkitAudioContext
              : null);
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    return audioCtxRef.current!;
  }, []);

  const onRecordStart = useCallback(() => {
    if (prefersReducedMotion()) return;

    const ctx = getAudioContext();
    if (ctx) {
      // Rising tone: 300 -> 500Hz, 80ms, gain 0.08
      playTone(ctx, 300, 500, 0.08, 0.08);
    }

    // Short pulse: 50ms
    vibrate(50);
  }, [getAudioContext]);

  const onRecordStop = useCallback(() => {
    if (prefersReducedMotion()) return;

    const ctx = getAudioContext();
    if (ctx) {
      // Falling tone: 500 -> 300Hz, 80ms, gain 0.08
      playTone(ctx, 500, 300, 0.08, 0.08);
    }

    // Double pulse: 30ms on, 30ms off, 30ms on
    vibrate([30, 30, 30]);
  }, [getAudioContext]);

  return { onRecordStart, onRecordStop };
}
