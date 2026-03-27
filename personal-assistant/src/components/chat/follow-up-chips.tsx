'use client'

import React from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'

/**
 * Convert AI-perspective suggestion text into a user-directed command.
 */
function toUserCommand(text: string): string {
  let result = text.trim()

  const hadQuestion = result.endsWith('?')
  if (hadQuestion) result = result.slice(0, -1).trim()

  const wantMe = result.match(/^(?:do you |would you )?want me to\s+(.+)$/i)
  if (wantMe) return capitalizeFirst(wantMe[1])

  const shouldI = result.match(/^(?:should|shall) I\s+(.+)$/i)
  if (shouldI) return capitalizeFirst(shouldI[1])

  const iCan = result.match(/^I (?:can|could)\s+(.+?)(?:\s+for you)?$/i)
  if (iCan) return capitalizeFirst(iCan[1])

  const wouldLike = result.match(/^would you like (?:me to|if I)\s+(.+)$/i)
  if (wouldLike) return capitalizeFirst(wouldLike[1])

  const howAbout = result.match(/^how about (?:I|we)\s+(.+)$/i)
  if (howAbout) return capitalizeFirst(howAbout[1])

  return hadQuestion ? result : text.trim()
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Truncate text at a word boundary with ellipsis if over maxLen */
function smartTruncate(text: string, maxLen: number = 72): string {
  if (text.length <= maxLen) return text
  const truncated = text.slice(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  const cutPoint = lastSpace > maxLen * 0.4 ? lastSpace : maxLen
  return text.slice(0, cutPoint).replace(/[,;:\s]+$/, '') + '...'
}

interface FollowUpChipsProps {
  suggestions: string[]
  onSelect: (text: string) => void
}

export function FollowUpChips({ suggestions, onSelect }: FollowUpChipsProps) {
  if (suggestions.length === 0) return null

  const userSuggestions = suggestions.map(s => smartTruncate(toUserCommand(s)))

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.3 }}
      className="flex flex-wrap gap-1.5 mt-2 max-w-[600px]"
    >
      {userSuggestions.map((s, i) => (
        <Button
          key={i}
          variant="outline"
          size="sm"
          onClick={() => onSelect(s)}
          className="rounded-full text-muted-foreground hover:text-foreground hover:border-primary/30 whitespace-nowrap text-left leading-relaxed"
        >
          {s}
        </Button>
      ))}
    </motion.div>
  )
}
