import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VoiceActivityDetector } from '../vad'

// Mock requestAnimationFrame / cancelAnimationFrame
let rafCallback: FrameRequestCallback | null = null
let rafId = 0

// Manual clock for Date.now
let mockNow = 0

function createMockAnalyser(frequencyData: Uint8Array): AnalyserNode {
  return {
    frequencyBinCount: frequencyData.length,
    getByteFrequencyData: vi.fn((array: Uint8Array) => {
      array.set(frequencyData)
    }),
    fftSize: frequencyData.length * 2,
    minDecibels: -100,
    maxDecibels: -30,
    smoothingTimeConstant: 0.8,
  } as unknown as AnalyserNode
}

function triggerRafCycles(count: number) {
  for (let i = 0; i < count; i++) {
    if (rafCallback) {
      rafCallback(mockNow)
    }
  }
}

function advanceTime(ms: number) {
  mockNow += ms
}

describe('VoiceActivityDetector', () => {
  const originalDateNow = Date.now

  beforeEach(() => {
    rafId = 0
    rafCallback = null
    mockNow = 1000 // Start at a non-zero time

    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      rafCallback = cb
      return ++rafId
    }))

    vi.stubGlobal('cancelAnimationFrame', vi.fn(() => {
      rafCallback = null
    }))

    Date.now = () => mockNow
  })

  afterEach(() => {
    Date.now = originalDateNow
    vi.restoreAllMocks()
  })

  it('start() begins monitoring and sets isActive to true', () => {
    const analyser = createMockAnalyser(new Uint8Array(128))
    const vad = new VoiceActivityDetector({ analyser })

    expect(vad.isActive).toBe(false)

    vad.start()

    expect(vad.isActive).toBe(true)
    expect(requestAnimationFrame).toHaveBeenCalled()
  })

  it('stop() cleans up and sets isActive to false', () => {
    const analyser = createMockAnalyser(new Uint8Array(128))
    const vad = new VoiceActivityDetector({ analyser })

    vad.start()
    expect(vad.isActive).toBe(true)

    vad.stop()

    expect(vad.isActive).toBe(false)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('detects speech when energy exceeds energyFloor', () => {
    const freqData = new Uint8Array(128)
    for (let i = 2; i <= 40; i++) {
      freqData[i] = 100
    }

    const analyser = createMockAnalyser(freqData)
    const onSpeechStart = vi.fn()
    const vad = new VoiceActivityDetector({
      analyser,
      energyFloor: 15,
      onSpeechStart,
    })

    vad.start()
    triggerRafCycles(1)

    expect(vad.isSpeaking).toBe(true)
    expect(onSpeechStart).toHaveBeenCalledOnce()
  })

  it('does not detect speech when energy is below energyFloor', () => {
    const freqData = new Uint8Array(128)
    for (let i = 2; i <= 40; i++) {
      freqData[i] = 5
    }

    const analyser = createMockAnalyser(freqData)
    const onSpeechStart = vi.fn()
    const vad = new VoiceActivityDetector({
      analyser,
      energyFloor: 15,
      onSpeechStart,
    })

    vad.start()
    triggerRafCycles(1)

    expect(vad.isSpeaking).toBe(false)
    expect(onSpeechStart).not.toHaveBeenCalled()
  })

  it('fires onSpeechEnd after silence exceeds silenceThresholdMs', () => {
    const freqData = new Uint8Array(128)
    for (let i = 2; i <= 40; i++) {
      freqData[i] = 100
    }

    const analyser = createMockAnalyser(freqData)
    const onSpeechEnd = vi.fn()
    const vad = new VoiceActivityDetector({
      analyser,
      silenceThresholdMs: 1500,
      energyFloor: 15,
      onSpeechEnd,
    })

    // Speech detected
    vad.start()
    triggerRafCycles(1)
    expect(vad.isSpeaking).toBe(true)

    // Drop to silence
    for (let i = 2; i <= 40; i++) {
      freqData[i] = 0
    }

    // First silent frame — starts the silence timer
    triggerRafCycles(1)
    expect(onSpeechEnd).not.toHaveBeenCalled()

    // Advance time but not past threshold
    advanceTime(1000)
    triggerRafCycles(1)
    expect(onSpeechEnd).not.toHaveBeenCalled()

    // Advance past the silence threshold
    advanceTime(600)
    triggerRafCycles(1)

    expect(onSpeechEnd).toHaveBeenCalledOnce()
    expect(vad.isSpeaking).toBe(false)
  })

  it('does not fire onSpeechEnd if speech resumes before threshold', () => {
    const freqData = new Uint8Array(128)
    for (let i = 2; i <= 40; i++) {
      freqData[i] = 100
    }

    const analyser = createMockAnalyser(freqData)
    const onSpeechEnd = vi.fn()
    const vad = new VoiceActivityDetector({
      analyser,
      silenceThresholdMs: 1500,
      energyFloor: 15,
      onSpeechEnd,
    })

    vad.start()
    triggerRafCycles(1)
    expect(vad.isSpeaking).toBe(true)

    // Go silent
    for (let i = 2; i <= 40; i++) {
      freqData[i] = 0
    }
    triggerRafCycles(1)

    // Advance time but NOT past the threshold
    advanceTime(800)
    triggerRafCycles(1)

    // Resume speech
    for (let i = 2; i <= 40; i++) {
      freqData[i] = 100
    }
    triggerRafCycles(1)

    // Advance past original threshold — should NOT fire
    advanceTime(1000)
    triggerRafCycles(1)

    expect(onSpeechEnd).not.toHaveBeenCalled()
  })

  it('emits normalized energy via onEnergyChange', () => {
    const freqData = new Uint8Array(128)
    for (let i = 2; i <= 40; i++) {
      freqData[i] = 127
    }

    const analyser = createMockAnalyser(freqData)
    const onEnergyChange = vi.fn()
    const vad = new VoiceActivityDetector({
      analyser,
      onEnergyChange,
    })

    vad.start()
    triggerRafCycles(1)

    expect(onEnergyChange).toHaveBeenCalled()
    const energy = onEnergyChange.mock.calls[0][0]
    // 127/255 ~ 0.498
    expect(energy).toBeGreaterThan(0.4)
    expect(energy).toBeLessThan(0.6)
  })

  it('reset() clears the silence timer', () => {
    const freqData = new Uint8Array(128)
    for (let i = 2; i <= 40; i++) {
      freqData[i] = 100
    }

    const analyser = createMockAnalyser(freqData)
    const onSpeechEnd = vi.fn()
    const vad = new VoiceActivityDetector({
      analyser,
      silenceThresholdMs: 1500,
      energyFloor: 15,
      onSpeechEnd,
    })

    vad.start()
    triggerRafCycles(1)

    // Go silent
    for (let i = 2; i <= 40; i++) {
      freqData[i] = 0
    }
    triggerRafCycles(1)
    advanceTime(1000)

    // Reset before threshold
    vad.reset()

    // Advance past what would have been the threshold
    advanceTime(1000)
    triggerRafCycles(1)

    // Should not have fired because reset cleared silenceStartedAt
    expect(onSpeechEnd).not.toHaveBeenCalled()
  })

  it('does not call onSpeechStart multiple times without onSpeechEnd between', () => {
    const freqData = new Uint8Array(128)
    for (let i = 2; i <= 40; i++) {
      freqData[i] = 100
    }

    const analyser = createMockAnalyser(freqData)
    const onSpeechStart = vi.fn()
    const vad = new VoiceActivityDetector({
      analyser,
      onSpeechStart,
    })

    vad.start()
    advanceTime(16)
    triggerRafCycles(1)
    advanceTime(16)
    triggerRafCycles(1)
    advanceTime(16)
    triggerRafCycles(1)
    advanceTime(16)
    triggerRafCycles(1)
    advanceTime(16)
    triggerRafCycles(1)

    expect(onSpeechStart).toHaveBeenCalledOnce()
  })
})
