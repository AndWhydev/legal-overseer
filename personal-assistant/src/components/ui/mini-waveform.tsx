'use client';

import React, { useEffect, useRef } from 'react';

interface MiniWaveformProps {
  frequencyData: Uint8Array | null;
  barCount?: number;
  isActive?: boolean;
}

const BAR_COUNT_DEFAULT = 20;

/**
 * Scrolling waveform: new audio enters LEFT, scrolls RIGHT.
 * All bars use foreground color. Uses a ref to frequencyData to avoid stale closures.
 */
export function MiniWaveform({
  frequencyData,
  barCount = BAR_COUNT_DEFAULT,
  isActive = false,
}: MiniWaveformProps) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const bufferRef = useRef<Float32Array>(new Float32Array(barCount));
  const rafRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const freqRef = useRef<Uint8Array | null>(null);

  // Keep freq data ref in sync without triggering effect re-run
  freqRef.current = frequencyData;

  useEffect(() => {
    if (!isActive) {
      bufferRef.current.fill(0);
      barsRef.current.forEach((bar) => {
        if (bar) {
          bar.style.height = '2px';
          bar.style.opacity = '0.15';
        }
      });
      return;
    }

    const PUSH_EVERY = 3;

    const animate = () => {
      const buffer = bufferRef.current;
      const freq = freqRef.current;
      frameCountRef.current++;

      // Compute current voice level
      let currentLevel = 0;
      if (freq && freq.length > 0) {
        // Voice frequencies: bins ~2-40 out of 128 (roughly 100Hz-3kHz at 44.1kHz)
        const start = 2;
        const end = Math.min(40, freq.length);
        let peak = 0;
        for (let i = start; i < end; i++) {
          if (freq[i] > peak) peak = freq[i];
        }
        // Use peak (not average) for more reactive bars
        currentLevel = Math.pow(peak / 255, 0.6);
      }

      // Every N frames, shift buffer RIGHT and push new level on LEFT
      if (frameCountRef.current % PUSH_EVERY === 0) {
        for (let i = barCount - 1; i > 0; i--) {
          buffer[i] = buffer[i - 1];
        }
        buffer[0] = currentLevel;
      } else {
        // Smooth the leftmost bar between pushes
        buffer[0] = buffer[0] * 0.3 + currentLevel * 0.7;
      }

      // Render
      for (let i = 0; i < barCount; i++) {
        const bar = barsRef.current[i];
        if (!bar) continue;
        const val = buffer[i];
        const h = Math.max(2, val * 22);
        bar.style.height = `${h}px`;
        bar.style.opacity = `${0.15 + val * 0.85}`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    bufferRef.current.fill(0);
    frameCountRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, barCount]);

  return (
    <div className="flex items-center gap-0.5 h-[22px] flex-1 min-w-0">
      {Array.from({ length: barCount }, (_, i) => (
        <div
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          className="bg-foreground/90 w-0 flex-[1_1_0] min-h-[2px] rounded-[1px] will-change-[height,opacity]"
          style={{ height: '2px', opacity: 0.15 }}
        />
      ))}
    </div>
  );
}

export default MiniWaveform;
