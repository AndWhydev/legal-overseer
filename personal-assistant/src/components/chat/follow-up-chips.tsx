'use client'

import React from 'react'
import { motion } from 'motion/react'

/**
 * Convert AI-perspective suggestion text into a user-directed command.
 * e.g. "Want me to do a full refresh?" -> "Do a full refresh"
 *      "Should I check the logs?"      -> "Check the logs"
 *      "I can draft a reply for you"   -> "Draft a reply"
 */
function toUserCommand(text: string): string {
  let result = text.trim()

  // Strip trailing question mark for cleaner processing (re-add if needed)
  const hadQuestion = result.endsWith('?')
  if (hadQuestion) result = result.slice(0, -1).trim()

  // Pattern: "Want me to <action>" / "Do you want me to <action>"
  const wantMe = result.match(/^(?:do you |would you )?want me to\s+(.+)$/i)
  if (wantMe) return capitalizeFirst(wantMe[1])

  // Pattern: "Should I <action>" / "Shall I <action>"
  const shouldI = result.match(/^(?:should|shall) I\s+(.+)$/i)
  if (shouldI) return capitalizeFirst(shouldI[1])

  // Pattern: "I can <action> (for you)" / "I could <action>"
  const iCan = result.match(/^I (?:can|could)\s+(.+?)(?:\s+for you)?$/i)
  if (iCan) return capitalizeFirst(iCan[1])

  // Pattern: "Would you like me to <action>"
  const wouldLike = result.match(/^would you like (?:me to|if I)\s+(.+)$/i)
  if (wouldLike) return capitalizeFirst(wouldLike[1])

  // Pattern: "Let me <action>" -> keep as-is (already imperative-ish)
  // Pattern: "How about I <action>" / "How about we <action>"
  const howAbout = result.match(/^how about (?:I|we)\s+(.+)$/i)
  if (howAbout) return capitalizeFirst(howAbout[1])

  // No transformation needed, return original (with question mark stripped)
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
  // If we can find a word boundary, cut there; otherwise hard cut
  const cutPoint = lastSpace > maxLen * 0.4 ? lastSpace : maxLen
  return text.slice(0, cutPoint).replace(/[,;:\s]+$/, '') + '...'
}

interface FollowUpChipsProps {
  suggestions: string[]
  onSelect: (text: string) => void
}

export function FollowUpChips({ suggestions, onSelect }: FollowUpChipsProps) {
  if (suggestions.length === 0) return null

  // Transform suggestions from AI-perspective to user commands, then truncate sanely
  const userSuggestions = suggestions.map(s => smartTruncate(toUserCommand(s)))

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.3 }}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, maxWidth: 600 }}
    >
      {userSuggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            background: 'var(--glass-bg, rgba(15, 20, 30, 0.35))',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
            color: 'var(--text-secondary, #94A3B8)',
            fontSize: 13,
            cursor: 'pointer',
            transition: 'all 150ms',
            whiteSpace: 'nowrap',
            textAlign: 'left',
            lineHeight: 1.4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.03)' }}
        >
          {s}
        </button>
      ))}
    </motion.div>
  )
}
