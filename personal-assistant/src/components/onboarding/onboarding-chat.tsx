'use client'

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ChatBubble } from './chat-bubble'
import { ChatInput } from './chat-input'
import { ConnectionCard } from './connection-card'
import { WorldGraph } from './world-graph'
import { useOnboardingStream } from './use-onboarding-stream'
import { motion, AnimatePresence } from 'motion/react'
import { Loader2 } from 'lucide-react'

interface OnboardingChatProps {
  hasConnection: boolean
  onComplete: (threadId: string) => void
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

  const scrollRef = useRef<HTMLDivElement>(null)
  const [showConnectionCard, setShowConnectionCard] = useState(!hasConnection)
  const [streamStarted, setStreamStarted] = useState(false)

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, worldModel])

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

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Chat messages */}
      <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef}>
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          {/* Initial greeting (before stream starts) */}
          {!streamStarted && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-muted rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[80%]">
                Hey — I'm BitBit. Give me access to your email and I'll figure out the rest.
              </div>
            </motion.div>
          )}

          {/* Stream messages */}
          {messages.map(msg => (
            <ChatBubble key={msg.id} message={msg} />
          ))}

          {/* Loading indicator during active phases */}
          {(phase === 'crawling' || phase === 'synthesizing' || phase === 'ingesting') && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {phase === 'crawling' && 'Reading...'}
                  {phase === 'synthesizing' && 'Putting it together...'}
                  {phase === 'ingesting' && 'Setting things up...'}
                </span>
              </div>
            </motion.div>
          )}

          {/* Knowledge graph reveal */}
          <AnimatePresence>
            {worldModel && stats && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="my-4"
              >
                <WorldGraph
                  worldModel={worldModel}
                  stats={stats}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Agent activation message */}
          {activatedAgents && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex justify-start"
            >
              <div className="bg-muted rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[80%]">
                Set up {activatedAgents.activated.join(', ')} based on what I see. Adjust anytime.
              </div>
            </motion.div>
          )}

          {/* "Let's go" button */}
          {phase === 'complete' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="flex justify-center my-6"
            >
              <Button
                size="lg"
                onClick={() => threadId && onComplete(threadId)}
                className="px-8"
              >
                Let's go
              </Button>
            </motion.div>
          )}

          {/* Error state */}
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-destructive/10 text-destructive rounded-2xl px-4 py-3 text-sm max-w-[80%]">
                {error}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 block"
                  onClick={() => {
                    setStreamStarted(false)
                    void startStream()
                  }}
                >
                  Try again
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Chat input */}
      <ChatInput
        onSend={sendReply}
        disabled={!isInputEnabled}
        placeholder={
          phase === 'reveal' ? 'Tap a node to explore, or type to correct anything...'
            : isInputEnabled ? 'Type a reply...'
            : undefined
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
