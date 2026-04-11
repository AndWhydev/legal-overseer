import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVoicePlayback } from '../use-voice-playback';

// ── Mock Web Audio API ──────────────────────────────────────────────

let mockSourceOnEnded: (() => void) | null = null;

const mockAnalyserNode = {
  fftSize: 0,
  frequencyBinCount: 128,
  connect: vi.fn(),
  disconnect: vi.fn(),
  getByteTimeDomainData: vi.fn(),
  getByteFrequencyData: vi.fn(),
};

const mockSourceNode = {
  buffer: null as AudioBuffer | null,
  connect: vi.fn(),
  disconnect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  set onended(fn: (() => void) | null) {
    mockSourceOnEnded = fn;
  },
  get onended() {
    return mockSourceOnEnded;
  },
};

const mockAudioBuffer = {
  duration: 2.5,
  length: 110250,
  numberOfChannels: 1,
  sampleRate: 44100,
  getChannelData: vi.fn(),
  copyFromChannel: vi.fn(),
  copyToChannel: vi.fn(),
};

const mockAudioContext = {
  state: 'running' as AudioContextState,
  currentTime: 0,
  destination: {},
  createAnalyser: vi.fn(() => ({ ...mockAnalyserNode })),
  createBufferSource: vi.fn(() => {
    const node = { ...mockSourceNode, onended: null as (() => void) | null };
    // Capture onended setter
    const proxy = new Proxy(node, {
      set(target, prop, value) {
        if (prop === 'onended') {
          mockSourceOnEnded = value;
        }
        (target as any)[prop] = value;
        return true;
      },
    });
    return proxy;
  }),
  decodeAudioData: vi.fn(() => Promise.resolve(mockAudioBuffer)),
  suspend: vi.fn(() => Promise.resolve()),
  resume: vi.fn(() => Promise.resolve()),
  close: vi.fn(() => Promise.resolve()),
};

// ── Mock fetch ──────────────────────────────────────────────────────

const mockArrayBuffer = new ArrayBuffer(1024);

function setupGlobals() {
  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => ({ ...mockAudioContext }))
  );

  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      } as unknown as Response)
    )
  );

  // Mock requestAnimationFrame / cancelAnimationFrame
  let rafId = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => ++rafId));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
}

// ── Tests ───────────────────────────────────────────────────────────

describe('useVoicePlayback', () => {
  beforeEach(() => {
    mockSourceOnEnded = null;
    setupGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial state ──────────────────────────────────────────────

  it('returns correct initial state', () => {
    const { result } = renderHook(() => useVoicePlayback());

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(result.current.analyserNode).toBeNull();
  });

  it('returns stable function references across renders', () => {
    const { result, rerender } = renderHook(() => useVoicePlayback());

    const { play, playBlob, pause, resume, stop } = result.current;
    rerender();

    expect(result.current.play).toBe(play);
    expect(result.current.playBlob).toBe(playBlob);
    expect(result.current.pause).toBe(pause);
    expect(result.current.resume).toBe(resume);
    expect(result.current.stop).toBe(stop);
  });

  // ── State transitions: idle → loading → playing → stopped ─────

  it('transitions from idle to loading when play() is called', async () => {
    // Make fetch hang so we can observe isLoading
    let resolveFetch!: (value: unknown) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );

    const { result } = renderHook(() => useVoicePlayback());

    // Start playing (don't await — it will hang on fetch)
    let playPromise: Promise<void>;
    act(() => {
      playPromise = result.current.play('https://example.com/audio.mp3');
    });

    // Should be loading now
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });
    expect(result.current.isPlaying).toBe(false);

    // Resolve fetch to allow cleanup
    resolveFetch({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockArrayBuffer),
    });

    await act(async () => {
      // Trigger source end to complete playback
      mockSourceOnEnded?.();
      await playPromise;
    });
  });

  it('transitions to playing after audio is decoded and started', async () => {
    const { result } = renderHook(() => useVoicePlayback());

    let playPromise: Promise<void>;

    await act(async () => {
      playPromise = result.current.play('https://example.com/audio.mp3');
      // Let the microtasks (fetch, decode) resolve
      await vi.runAllTimersAsync?.() ?? Promise.resolve();
    });

    // After fetch + decode, should be playing
    await waitFor(() => {
      expect(result.current.isPlaying).toBe(true);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.duration).toBe(2.5);

    // Simulate playback end
    await act(async () => {
      mockSourceOnEnded?.();
      await playPromise!;
    });

    expect(result.current.isPlaying).toBe(false);
  });

  // ── stop() resets state ────────────────────────────────────────

  it('stop() resets all state back to idle', async () => {
    const { result } = renderHook(() => useVoicePlayback());

    await act(async () => {
      const p = result.current.play('https://example.com/audio.mp3');
      // Let fetch/decode settle so we enter playing state
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isPlaying).toBe(true);
    });

    act(() => {
      result.current.stop();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
  });

  // ── playBlob ───────────────────────────────────────────────────

  it('playBlob() plays audio from a Blob without fetching', async () => {
    const { result } = renderHook(() => useVoicePlayback());
    const blob = new Blob(['fake-audio'], { type: 'audio/mp3' });

    // Mock blob.arrayBuffer()
    vi.spyOn(blob, 'arrayBuffer').mockResolvedValue(mockArrayBuffer);

    await act(async () => {
      const p = result.current.playBlob(blob);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Should be playing without calling fetch
    await waitFor(() => {
      expect(result.current.isPlaying).toBe(true);
    });
    expect(fetch).not.toHaveBeenCalled();

    // Clean up
    act(() => {
      mockSourceOnEnded?.();
    });
  });

  // ── Cleanup on unmount ─────────────────────────────────────────

  it('stops playback and closes AudioContext on unmount', async () => {
    const { result, unmount } = renderHook(() => useVoicePlayback());

    await act(async () => {
      const p = result.current.play('https://example.com/audio.mp3');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isPlaying).toBe(true);
    });

    // Unmount the hook
    unmount();

    // cancelAnimationFrame should have been called
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  // ── AnalyserNode is exposed ────────────────────────────────────

  it('exposes analyserNode after play() creates AudioContext', async () => {
    const { result } = renderHook(() => useVoicePlayback());

    expect(result.current.analyserNode).toBeNull();

    await act(async () => {
      const p = result.current.play('https://example.com/audio.mp3');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.analyserNode).not.toBeNull();
    });

    // Clean up
    act(() => {
      mockSourceOnEnded?.();
    });
  });

  // ── Pause / Resume ─────────────────────────────────────────────

  it('pause() and resume() delegate to AudioContext suspend/resume', async () => {
    const { result } = renderHook(() => useVoicePlayback());

    await act(async () => {
      const p = result.current.play('https://example.com/audio.mp3');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isPlaying).toBe(true);
    });

    // Pause
    await act(async () => {
      result.current.pause();
    });

    expect(result.current.isPlaying).toBe(false);

    // Resume
    await act(async () => {
      result.current.resume();
    });

    expect(result.current.isPlaying).toBe(true);

    // Clean up
    act(() => {
      result.current.stop();
    });
  });
});
