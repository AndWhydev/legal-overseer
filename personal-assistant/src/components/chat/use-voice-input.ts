'use client'

import { useCallback, useRef, useState, useEffect } from 'react'

// Web Speech API types (not in all TS libs)
interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}
interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  start(): void
  stop(): void
}

interface UseVoiceInputReturn {
  isListening: boolean
  transcript: string
  isSupported: boolean
  frequencyData: Uint8Array | null
  error: string | null
  startListening: () => void
  stopListening: () => void
  toggleListening: () => void
  clearError: () => void
}

/**
 * Translate Web Speech API error codes into short, user-facing messages.
 * Returns `null` for errors that are benign (e.g. "no-speech") and should not
 * be surfaced to the user.
 */
function mapRecognitionError(code: string): string | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access denied'
    case 'audio-capture':
      return 'Microphone unavailable'
    case 'network':
      return 'Network error — try again'
    case 'no-speech':
    case 'aborted':
      return null
    default:
      return 'Speech recognition failed'
  }
}

function mapGetUserMediaError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      return 'Microphone access denied'
    }
    if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
      return 'Microphone unavailable'
    }
  }
  return 'Could not access microphone'
}

export function useVoiceInput(onResult?: (text: string) => void): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  // Animate frequency data while listening
  useEffect(() => {
    if (!isListening || !analyserRef.current) {
      setFrequencyData(null)
      return
    }

    const analyser = analyserRef.current
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      analyser.getByteFrequencyData(dataArray)
      setFrequencyData(new Uint8Array(dataArray))
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isListening])

  const cleanupAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    analyserRef.current = null
    setFrequencyData(null)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const startListening = useCallback(async () => {
    if (!isSupported) return
    setError(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Ctor) return

    // Set up AudioContext + analyser for waveform visualization.
    // If getUserMedia fails here, speech recognition itself also won't work
    // reliably (permission is shared), so surface an error and bail.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const ctx = new AudioContext()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)
      analyserRef.current = analyser
    } catch (err) {
      setError(mapGetUserMediaError(err))
      cleanupAudio()
      return
    }

    const recognition: SpeechRecognitionInstance = new Ctor()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-AU'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = ''
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript
      }
      setTranscript(text)
      if (event.results[0]?.isFinal && onResult) {
        onResult(text)
        setTranscript('')
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      cleanupAudio()
    }
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const mapped = mapRecognitionError(event.error)
      if (mapped) setError(mapped)
      setIsListening(false)
      cleanupAudio()
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isSupported, onResult, cleanupAudio])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
    setTranscript('')
    cleanupAudio()
  }, [cleanupAudio])

  const toggleListening = useCallback(() => {
    if (isListening) stopListening()
    else startListening()
  }, [isListening, startListening, stopListening])

  return {
    isListening,
    transcript,
    isSupported,
    frequencyData,
    error,
    startListening,
    stopListening,
    toggleListening,
    clearError,
  }
}
