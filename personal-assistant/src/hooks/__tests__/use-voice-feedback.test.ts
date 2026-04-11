import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceFeedback } from '../use-voice-feedback';

// Mock Web Audio API
const mockOscillator = {
  type: 'sine' as OscillatorType,
  frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

const mockGain = {
  gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
  connect: vi.fn(),
};

const mockAudioContext = {
  createOscillator: vi.fn(() => ({ ...mockOscillator })),
  createGain: vi.fn(() => ({ ...mockGain })),
  currentTime: 0,
  destination: {},
};

function setupMatchMedia(prefersReducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? prefersReducedMotion : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('useVoiceFeedback', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));
    vi.stubGlobal('webkitAudioContext', undefined);
    setupMatchMedia(false);
    Object.defineProperty(navigator, 'vibrate', {
      value: vi.fn(() => true),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns onRecordStart and onRecordStop functions', () => {
    const { result } = renderHook(() => useVoiceFeedback());

    expect(typeof result.current.onRecordStart).toBe('function');
    expect(typeof result.current.onRecordStop).toBe('function');
  });

  it('returns stable references across renders (memoized)', () => {
    const { result, rerender } = renderHook(() => useVoiceFeedback());

    const firstStart = result.current.onRecordStart;
    const firstStop = result.current.onRecordStop;

    rerender();

    expect(result.current.onRecordStart).toBe(firstStart);
    expect(result.current.onRecordStop).toBe(firstStop);
  });

  it('skips sounds and haptics when prefers-reduced-motion is set', () => {
    setupMatchMedia(true);

    const { result } = renderHook(() => useVoiceFeedback());

    act(() => {
      result.current.onRecordStart();
    });

    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it('creates audio and vibration on onRecordStart when motion is allowed', () => {
    const { result } = renderHook(() => useVoiceFeedback());

    act(() => {
      result.current.onRecordStart();
    });

    // AudioContext should have been created lazily
    expect(AudioContext).toHaveBeenCalled();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
    // Vibrate with short pulse
    expect(navigator.vibrate).toHaveBeenCalledWith(50);
  });

  it('creates audio and vibration on onRecordStop when motion is allowed', () => {
    const { result } = renderHook(() => useVoiceFeedback());

    act(() => {
      result.current.onRecordStop();
    });

    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
    // Vibrate with double pulse pattern
    expect(navigator.vibrate).toHaveBeenCalledWith([30, 30, 30]);
  });
});
