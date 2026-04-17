'use client'

/**
 * useVoiceInput — dictate mode for the chat input.
 *
 * Records audio via MediaRecorder, sends it to /api/voice/session +
 * /api/voice/transcribe for server-side Whisper transcription. This replaces
 * the browser's SpeechRecognition API which only works reliably in Chrome
 * and breaks behind VPNs/firewalls.
 *
 * The public surface is identical to the old hook so VoicePill doesn't change.
 */

import { useCallback, useRef, useState, useEffect } from 'react'

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

interface UseVoiceInputOptions {
  lang?: string
}

export function useVoiceInput(
  onResult?: (text: string) => void,
  _options: UseVoiceInputOptions = {},
): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const rafRef = useRef<number>(0)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  // MediaRecorder is available in all modern browsers
  const isSupported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator?.mediaDevices?.getUserMedia === 'function'

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

  const cleanup = useCallback(() => {
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
    mediaRecorderRef.current = null
    chunksRef.current = []
    setFrequencyData(null)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const transcribeBlob = useCallback(async (blob: Blob) => {
    setTranscript('Transcribing...')
    try {
      const form = new FormData()
      form.append('audio', blob, 'audio.webm')

      const res = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: form,
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(body || `Transcription failed (${res.status})`)
      }

      const data = (await res.json()) as { text?: string }
      const text = (data.text || '').trim()

      if (!text) {
        setTranscript('')
        setError('No speech detected')
        return
      }

      setTranscript(text)
      onResultRef.current?.(text)
      setTranscript('')
    } catch (err) {
      setTranscript('')
      setError(err instanceof Error ? err.message : 'Transcription failed')
    }
  }, [])

  const stopListening = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state === 'recording') {
      recorder.stop() // triggers onstop → transcribeBlob
    } else {
      setIsListening(false)
      cleanup()
    }
  }, [cleanup])

  const startListening = useCallback(async () => {
    if (!isSupported) return
    setError(null)
    setTranscript('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      // Set up analyser for waveform visualization
      const ctx = new AudioContext()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)
      analyserRef.current = analyser

      // Set up MediaRecorder
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = chunksRef.current.length > 0
          ? new Blob(chunksRef.current, { type: recorder.mimeType })
          : null
        setIsListening(false)
        cleanup()

        if (blob && blob.size > 0) {
          transcribeBlob(blob)
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsListening(true)
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
          setError('Microphone access denied')
        } else if (err.name === 'NotFoundError') {
          setError('Microphone unavailable')
        } else {
          setError('Could not access microphone')
        }
      } else {
        setError('Could not access microphone')
      }
      cleanup()
    }
  }, [isSupported, cleanup, transcribeBlob])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { mediaRecorderRef.current?.stop() } catch { /* noop */ }
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop())
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

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
