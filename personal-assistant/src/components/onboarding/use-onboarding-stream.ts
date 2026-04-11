'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { OnboardingStreamEvent, RevealWorldModel, RevealStats } from '@/lib/onboarding/stream-types'

export interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  timestamp: number
}

export interface OnboardingStreamState {
  messages: ChatMessage[]
  phase: 'idle' | 'connecting' | 'crawling' | 'synthesizing' | 'ingesting' | 'reveal' | 'complete' | 'error'
  progress: number
  worldModel: RevealWorldModel | null
  stats: RevealStats | null
  activatedAgents: { activated: string[]; reasons: Record<string, string> } | null
  threadId: string | null
  error: string | null
}

export function useOnboardingStream() {
  const [state, setState] = useState<OnboardingStreamState>({
    messages: [],
    phase: 'idle',
    progress: 0,
    worldModel: null,
    stats: null,
    activatedAgents: null,
    threadId: null,
    error: null,
  })

  const eventSourceRef = useRef<EventSource | null>(null)
  const messageIdCounter = useRef(0)

  const addMessage = useCallback((role: 'assistant' | 'user', content: string, id?: string) => {
    const msgId = id || `msg-${++messageIdCounter.current}`
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, { id: msgId, role, content, timestamp: Date.now() }],
    }))
  }, [])

  const startStream = useCallback(async () => {
    setState(prev => ({ ...prev, phase: 'connecting' }))

    try {
      const res = await fetch('/api/onboarding/conversation', { method: 'POST' })

      if (!res.ok || !res.body) {
        setState(prev => ({ ...prev, phase: 'error', error: 'Could not start onboarding' }))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      setState(prev => ({ ...prev, phase: 'crawling' }))

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6).trim()
          if (!json) continue

          try {
            const event = JSON.parse(json) as OnboardingStreamEvent

            switch (event.type) {
              case 'narration':
                addMessage('assistant', event.message, event.id)
                break
              case 'progress':
                setState(prev => ({
                  ...prev,
                  phase: event.phase as OnboardingStreamState['phase'],
                  progress: event.percent,
                }))
                break
              case 'reveal':
                setState(prev => ({
                  ...prev,
                  phase: 'reveal',
                  worldModel: event.worldModel,
                  stats: event.stats,
                }))
                break
              case 'agents':
                setState(prev => ({
                  ...prev,
                  activatedAgents: { activated: event.activated, reasons: event.reasons },
                }))
                break
              case 'complete':
                setState(prev => ({ ...prev, phase: 'complete', threadId: event.threadId }))
                break
              case 'error':
                setState(prev => ({ ...prev, phase: 'error', error: event.message }))
                break
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        phase: 'error',
        error: err instanceof Error ? err.message : 'Connection lost',
      }))
    }
  }, [addMessage])

  const sendReply = useCallback(async (message: string) => {
    addMessage('user', message)

    try {
      await fetch('/api/onboarding/conversation/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
    } catch {
      // Reply delivery failure is non-blocking
    }
  }, [addMessage])

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])

  return {
    ...state,
    startStream,
    sendReply,
  }
}
