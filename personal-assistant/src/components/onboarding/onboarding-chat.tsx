'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MessageBubble } from '@/components/chat/message-bubble'
import { ChatInput } from '@/components/chat/chat-input'
import { BitBitHeader } from '@/components/chat/bitbit-header'
import { ConnectionCard } from './connection-card'
import { WorldGraph } from './world-graph'
import { useOnboardingStream, type ChatMessage } from './use-onboarding-stream'
import { motion, AnimatePresence } from 'motion/react'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { useSmartScroll } from '@/components/chat/use-smart-scroll'
import { IconChevronDown } from '@tabler/icons-react'

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

  // Group consecutive assistant messages to only show BitBitHeader once per group
  const messageGroups: { showHeader: boolean; msg: ChatMessage }[] = messages.map((msg, i) => ({
    showHeader: msg.role === 'assistant' && (i === 0 || messages[i - 1].role !== 'assistant'),
    msg,
  }))

  return (
    <div className="bb-chat flex flex-col h-full">
      {/* Messages */}
      <div className="bb-chat__messages flex-1 overflow-y-auto" ref={scrollAreaRef}>
        <div className="bb-chat__msg-list">
          {/* Initial greeting (before stream starts) */}
          {!streamStarted && (
            <div className="bb-chat__msg bb-chat__msg--assistant">
              <BitBitHeader />
              <div className="bb-chat__bubble--assistant bb-chat__markdown">
                <p>Hey &#8212; I&#8217;m BitBit. Give me access to your email and I&#8217;ll figure out the rest.</p>
              </div>
            </div>
          )}

          {/* Stream messages */}
          {messageGroups.map(({ showHeader, msg }) => (
            <div key={msg.id} className={msg.role === 'user' ? 'bb-chat__msg bb-chat__msg--user group' : 'bb-chat__msg bb-chat__msg--assistant'}>
              {showHeader && <BitBitHeader />}
              <MessageBubble message={adaptMessage(msg)} />
            </div>
          ))}

          {/* Loading shimmer during active phases */}
          {isActive && (
            <div className="bb-chat__msg bb-chat__msg--assistant">
              {messages.length === 0 || messages[messages.length - 1].role !== 'assistant' ? <BitBitHeader /> : null}
              <Shimmer duration={1.2} as="span">Reading through your world...</Shimmer>
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
            <div className="bb-chat__msg bb-chat__msg--assistant">
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
            <div className="bb-chat__msg bb-chat__msg--assistant">
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

      {/* Scroll-to-bottom button */}
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

      {/* Chat input — same pill as dashboard chat */}
      <ChatInput
        onSend={sendReply}
        disabled={!isInputEnabled}
        placeholder={
          phase === 'reveal'
            ? 'Tap a node to explore, or type to correct anything...'
            : 'Message BitBit...'
        }
      />

      {/* Floating connection card */}
      <ConnectionCard
        visible={showConnectionCard}
        onConnect={() => {}}
      />
    </div>
  )
}
