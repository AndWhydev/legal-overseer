// @vitest-environment jsdom
/**
 * Unit tests for useVoiceInput — the Web Speech API wrapper that powers
 * mic input in the docked chat composer (VoicePill).
 *
 * We mock SpeechRecognition, AudioContext, and getUserMedia to exercise
 * every branch deterministically.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useVoiceInput } from '../use-voice-input'

// ─── Mock SpeechRecognition ──────────────────────────────────────────

interface MockResults {
  length: number
  [index: number]: { isFinal: boolean; 0: { transcript: string; confidence: number } }
}

class MockSpeechRecognition extends EventTarget {
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((event: { results: MockResults }) => void) | null = null
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null

  start = vi.fn()
  stop = vi.fn()

  // Test helpers
  fireResult(text: string, isFinal: boolean) {
    const results: MockResults = {
      length: 1,
      0: {
        isFinal,
        0: { transcript: text, confidence: 0.9 },
      },
    }
    this.onresult?.({ results })
  }

  fireError(error: string) {
    this.onerror?.({ error })
  }

  fireEnd() {
    this.onend?.()
  }
}

// Latest-constructed instance so tests can fire events into it
let lastRecognition: MockSpeechRecognition | null = null

// Constructor-style so `new SpeechRecognition()` works. Arrow functions cannot
// be used as constructors, so we use a function declaration that assigns to
// `this` and stores the instance for test helpers to interact with.
function SpeechRecognitionCtor(this: MockSpeechRecognition) {
  const instance = new MockSpeechRecognition()
  lastRecognition = instance
  return instance
}

// ─── Mock AudioContext / AnalyserNode ───────────────────────────────

function makeMockAudioContext() {
  return {
    createAnalyser: vi.fn(() => ({
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
      connect: vi.fn(),
    })),
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
    close: vi.fn(() => Promise.resolve()),
    state: 'running',
  }
}

function MockAudioContextCtor(this: unknown) {
  return makeMockAudioContext()
}

function makeMockStream() {
  return {
    getTracks: () => [{ stop: vi.fn(), kind: 'audio' }],
  } as unknown as MediaStream
}

// ─── Test setup ──────────────────────────────────────────────────────

describe('useVoiceInput', () => {
  beforeEach(() => {
    lastRecognition = null
    vi.stubGlobal('SpeechRecognition', SpeechRecognitionCtor)
    vi.stubGlobal('webkitSpeechRecognition', SpeechRecognitionCtor)
    vi.stubGlobal('AudioContext', MockAudioContextCtor)

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(() => Promise.resolve(makeMockStream())),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // ─── Capability detection ──────────────────────────────────────────

  it('reports isSupported=false when neither SpeechRecognition API is present', () => {
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', undefined)
    // Manually remove from window because `'key' in window` is what the hook checks
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition

    const { result } = renderHook(() => useVoiceInput())
    expect(result.current.isSupported).toBe(false)
  })

  it('reports isSupported=true when SpeechRecognition is present', () => {
    const { result } = renderHook(() => useVoiceInput())
    expect(result.current.isSupported).toBe(true)
  })

  // ─── Lifecycle ─────────────────────────────────────────────────────

  it('startListening sets isListening=true and calls recognition.start()', async () => {
    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.isListening).toBe(true)
    expect(lastRecognition).not.toBeNull()
    expect(lastRecognition!.start).toHaveBeenCalledTimes(1)
  })

  it('stopListening clears transcript and stops tracks', async () => {
    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    // Populate some interim transcript
    act(() => {
      lastRecognition!.fireResult('hello there', false)
    })
    expect(result.current.transcript).toBe('hello there')

    act(() => {
      result.current.stopListening()
    })

    expect(result.current.isListening).toBe(false)
    expect(result.current.transcript).toBe('')
    expect(lastRecognition!.stop).toHaveBeenCalled()
  })

  // ─── Results ───────────────────────────────────────────────────────

  it('interim result updates transcript but does NOT call onResult', async () => {
    const onResult = vi.fn()
    const { result } = renderHook(() => useVoiceInput(onResult))

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      lastRecognition!.fireResult('partial ', false)
    })

    expect(result.current.transcript).toBe('partial ')
    expect(onResult).not.toHaveBeenCalled()
  })

  it('final result calls onResult with the text and clears transcript', async () => {
    const onResult = vi.fn()
    const { result } = renderHook(() => useVoiceInput(onResult))

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      lastRecognition!.fireResult('send this message', true)
    })

    expect(onResult).toHaveBeenCalledWith('send this message')
    expect(result.current.transcript).toBe('')
  })

  // ─── Error mapping ─────────────────────────────────────────────────

  it('recognition "not-allowed" error surfaces "Microphone access denied"', async () => {
    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      lastRecognition!.fireError('not-allowed')
    })

    expect(result.current.error).toBe('Microphone access denied')
    expect(result.current.isListening).toBe(false)
  })

  it('recognition "network" error surfaces a network message', async () => {
    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      lastRecognition!.fireError('network')
    })

    expect(result.current.error).toBe('Network error — try again')
  })

  it('recognition "no-speech" error is benign and does not surface', async () => {
    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      lastRecognition!.fireError('no-speech')
    })

    expect(result.current.error).toBe(null)
    expect(result.current.isListening).toBe(false)
  })

  it('getUserMedia NotAllowedError surfaces "Microphone access denied"', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(() =>
      Promise.reject(new DOMException('denied', 'NotAllowedError')),
    )

    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Microphone access denied')
    })
    expect(result.current.isListening).toBe(false)
    // Recognition should never have been constructed because we bailed early
    expect(lastRecognition).toBeNull()
  })

  it('getUserMedia NotFoundError surfaces "Microphone unavailable"', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(() =>
      Promise.reject(new DOMException('none', 'NotFoundError')),
    )

    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Microphone unavailable')
    })
  })

  it('startListening clears prior error', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(() =>
      Promise.reject(new DOMException('denied', 'NotAllowedError')),
    )

    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })
    await waitFor(() => expect(result.current.error).toBe('Microphone access denied'))

    // Now succeed
    navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.resolve(makeMockStream()))

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.error).toBe(null)
    expect(result.current.isListening).toBe(true)
  })

  it('clearError() resets error to null', async () => {
    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      lastRecognition!.fireError('not-allowed')
    })
    expect(result.current.error).toBe('Microphone access denied')

    act(() => {
      result.current.clearError()
    })
    expect(result.current.error).toBe(null)
  })

  // ─── Toggle ────────────────────────────────────────────────────────

  it('toggleListening starts when idle and stops when listening', async () => {
    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.toggleListening()
    })
    expect(result.current.isListening).toBe(true)

    act(() => {
      result.current.toggleListening()
    })
    expect(result.current.isListening).toBe(false)
  })

  // ─── Language ──────────────────────────────────────────────────────

  it('uses navigator.language by default', async () => {
    Object.defineProperty(navigator, 'language', {
      value: 'es-ES',
      configurable: true,
    })

    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    expect(lastRecognition).not.toBeNull()
    expect(lastRecognition!.lang).toBe('es-ES')
  })

  it('explicit lang override wins over navigator.language', async () => {
    Object.defineProperty(navigator, 'language', {
      value: 'es-ES',
      configurable: true,
    })

    const { result } = renderHook(() => useVoiceInput(undefined, { lang: 'fr-FR' }))

    await act(async () => {
      await result.current.startListening()
    })

    expect(lastRecognition!.lang).toBe('fr-FR')
  })

  // ─── Unmount cleanup ───────────────────────────────────────────────

  it('stops recognition and releases media tracks on unmount', async () => {
    const trackStop = vi.fn()
    navigator.mediaDevices.getUserMedia = vi.fn(() =>
      Promise.resolve({
        getTracks: () => [{ stop: trackStop, kind: 'audio' } as unknown as MediaStreamTrack],
      } as unknown as MediaStream),
    )

    const { result, unmount } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    expect(lastRecognition).not.toBeNull()
    const stopSpy = lastRecognition!.stop

    unmount()

    expect(stopSpy).toHaveBeenCalled()
    expect(trackStop).toHaveBeenCalled()
  })
})
