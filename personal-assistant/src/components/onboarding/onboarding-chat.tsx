'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { MessageBubble } from '@/components/chat/message-bubble'
import { OnboardingInput } from './onboarding-input'
import { BitBitHeader } from '@/components/chat/bitbit-header'
import { WorldGraph } from './world-graph'
import { useOnboardingStream, type ChatMessage } from './use-onboarding-stream'
import { motion, AnimatePresence } from 'motion/react'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { useSmartScroll } from '@/components/chat/use-smart-scroll'
import { IconChevronDown, IconCheck } from '@tabler/icons-react'

interface OnboardingChatProps {
  hasConnection: boolean
  onComplete: (threadId: string) => void
}

function adaptMessage(msg: ChatMessage) {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp),
  }
}

const APP_ICONS: Record<string, string> = {
  gmail: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/95/1f/0a/951f0a84-ae7e-ca5a-49da-cd8b0611a963/logo_gmail_2020q4_color-0-1x_U007emarketing-0-0-0-7-0-0-0-0-85-220-0.png/120x120bb.jpg',
  outlook: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/07/35/55/07355553-d782-158a-12f2-daa122973b2b/AppIcon-outlook.prod-0-0-1x_U007epad-0-1-0-0-85-220.png/120x120bb.jpg',
  'google-calendar': 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/fd/3b/8a/fd3b8acf-96ad-ada9-87b8-0f40ae53ff94/calendar_2020q4-0-1x_U007epad-0-0-0-1-0-0-0-0-85-220-0.png/120x120bb.jpg',
  slack: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/43/1b/06/431b06ff-3c7a-6506-26c2-ef44089c9339/slack_icon_prod-0-0-1x_U007epad-0-1-sRGB-85-220.png/120x120bb.jpg',
}

function AppIcon({ id, size = 36 }: { id: string; size?: number }) {
  const src = APP_ICONS[id]
  if (!src) return null
  const radius = Math.round(size * 0.2237)
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0"
      style={{ borderRadius: radius, width: size, height: size }}
    />
  )
}

const EMAIL_PROVIDERS = [
  { id: 'gmail', label: 'Gmail', sublabel: 'Google Workspace or personal' },
  { id: 'outlook', label: 'Outlook', sublabel: 'Microsoft 365 or personal' },
]

const EXTRA_PROVIDERS = [
  { id: 'google-calendar', label: 'Google Calendar', sublabel: 'Meetings and events' },
  { id: 'slack', label: 'Slack', sublabel: 'Team messages' },
]

type ConnectionState = 'pick-email' | 'connecting' | 'connected' | 'crawling'

