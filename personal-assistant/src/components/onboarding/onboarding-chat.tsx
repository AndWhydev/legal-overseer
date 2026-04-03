'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MessageBubble } from '@/components/chat/message-bubble'
import { ChatInput } from '@/components/chat/chat-input'
import { BitBitHeader } from '@/components/chat/bitbit-header'
import { WorldGraph } from './world-graph'
import { useOnboardingStream, type ChatMessage } from './use-onboarding-stream'
import { motion, AnimatePresence } from 'motion/react'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { useSmartScroll } from '@/components/chat/use-smart-scroll'
import { IconChevronDown } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Calendar } from 'lucide-react'

interface OnboardingChatProps {
  hasConnection: boolean
  onComplete: (threadId: string) => void
}

/** Adapt onboarding ChatMessage to the Message shape MessageBubble expects */
function adaptMessage(msg: ChatMessage) {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp),
  }
}

const PROVIDERS = [
  { id: 'gmail', label: 'Gmail', icon: Mail, oauthPath: '/api/channels/oauth/gmail' },
  { id: 'outlook', label: 'Outlook', icon: Mail, oauthPath: '/api/channels/oauth/outlook' },
  { id: 'google-calendar', label: 'Calendar', icon: Calendar, oauthPath: '/api/channels/oauth/google-calendar' },
]

function handleOAuthConnect(providerId: string) {
  const provider = PROVIDERS.find(p => p.id === providerId)
  if (!provider) return
  document.cookie = 'bb-onboarding-active=1; path=/; max-age=3600; SameSite=Lax'
  window.location.href = `${provider.oauthPath}?return=/onboard`
}

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
  const [showConnectionCard, setShowConnectionCard] = useState(!hasConnection)
  const [streamStarted, setStreamStarted] = useState(false)

  const smartScroll = useSmartScroll(scrollAreaRef)

  // Start stream once connected
  useEffect(() => {
    if (hasConnection && !streamStarted) {
      setStreamStarted(true)
      setShowConnectionCard(false)
      void startStream()
    }
  }, [hasConnection, streamStarted, startStream])

  // Notify parent on completion
  useEffect(() => {
    if (phase === 'complete' && threadId) {
      const timer = setTimeout(() => onComplete(threadId), 500)
      return () => clearTimeout(timer)
    }
  }, [phase, threadId, onComplete])

  const isInputEnabled = phase === 'crawling' || phase === 'synthesizing' || phase === 'reveal'
  const isActive = phase === 'crawling' || phase === 'synthesizing' || phase === 'ingesting'

  return (
    <div className="bb-chat flex flex-col h-full">
      {/* Messages */}
      <div className="bb-chat__messages flex-1 overflow-y-auto" ref={scrollAreaRef}>
        <div className="bb-chat__msg-list">
          {/* Initial greeting + connection card (before stream starts) */}
          {!streamStarted && (
            <>
              <div>
                <BitBitHeader />
                <MessageBubble
                  message={{
                    id: 'greeting',
                    role: 'assistant',
                    content: "Hey \u2014 I'm BitBit. Give me access to your email and I'll figure out the rest.",
                    timestamp: new Date(),
                  }}
                />
              </div>

              {/* Inline connection card — below the greeting, in the message lane */}
              {showConnectionCard && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4, ease: 'easeOut' }}
                  className="mt-4"
                >
                  <Card className="w-full max-w-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">Connect an account</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      {PROVIDERS.map(provider => (
                        <Button
                          key={provider.id}
                          variant="outline"
                          className="justify-start gap-3 h-11"
                          onClick={() => handleOAuthConnect(provider.id)}
                        >
                          <provider.icon className="h-4 w-4" />
                          {provider.label}
                        </Button>
                      ))}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </>
          )}

          {/* Stream messages */}
          {messages.map((msg, i) => {
            const prev = messages[i - 1]
            const showHeader = msg.role === 'assistant' && (!prev || prev.role !== 'assistant')
            return (
              <div key={msg.id} className={prev && prev.role !== msg.role ? 'bb-chat__msg-group-gap' : ''}>
                {showHeader && <BitBitHeader />}
                <MessageBubble message={adaptMessage(msg)} />
              </div>
            )
          })}

          {/* Loading shimmer during active phases */}
          {isActive && (
            <div>
              {messages.length === 0 || messages[messages.length - 1].role !== 'assistant' ? <BitBitHeader /> : null}
              <div className="bb-chat__bubble--assistant bb-chat__markdown">
                <Shimmer duration={1.2} as="span">Reading through your world...</Shimmer>
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

          {/* Agent activation message */}
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

          {/* "Let's go" button */}
          {phase === 'complete' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="flex justify-center my-8"
            >
              <Button
                size="lg"
                onClick={() => threadId && onComplete(threadId)}
                className="px-8"
              >
                Let&#8217;s go
              </Button>
            </motion.div>
          )}

          {/* Error state */}
          {error && (
            <div>
              <BitBitHeader />
              <div className="bb-chat__bubble--assistant text-destructive">
                <p>{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setStreamStarted(false)
                    void startStream()
                  }}
                >
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scroll-to-bottom + Input area */}
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
        <div id="onboarding-input" className="w-full pointer-events-auto">
          <ChatInput
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
