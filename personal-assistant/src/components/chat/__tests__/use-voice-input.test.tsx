/* eslint-disable @typescript-eslint/no-this-alias -- MediaRecorder test mock requires `function()` callback binding. */
// @vitest-environment jsdom
/**
 * Unit tests for useVoiceInput — MediaRecorder + server-side Whisper.
 *
 * Mocks MediaRecorder, AudioContext, getUserMedia, and fetch to exercise
 * the full record → transcribe flow deterministically.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVoiceInput } from '../use-voice-input'

// ─── Mock MediaRecorder ────────────────────────────────────────────────

let lastRecorder: MockMediaRecorder | null = null

class MockMediaRecorder {
  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start = vi.fn(() => { this.state = 'recording' })
  stop = vi.fn(() => {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio-data'], { type: 'audio/webm' }) })
    Promise.resolve().then(() => this.onstop?.())
  })

  constructor() {
    lastRecorder = this
  }

  static isTypeSupported() { return true }
}

// ─── Mock AudioContext + AnalyserNode ──────────────────────────────────

const mockAnalyser = {
  fftSize: 0,
  smoothingTimeConstant: 0,
  frequencyBinCount: 32,
  getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(128)),
}

const mockAudioSource = { connect: vi.fn() }

class MockAudioContext {
  state = 'running'
  createMediaStreamSource = vi.fn(() => mockAudioSource)
  createAnalyser = vi.fn(() => mockAnalyser)
  close = vi.fn(() => Promise.resolve())
}

// ─── Mock getUserMedia ────────────────────────────────────────────────

const mockStream = {
  getTracks: () => [{ stop: vi.fn() }],
}

const mockGetUserMedia = vi.fn(() => Promise.resolve(mockStream))

// ─── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  lastRecorder = null

  globalThis.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder

  // @ts-expect-error — mock AudioContext
  globalThis.AudioContext = MockAudioContext
  // @ts-expect-error — mock getUserMedia
  globalThis.navigator.mediaDevices = { getUserMedia: mockGetUserMedia }

  // Mock requestAnimationFrame — do NOT invoke callback, it causes infinite recursion
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1)
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})

  // Mock fetch for /api/voice/transcribe
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ text: 'hello world' }),
    }),
  ))
})

afterEach(() => {
  vi.restoreAllMocks()
  lastRecorder = null
})

// ─── Tests ────────────────────────────────────────────────────────────

describe('useVoiceInput', () => {
  it('reports isSupported when MediaRecorder and getUserMedia exist', () => {
    const { result } = renderHook(() => useVoiceInput())
    expect(result.current.isSupported).toBe(true)
  })

  it('starts recording on startListening', async () => {
    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(result.current.isListening).toBe(true)
    expect(lastRecorder).not.toBeNull()
    expect(lastRecorder!.start).toHaveBeenCalled()
  })

  it('stops recording and transcribes on stopListening', async () => {
    const onResult = vi.fn()
    const { result } = renderHook(() => useVoiceInput(onResult))

    await act(async () => {
      await result.current.startListening()
    })

    await act(async () => {
      result.current.stopListening()
      // Wait for transcription fetch to resolve
      await new Promise(r => setTimeout(r, 10))
    })

    expect(lastRecorder!.stop).toHaveBeenCalled()
    expect(result.current.isListening).toBe(false)
    // Fetch was called with the audio blob
    expect(fetch).toHaveBeenCalledWith('/api/voice/transcribe', expect.objectContaining({
      method: 'POST',
    }))
    expect(onResult).toHaveBeenCalledWith('hello world')
  })

  it('toggleListening toggles between start and stop', async () => {
    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      result.current.toggleListening()
      await new Promise(r => setTimeout(r, 10))
    })
    expect(result.current.isListening).toBe(true)

    await act(async () => {
      result.current.toggleListening()
      await new Promise(r => setTimeout(r, 10))
    })
    expect(result.current.isListening).toBe(false)
  })

  it('shows error when getUserMedia is denied', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))

    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.error).toBe('Microphone access denied')
    expect(result.current.isListening).toBe(false)
  })

  it('shows error when transcription fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: false, text: () => Promise.resolve('Server error') }),
    ))

    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    await act(async () => {
      result.current.stopListening()
      await new Promise(r => setTimeout(r, 10))
    })

    expect(result.current.error).toBe('Server error')
  })

  it('shows "No speech detected" when Whisper returns empty text', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ text: '' }) }),
    ))

    const onResult = vi.fn()
    const { result } = renderHook(() => useVoiceInput(onResult))

    await act(async () => {
      await result.current.startListening()
    })

    await act(async () => {
      result.current.stopListening()
      await new Promise(r => setTimeout(r, 10))
    })

    expect(result.current.error).toBe('No speech detected')
    expect(onResult).not.toHaveBeenCalled()
  })

  it('clearError clears the error state', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))

    const { result } = renderHook(() => useVoiceInput())

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.error).toBe('Microphone access denied')

    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
  })
})