export function OnboardingChat({ hasConnection, onComplete }: OnboardingChatProps) {
  const {
    messages,
    phase,
    worldModel,
    stats,
    activatedAgents,
    threadId,
    error,
    startStream,
    sendReply,
  } = useOnboardingStream()

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [connState, setConnState] = useState<ConnectionState>(hasConnection ? 'crawling' : 'pick-email')
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [connectedProvider, setConnectedProvider] = useState<string | null>(null)
  const [connectedExtras, setConnectedExtras] = useState<Set<string>>(new Set())
  const [streamStarted, setStreamStarted] = useState(false)
  const [showExtras, setShowExtras] = useState(false)

  const smartScroll = useSmartScroll(scrollAreaRef)

  /** Verify a channel is actually connected in the DB */
  const verifyConnection = useCallback(async (channelId: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/channels/status')
      if (!res.ok) return false
      const data = (await res.json()) as { channels?: Array<{ type: string; connected: boolean }> }
      return (data.channels ?? []).some(ch => ch.type === channelId && ch.connected)
    } catch {
      return false
    }
  }, [])

  /** OAuth via popup, with verification after close */
  const handleConnect = useCallback(async (id: string, isExtra = false) => {
    try {
      setConnectingId(id)
      if (!isExtra) setConnState('connecting')

      const res = await fetch('/api/channels/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: id }),
      })

      if (!res.ok) {
        setConnectingId(null)
        if (!isExtra) setConnState('pick-email')
        return
      }

      const data = (await res.json()) as { redirect?: boolean; url?: string }
      if (!data.redirect || !data.url) {
        setConnectingId(null)
        if (!isExtra) setConnState('pick-email')
        return
      }

      const popup = window.open(data.url, `connect_${id}`, 'width=600,height=720,scrollbars=yes')

      if (!popup) {
        window.location.assign(data.url)
        return
      }

      // Poll for popup close, then verify connection
      const timer = window.setInterval(async () => {
        if (!popup.closed) return
        window.clearInterval(timer)
        setConnectingId(null)

        // Verify the connection actually succeeded
        const verified = await verifyConnection(id)

        if (verified) {
          if (isExtra) {
            setConnectedExtras(prev => new Set(prev).add(id))
          } else {
            setConnectedProvider(id)
            setConnState('connected')
          }
        } else {
          // OAuth was cancelled or failed
          if (!isExtra) setConnState('pick-email')
        }
      }, 500)
    } catch {
      setConnectingId(null)
      if (!isExtra) setConnState('pick-email')
    }
  }, [verifyConnection])

  // After "connected" state, auto-transition to crawling
  useEffect(() => {
    if (connState === 'connected') {
      const timer = setTimeout(() => {
        setConnState('crawling')
        setShowExtras(true)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [connState])

  // Start stream once in crawling state
  useEffect(() => {
    if (connState === 'crawling' && !streamStarted) {
      setStreamStarted(true)
      void startStream()
    }
  }, [connState, streamStarted, startStream])

  // Hide extras once synthesis starts
  useEffect(() => {
    if (phase === 'synthesizing' || phase === 'reveal' || phase === 'complete') {
      setShowExtras(false)
    }
  }, [phase])

  // Notify parent on completion
  useEffect(() => {
    if (phase === 'complete' && threadId) {
      const timer = setTimeout(() => onComplete(threadId), 500)
      return () => clearTimeout(timer)
    }
  }, [phase, threadId, onComplete])

  const isInputEnabled = phase === 'crawling' || phase === 'synthesizing' || phase === 'reveal'
  const isActive = phase === 'crawling' || phase === 'synthesizing' || phase === 'ingesting'
  const lastAssistantIdx = messages.length - 1 - [...messages].reverse().findIndex(m => m.role === 'assistant')

  // Dynamic greeting based on state
  const greetingText = connState === 'connected' && connectedProvider
    ? `${connectedProvider.charAt(0).toUpperCase() + connectedProvider.slice(1)} connected. Give me a moment to read through everything\u2026`
    : connState === 'crawling'
      ? null // No static greeting once crawling — stream messages take over
      : "Hey \u2014 I'm BitBit. Connect your email and I'll learn your world."

  return (
    <div className="bb-chat flex flex-col h-full">
      <div className="bb-chat__messages flex-1 overflow-y-auto" ref={scrollAreaRef}>
        <div className="bb-chat__msg-list">
          {/* Greeting message */}
          {greetingText && (
            <div>
              <BitBitHeader />
              <MessageBubble
                message={{
                  id: `greeting-${connState}`,
                  role: 'assistant',
                  content: greetingText,
                  timestamp: new Date(),
                }}
                isStreaming={connState === 'connected'}
              />
            </div>
          )}

          {/* Phase 1: Email picker */}
          <AnimatePresence mode="wait">
            {connState === 'pick-email' && (
              <motion.div
                key="email-picker"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, delay: 0.3, ease: 'easeOut' }}
                className="mt-2 flex flex-col gap-2 max-w-sm"
              >
                {EMAIL_PROVIDERS.map(provider => (
                  <button
                    key={provider.id}
                    type="button"
                    disabled={connectingId !== null}
                    onClick={() => handleConnect(provider.id)}
                    className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-50"
                  >
                    <AppIcon id={provider.id} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{provider.label}</div>
                      <div className="text-xs text-muted-foreground">{provider.sublabel}</div>
                    </div>
                    {connectingId === provider.id && (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}

            {/* Connecting state — spinner with provider name */}
            {connState === 'connecting' && connectingId && (
              <motion.div
                key="connecting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex items-center gap-3"
              >
                <AppIcon id={connectingId} size={36} />
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  <span className="text-sm text-muted-foreground">Waiting for {connectingId.charAt(0).toUpperCase() + connectingId.slice(1)}&hellip;</span>
                </div>
              </motion.div>
            )}

            {/* Connected state — checkmark with provider name */}
            {connState === 'connected' && connectedProvider && (
              <motion.div
                key="connected"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex items-center gap-3"
              >
                <AppIcon id={connectedProvider} size={36} />
                <div className="flex items-center gap-2">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.1 }}
                  >
                    <IconCheck size={18} className="text-green-500" />
                  </motion.div>
                  <span className="text-sm font-medium">Connected</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stream messages */}
          {messages.map((msg, i) => {
            const prev = messages[i - 1]
            const showHeader = msg.role === 'assistant' && (!prev || prev.role !== 'assistant')
            const isLatestAssistant = i === lastAssistantIdx && msg.role === 'assistant'
            return (
              <div key={msg.id} className={prev && prev.role !== msg.role ? 'bb-chat__msg-group-gap' : ''}>
                {showHeader && <BitBitHeader />}
                <MessageBubble
                  message={adaptMessage(msg)}
                  isStreaming={isLatestAssistant && isActive}
                />
              </div>
            )
          })}

          {/* Phase 2: Optional extras while crawl runs */}
          <AnimatePresence>
            {showExtras && isActive && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, delay: 0.6 }}
                className="mt-4"
              >
                <p className="text-xs text-muted-foreground mb-2">Connect more while I read?</p>
                <div className="flex gap-2 flex-wrap">
                  {EXTRA_PROVIDERS.map(provider => (
                    <button
                      key={provider.id}
                      type="button"
                      disabled={connectingId !== null || connectedExtras.has(provider.id)}
                      onClick={() => handleConnect(provider.id, true)}
                      className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2 text-sm transition-colors hover:bg-accent/50 disabled:opacity-50"
                    >
                      <AppIcon id={provider.id} size={24} />
                      <span>{provider.label}</span>
                      {connectedExtras.has(provider.id) && <IconCheck size={14} className="text-green-500" />}
                      {connectingId === provider.id && (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading shimmer */}
          {isActive && (
            <div className="mt-2">
              {messages.length === 0 || messages[messages.length - 1].role !== 'assistant' ? <BitBitHeader /> : null}
              <div className="bb-chat__bubble--assistant bb-chat__markdown">
                <Shimmer duration={1.2} as="span">
                  {phase === 'crawling' ? 'Reading through your messages...' : phase === 'synthesizing' ? 'Putting it all together...' : 'Setting things up...'}
                </Shimmer>
              </div>
            </div>
          )}

          {/* Knowledge graph reveal */}
          <AnimatePresence>
            {worldModel && stats && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="my-6"
              >
                <WorldGraph worldModel={worldModel} stats={stats} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Agent activation */}
          {activatedAgents && (
            <div className="bb-chat__msg-group-gap">
              <BitBitHeader />
              <MessageBubble
                message={{
                  id: 'agents-activated',
                  role: 'assistant',
                  content: `Set up ${activatedAgents.activated.join(', ')} based on what I see. Adjust anytime.`,
                  timestamp: new Date(),
                }}
              />
            </div>
          )}

          {/* Let's go */}
          {phase === 'complete' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="flex justify-center my-8"
            >
              <Button size="lg" onClick={() => threadId && onComplete(threadId)} className="px-8">
                Let&#8217;s go
              </Button>
            </motion.div>
          )}

          {/* Error */}
          {error && (
            <div>
              <BitBitHeader />
              <div className="bb-chat__bubble--assistant text-destructive">
                <p>{error}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => { setStreamStarted(false); void startStream() }}>
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="bb-chat__input-area bb-chat__input-area--bottom">
        <AnimatePresence>
          {smartScroll.shouldShowScrollButton && (
            <motion.button
              className="bb-chat__scroll-btn"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              onClick={smartScroll.scrollToBottom}
              aria-label="Scroll to bottom"
            >
              <IconChevronDown size={18} />
            </motion.button>
          )}
        </AnimatePresence>
        <div className="w-full pointer-events-auto">
          <OnboardingInput
            onSend={sendReply}
            disabled={!isInputEnabled}
            placeholder={
              phase === 'reveal'
                ? 'Tap a node to explore, or type to correct anything...'
                : 'Message BitBit...'
            }
          />
        </div>
      </div>
    </div>
  )
}
