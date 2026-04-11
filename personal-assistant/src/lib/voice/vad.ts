/**
 * Voice Activity Detection using Web Audio API AnalyserNode.
 *
 * Monitors audio energy in the voice frequency range (100Hz-3kHz)
 * and fires callbacks when speech starts/ends based on configurable thresholds.
 */

export interface VADOptions {
  /** How long silence must persist before firing onSpeechEnd (default: 1500ms) */
  silenceThresholdMs?: number
  /** Minimum average energy (0-255) to count as speech (default: 15) */
  energyFloor?: number
  /** AnalyserNode from an existing AudioContext */
  analyser: AnalyserNode
  /** Called when speech begins */
  onSpeechStart?: () => void
  /** Called after silence exceeds silenceThresholdMs */
  onSpeechEnd?: () => void
  /** Called each frame with normalized energy level (0-1) */
  onEnergyChange?: (energy: number) => void
}

const DEFAULT_SILENCE_THRESHOLD_MS = 1500
const DEFAULT_ENERGY_FLOOR = 15

/** First voice-range bin index (~100Hz for 44.1kHz/256-point FFT) */
const VOICE_BIN_START = 2
/** Last voice-range bin index (~3kHz) */
const VOICE_BIN_END = 40

export class VoiceActivityDetector {
  private readonly analyser: AnalyserNode
  private readonly silenceThresholdMs: number
  private readonly energyFloor: number
  private readonly onSpeechStart?: () => void
  private readonly onSpeechEnd?: () => void
  private readonly onEnergyChange?: (energy: number) => void

  private _isActive = false
  private _isSpeaking = false
  private rafHandle: number | null = null
  private silenceStartedAt: number | null = null
  private frequencyData: Uint8Array

  constructor(options: VADOptions) {
    this.analyser = options.analyser
    this.silenceThresholdMs = options.silenceThresholdMs ?? DEFAULT_SILENCE_THRESHOLD_MS
    this.energyFloor = options.energyFloor ?? DEFAULT_ENERGY_FLOOR
    this.onSpeechStart = options.onSpeechStart
    this.onSpeechEnd = options.onSpeechEnd
    this.onEnergyChange = options.onEnergyChange
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount)
  }

  get isActive(): boolean {
    return this._isActive
  }

  get isSpeaking(): boolean {
    return this._isSpeaking
  }

  /** Begin monitoring audio for voice activity. */
  start(): void {
    if (this._isActive) return
    this._isActive = true
    this.silenceStartedAt = null
    this.loop()
  }

  /** Stop monitoring and clean up. */
  stop(): void {
    this._isActive = false
    this._isSpeaking = false
    this.silenceStartedAt = null
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }
  }

  /** Reset the silence timer without stopping monitoring. */
  reset(): void {
    this.silenceStartedAt = null
  }

  private loop = (): void => {
    if (!this._isActive) return

    this.analyser.getByteFrequencyData(this.frequencyData)

    const energy = this.calculateVoiceEnergy()
    const normalizedEnergy = energy / 255

    this.onEnergyChange?.(normalizedEnergy)

    const now = Date.now()

    if (energy >= this.energyFloor) {
      // Speech detected
      this.silenceStartedAt = null

      if (!this._isSpeaking) {
        this._isSpeaking = true
        this.onSpeechStart?.()
      }
    } else if (this._isSpeaking) {
      // Below energy floor while previously speaking — track silence duration
      if (this.silenceStartedAt === null) {
        this.silenceStartedAt = now
      } else if (now - this.silenceStartedAt >= this.silenceThresholdMs) {
        this._isSpeaking = false
        this.silenceStartedAt = null
        this.onSpeechEnd?.()
      }
    }

    this.rafHandle = requestAnimationFrame(this.loop)
  }

  /**
   * Calculate average energy across voice frequency bins (100Hz-3kHz).
   * Uses bins 2-40 of a 128-bin FFT (assuming 44.1kHz sample rate).
   */
  private calculateVoiceEnergy(): number {
    const end = Math.min(VOICE_BIN_END, this.frequencyData.length - 1)
    let sum = 0
    let count = 0

    for (let i = VOICE_BIN_START; i <= end; i++) {
      sum += this.frequencyData[i]
      count++
    }

    return count > 0 ? sum / count : 0
  }
}
