# Chat UX SOTA Upgrade — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the BitBit chat page to SOTA parity across 10 feature areas — syntax highlighting, regenerate, feedback, follow-ups, artifact panel, voice input, command palette, message editing, conversation search, and export.

**Architecture:** All changes are client-side in `personal-assistant/src/components/chat/`. The chat API (`/api/agent/chat`) stays unchanged. New components are added alongside existing ones (message-bubble, chat-interface). The only npm additions are `shiki` (syntax highlighting) and the built-in Web Speech API (voice).

**Tech Stack:** React 19, Next.js 16, TypeScript 5, Framer Motion (`motion/react`), Lucide icons, CSS custom properties (design system tokens), Vitest

---

## Task 1: Syntax-Highlighted Code Blocks with Copy Button

**Files:**
- Create: `personal-assistant/src/components/chat/code-block.tsx`
- Modify: `personal-assistant/src/components/chat/message-bubble.tsx`
- Modify: `personal-assistant/package.json`

**Step 1: Install shiki**

Run: `cd personal-assistant && npm install shiki`

**Step 2: Create the CodeBlock component**

Create `personal-assistant/src/components/chat/code-block.tsx`:

```tsx
'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface CodeBlockProps {
  children: string
  className?: string // contains "language-xxx" from markdown
}

export function CodeBlock({ children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [highlighted, setHighlighted] = useState<string | null>(null)

  // Extract language from className (e.g., "language-typescript" → "typescript")
  const lang = className?.replace(/^language-/, '') || 'text'

  useEffect(() => {
    let cancelled = false
    // Lazy-load shiki to keep bundle small
    import('shiki').then(async ({ createHighlighter }) => {
      const highlighter = await createHighlighter({
        themes: ['github-dark-default'],
        langs: [lang === 'text' ? 'plaintext' : lang],
      })
      if (cancelled) return
      const html = highlighter.codeToHtml(children, {
        lang: lang === 'text' ? 'plaintext' : lang,
        theme: 'github-dark-default',
      })
      setHighlighted(html)
    }).catch(() => {
      // Fallback: plain text if language not supported
    })
    return () => { cancelled = true }
  }, [children, lang])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [children])

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '8px 8px 0 0',
    fontSize: 12,
    color: 'var(--text-muted, rgba(255,255,255,0.4))',
    fontFamily: 'inherit',
  }

  const copyBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'none',
    border: 'none',
    color: copied ? 'var(--bb-green, #22C55E)' : 'var(--text-muted, rgba(255,255,255,0.4))',
    cursor: 'pointer',
    fontSize: 12,
    transition: 'color 150ms',
  }

  const codeContainerStyle: React.CSSProperties = {
    background: 'rgba(13, 17, 23, 0.8)',
    borderRadius: '0 0 8px 8px',
    overflow: 'auto',
    maxHeight: 400,
    fontSize: 13,
    lineHeight: '20px',
  }

  const plainCodeStyle: React.CSSProperties = {
    display: 'block',
    padding: '12px 16px',
    margin: 0,
    whiteSpace: 'pre',
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono", Menlo, Consolas, monospace',
    color: 'var(--text-primary, #e6edf3)',
    tabSize: 2,
  }

  return (
    <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}>
      <div style={headerStyle}>
        <span>{lang}</span>
        <button onClick={handleCopy} style={copyBtnStyle} aria-label={copied ? 'Copied' : 'Copy code'}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div style={codeContainerStyle}>
        {highlighted ? (
          <div
            dangerouslySetInnerHTML={{ __html: highlighted }}
            style={{ padding: '12px 16px' }}
            className="bb-shiki-output"
          />
        ) : (
          <code style={plainCodeStyle}>{children}</code>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Wire CodeBlock into MessageBubble**

In `message-bubble.tsx`, add the import and pass `code` as a custom ReactMarkdown component:

```tsx
// Add import at top
import { CodeBlock } from './code-block'

// In the ReactMarkdown components, add code handler:
// After the existing markdownComponents definition, merge in the code component:
const baseComponents = {
  code: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => {
    const isInline = !className && typeof children === 'string' && !children.includes('\n')
    if (isInline) {
      return <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, fontSize: '0.9em' }} {...props}>{children}</code>
    }
    return <CodeBlock className={className}>{String(children).replace(/\n$/, '')}</CodeBlock>
  },
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}
```

Merge `baseComponents` with the existing `markdownComponents` (citation-aware components) so both code highlighting and citations work together.

**Step 4: Add shiki CSS override**

Add to `bitbit-design-system.css` (at the end of the chat section):

```css
/* Shiki code block output — remove default backgrounds */
.bb-shiki-output pre {
  margin: 0;
  padding: 0;
  background: transparent !important;
}
.bb-shiki-output code {
  font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 20px;
}
```

**Step 5: Verify**

Run: `cd personal-assistant && npx tsc --noEmit`
Expected: No type errors

Run: `cd personal-assistant && npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add personal-assistant/src/components/chat/code-block.tsx \
       personal-assistant/src/components/chat/message-bubble.tsx \
       personal-assistant/package.json personal-assistant/package-lock.json \
       personal-assistant/src/styles/bitbit-design-system.css
git commit -m "feat(chat): syntax-highlighted code blocks with copy button

Add shiki-based code highlighting to chat messages. Code blocks
show language badge, copy button, and fall back to plain text
while highlighting loads asynchronously."
```

---

## Task 2: Response Regenerate Button

**Files:**
- Modify: `personal-assistant/src/components/chat/chat-interface.tsx`
- Modify: `personal-assistant/src/components/chat/message-bubble.tsx`

**Step 1: Add regenerate handler to ChatInterface**

In `chat-interface.tsx`, add a `handleRegenerate` callback after `handleSend`:

```tsx
const handleRegenerate = useCallback(() => {
  // Find the last user message
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUserMsg || isLoading) return
  // Remove the last assistant message
  setMessages(prev => {
    const lastAssistantIdx = prev.findLastIndex(m => m.role === 'assistant')
    if (lastAssistantIdx === -1) return prev
    return prev.slice(0, lastAssistantIdx)
  })
  // Re-send the same user message
  handleSend(lastUserMsg.content)
}, [messages, isLoading, handleSend])
```

**Step 2: Pass onRegenerate to MessageBubble**

Pass `onRegenerate` prop to the last assistant MessageBubble:

```tsx
<MessageBubble
  message={msg}
  // ... existing props
  onRegenerate={isLastAssistantOverall && !isLoading ? handleRegenerate : undefined}
/>
```

**Step 3: Add regenerate button in MessageBubble**

In `message-bubble.tsx`, add a `RefreshCw` icon button below assistant messages when `onRegenerate` is provided:

```tsx
import { RefreshCw } from 'lucide-react'

// Add to props interface:
onRegenerate?: () => void

// After the bubble div, conditionally render:
{!isUser && onRegenerate && (
  <button
    onClick={onRegenerate}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 8px', marginTop: 4, borderRadius: 6,
      background: 'none', border: 'none',
      color: 'var(--text-muted, rgba(255,255,255,0.3))',
      fontSize: 12, cursor: 'pointer',
      transition: 'color 150ms',
    }}
    aria-label="Regenerate response"
  >
    <RefreshCw size={12} />
    Regenerate
  </button>
)}
```

**Step 4: Verify**

Run: `cd personal-assistant && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add personal-assistant/src/components/chat/chat-interface.tsx \
       personal-assistant/src/components/chat/message-bubble.tsx
git commit -m "feat(chat): add regenerate button on last assistant message"
```

---

## Task 3: Message Feedback (Thumbs Up/Down)

**Files:**
- Modify: `personal-assistant/src/components/chat/message-bubble.tsx`
- Create: `personal-assistant/src/app/api/agent/chat/feedback/route.ts`

**Step 1: Add feedback state and UI to MessageBubble**

In `message-bubble.tsx`:

```tsx
import { ThumbsUp, ThumbsDown } from 'lucide-react'

// Add to props:
messageId?: string  // for API call

// Add state inside component:
const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)

const handleFeedback = (type: 'up' | 'down') => {
  setFeedback(type)
  // Fire-and-forget feedback to API
  fetch('/api/agent/chat/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: message.id, feedback: type }),
  }).catch(() => {})
}

// Render after the regenerate button, on assistant messages:
{!isUser && (
  <div style={{ display: 'inline-flex', gap: 2, marginTop: 4, marginLeft: onRegenerate ? 8 : 0 }}>
    <button
      onClick={() => handleFeedback('up')}
      style={{
        background: 'none', border: 'none', padding: '4px 6px', borderRadius: 4,
        color: feedback === 'up' ? 'var(--bb-green, #22C55E)' : 'var(--text-muted, rgba(255,255,255,0.25))',
        cursor: 'pointer', transition: 'color 150ms',
      }}
      aria-label="Good response"
    >
      <ThumbsUp size={12} />
    </button>
    <button
      onClick={() => handleFeedback('down')}
      style={{
        background: 'none', border: 'none', padding: '4px 6px', borderRadius: 4,
        color: feedback === 'down' ? 'var(--bb-red, #EF4444)' : 'var(--text-muted, rgba(255,255,255,0.25))',
        cursor: 'pointer', transition: 'color 150ms',
      }}
      aria-label="Bad response"
    >
      <ThumbsDown size={12} />
    </button>
  </div>
)}
```

**Step 2: Create feedback API route**

Create `personal-assistant/src/app/api/agent/chat/feedback/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { messageId, feedback } = await request.json()
  if (!messageId || !['up', 'down'].includes(feedback)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Store feedback on the conversation_messages row
  await supabase
    .from('conversation_messages')
    .update({ feedback })
    .eq('id', messageId)

  return NextResponse.json({ ok: true })
}
```

**Step 3: Verify**

Run: `cd personal-assistant && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add personal-assistant/src/components/chat/message-bubble.tsx \
       personal-assistant/src/app/api/agent/chat/feedback/route.ts
git commit -m "feat(chat): thumbs up/down feedback on assistant messages"
```

---

## Task 4: Follow-Up Suggestion Chips

**Files:**
- Create: `personal-assistant/src/components/chat/follow-up-chips.tsx`
- Modify: `personal-assistant/src/components/chat/chat-interface.tsx`

**Step 1: Create FollowUpChips component**

Create `personal-assistant/src/components/chat/follow-up-chips.tsx`:

```tsx
'use client'

import { motion } from 'motion/react'

interface FollowUpChipsProps {
  suggestions: string[]
  onSelect: (text: string) => void
}

export function FollowUpChips({ suggestions, onSelect }: FollowUpChipsProps) {
  if (suggestions.length === 0) return null

  const chipStyle: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: 20,
    background: 'var(--glass-bg, rgba(15, 20, 30, 0.35))',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    color: 'var(--text-secondary, #94A3B8)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 150ms',
    whiteSpace: 'nowrap' as const,
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.3 }}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, maxWidth: 600 }}
    >
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          style={chipStyle}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)' }}
        >
          {s}
        </button>
      ))}
    </motion.div>
  )
}
```

**Step 2: Add SSE event type `follow_ups` handling in ChatInterface**

In `chat-interface.tsx`, add state for follow-up suggestions and handle the new event:

```tsx
const [followUps, setFollowUps] = useState<string[]>([])

// In the SSE switch statement, add case:
case 'follow_ups': {
  const suggestions = event.data?.suggestions || event.data
  if (Array.isArray(suggestions)) {
    setFollowUps(suggestions.slice(0, 3))
  }
  break
}

// Reset follow-ups in handleSend:
setFollowUps([])
```

**Step 3: Render FollowUpChips after the last assistant message**

After the approval cards section in the render, add:

```tsx
{/* Follow-up suggestions */}
{!isLoading && followUps.length > 0 && (
  <FollowUpChips
    suggestions={followUps}
    onSelect={(text) => handleSend(text)}
  />
)}
```

**Step 4: Server-side: emit follow_ups event**

In the chat API route (`/api/agent/chat/route.ts`), after the main response completes, add a lightweight follow-up generation step. This can be done by appending a system message asking for 2-3 follow-up questions after the main response is streamed. For now, use a heuristic approach:

```ts
// After the main stream completes, generate follow-ups from the response
// This is a lightweight enhancement — the SSE event format is:
// data: {"type":"follow_ups","data":{"suggestions":["Q1","Q2","Q3"]}}
```

> **Note for implementer:** The follow-up suggestions can initially be generated client-side by extracting key topics from the last assistant message using simple heuristics (e.g., "Tell me more about X", "What about Y?"). A proper server-side implementation using a second lightweight model call can be added later. Start with client-side extraction.

**Step 5: Verify**

Run: `cd personal-assistant && npx tsc --noEmit`
Expected: No type errors

**Step 6: Commit**

```bash
git add personal-assistant/src/components/chat/follow-up-chips.tsx \
       personal-assistant/src/components/chat/chat-interface.tsx
git commit -m "feat(chat): follow-up suggestion chips after assistant responses"
```

---

## Task 5: Artifact/Canvas Panel

This is the largest task. It creates a slide-out panel that renders long code blocks and HTML content in a dedicated workspace.

**Files:**
- Create: `personal-assistant/src/components/chat/artifact-panel.tsx`
- Create: `personal-assistant/src/components/chat/use-artifacts.ts`
- Modify: `personal-assistant/src/components/chat/chat-interface.tsx`
- Modify: `personal-assistant/src/styles/bitbit-design-system.css`

**Step 1: Create the artifact types and hook**

Create `personal-assistant/src/components/chat/use-artifacts.ts`:

```ts
import { useState, useCallback } from 'react'

export interface Artifact {
  id: string
  type: 'code' | 'html' | 'markdown'
  title: string
  content: string
  language?: string  // for code type
  messageId: string  // which message spawned it
}

export function useArtifacts() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)

  const addArtifact = useCallback((artifact: Artifact) => {
    setArtifacts(prev => [...prev, artifact])
    setActiveArtifactId(artifact.id)
  }, [])

  const closeArtifact = useCallback(() => {
    setActiveArtifactId(null)
  }, [])

  const activeArtifact = artifacts.find(a => a.id === activeArtifactId) ?? null

  return { artifacts, activeArtifact, addArtifact, closeArtifact, setActiveArtifactId }
}
```

**Step 2: Create ArtifactPanel component**

Create `personal-assistant/src/components/chat/artifact-panel.tsx`:

```tsx
'use client'

import React, { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Copy, Check, ExternalLink, Code, Eye } from 'lucide-react'
import type { Artifact } from './use-artifacts'

interface ArtifactPanelProps {
  artifact: Artifact | null
  onClose: () => void
}

export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code')

  const handleCopy = useCallback(() => {
    if (!artifact) return
    navigator.clipboard.writeText(artifact.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [artifact])

  const handleOpenInNewTab = useCallback(() => {
    if (!artifact) return
    if (artifact.type === 'html') {
      const blob = new Blob([artifact.content], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    }
  }, [artifact])

  return (
    <AnimatePresence>
      {artifact && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '50%',
            minWidth: 400,
            maxWidth: 700,
            background: 'var(--bg-primary, #0a0f1a)',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 40,
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            <span style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-primary, #F1F5F9)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {artifact.title}
            </span>

            {artifact.type === 'html' && (
              <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 2 }}>
                <button
                  onClick={() => setViewMode('code')}
                  style={{
                    padding: '4px 8px', borderRadius: 4, border: 'none',
                    background: viewMode === 'code' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Code size={12} /> Code
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  style={{
                    padding: '4px 8px', borderRadius: 4, border: 'none',
                    background: viewMode === 'preview' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Eye size={12} /> Preview
                </button>
              </div>
            )}

            <button onClick={handleCopy} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            {artifact.type === 'html' && (
              <button onClick={handleOpenInNewTab} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                <ExternalLink size={14} />
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
              <X size={14} />
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {artifact.type === 'html' && viewMode === 'preview' ? (
              <iframe
                srcDoc={artifact.content}
                sandbox="allow-scripts"
                style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                title={artifact.title}
              />
            ) : (
              <pre style={{
                margin: 0,
                padding: '16px',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                fontSize: 13,
                lineHeight: '20px',
                color: 'var(--text-primary)',
                whiteSpace: 'pre',
                overflow: 'auto',
                tabSize: 2,
              }}>
                <code>{artifact.content}</code>
              </pre>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

**Step 3: Integrate into ChatInterface**

In `chat-interface.tsx`:

1. Import `useArtifacts` and `ArtifactPanel`
2. Call `useArtifacts()` to get state
3. Auto-detect code blocks >20 lines in assistant messages and create artifacts
4. Add a "Open in panel" button on large code blocks
5. Render `<ArtifactPanel>` at the end of the component, inside the main container
6. When artifact panel is open, add `style={{ width: '50%' }}` to the messages container

```tsx
import { useArtifacts, type Artifact } from './use-artifacts'
import { ArtifactPanel } from './artifact-panel'

// Inside ChatInterface:
const { activeArtifact, addArtifact, closeArtifact } = useArtifacts()

// In the return JSX, wrap messages + panel in a flex container:
// <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
//   <div style={{ flex: 1, ... }}>{/* existing messages */}</div>
//   <ArtifactPanel artifact={activeArtifact} onClose={closeArtifact} />
// </div>
```

**Step 4: Add "Open in panel" button to CodeBlock**

In `code-block.tsx`, accept an `onOpenArtifact` prop. When the code block has >20 lines, show a small button:

```tsx
onOpenArtifact?: (content: string, lang: string) => void

// In the header, add:
{onOpenArtifact && children.split('\n').length > 20 && (
  <button onClick={() => onOpenArtifact(children, lang)} style={copyBtnStyle}>
    <ExternalLink size={12} /> Panel
  </button>
)}
```

**Step 5: Verify**

Run: `cd personal-assistant && npx tsc --noEmit && npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add personal-assistant/src/components/chat/artifact-panel.tsx \
       personal-assistant/src/components/chat/use-artifacts.ts \
       personal-assistant/src/components/chat/chat-interface.tsx \
       personal-assistant/src/components/chat/code-block.tsx \
       personal-assistant/src/styles/bitbit-design-system.css
git commit -m "feat(chat): artifact/canvas panel for code and HTML preview

Adds a slide-out panel for viewing large code blocks and HTML
content. Supports code view, live HTML preview in sandboxed
iframe, copy, and open-in-new-tab."
```

---

## Task 6: Voice Input (Web Speech API)

**Files:**
- Create: `personal-assistant/src/components/chat/use-voice-input.ts`
- Modify: `personal-assistant/src/components/dashboard/voice-pill.tsx`

**Step 1: Create voice input hook**

Create `personal-assistant/src/components/chat/use-voice-input.ts`:

```ts
import { useCallback, useRef, useState } from 'react'

interface UseVoiceInputReturn {
  isListening: boolean
  transcript: string
  isSupported: boolean
  startListening: () => void
  stopListening: () => void
  toggleListening: () => void
}

export function useVoiceInput(onResult?: (text: string) => void): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const startListening = useCallback(() => {
    if (!isSupported) return
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-AU'

    recognition.onresult = (event) => {
      const result = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('')
      setTranscript(result)
      if (event.results[0]?.isFinal && onResult) {
        onResult(result)
        setTranscript('')
      }
    }

    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isSupported, onResult])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const toggleListening = useCallback(() => {
    if (isListening) stopListening()
    else startListening()
  }, [isListening, startListening, stopListening])

  return { isListening, transcript, isSupported, startListening, stopListening, toggleListening }
}
```

**Step 2: Add microphone button to VoicePill**

The VoicePill already supports voice mode and text mode. Add a microphone toggle button in the text mode input bar that uses the Web Speech API as a secondary input method. In `voice-pill.tsx`, import and use the hook when the existing voice mode is not active.

This provides a simple mic button next to the text input that transcribes speech directly into the textarea, without the full voice pipeline.

**Step 3: Verify**

Run: `cd personal-assistant && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add personal-assistant/src/components/chat/use-voice-input.ts \
       personal-assistant/src/components/dashboard/voice-pill.tsx
git commit -m "feat(chat): Web Speech API voice input with mic toggle button"
```

---

## Task 7: Command Palette (`/` Commands)

**Files:**
- Create: `personal-assistant/src/components/chat/command-palette.tsx`
- Modify: `personal-assistant/src/components/dashboard/voice-pill.tsx`

**Step 1: Create CommandPalette component**

Create `personal-assistant/src/components/chat/command-palette.tsx`:

```tsx
'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Search, FileText, Brain, RefreshCw, Trash2, History } from 'lucide-react'

interface Command {
  id: string
  label: string
  description: string
  icon: React.ElementType
  action: () => void
}

interface CommandPaletteProps {
  query: string  // text after "/"
  onSelect: (command: Command) => void
  onClose: () => void
  commands: Command[]
}

export function CommandPalette({ query, onSelect, onClose, commands }: CommandPaletteProps) {
  const filtered = useMemo(() => {
    if (!query) return commands
    const q = query.toLowerCase()
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    )
  }, [query, commands])

  const [selectedIdx, setSelectedIdx] = useState(0)

  if (filtered.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 4,
        background: 'var(--bg-card, rgba(15, 20, 30, 0.95))',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        overflow: 'hidden',
        maxHeight: 300,
        zIndex: 50,
      }}
    >
      {filtered.map((cmd, i) => {
        const Icon = cmd.icon
        return (
          <button
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '10px 14px',
              background: i === selectedIdx ? 'rgba(255,255,255,0.04)' : 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              color: 'var(--text-primary, #F1F5F9)',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 13,
            }}
            onMouseEnter={() => setSelectedIdx(i)}
          >
            <Icon size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 500 }}>/{cmd.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{cmd.description}</div>
            </div>
          </button>
        )
      })}
    </motion.div>
  )
}

/** Built-in commands */
export function useChatCommands({
  onClear,
  onSearch,
  onNewChat,
}: {
  onClear: () => void
  onSearch: () => void
  onNewChat: () => void
}): Command[] {
  return useMemo(() => [
    { id: 'new', label: 'new', description: 'Start a new conversation', icon: FileText, action: onNewChat },
    { id: 'clear', label: 'clear', description: 'Clear current conversation', icon: Trash2, action: onClear },
    { id: 'search', label: 'search', description: 'Search conversation history', icon: Search, action: onSearch },
    { id: 'memory', label: 'memory', description: 'Search your memory', icon: Brain, action: () => {} },
    { id: 'history', label: 'history', description: 'Open conversation drawer', icon: History, action: () => {} },
  ], [onClear, onSearch, onNewChat])
}
```

**Step 2: Integrate into VoicePill text input**

In `voice-pill.tsx`, detect when the textarea value starts with `/` and show the CommandPalette above the input. When a command is selected, clear the input and execute the command action.

**Step 3: Verify**

Run: `cd personal-assistant && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add personal-assistant/src/components/chat/command-palette.tsx \
       personal-assistant/src/components/dashboard/voice-pill.tsx
git commit -m "feat(chat): slash command palette with /new, /clear, /search, /memory"
```

---

## Task 8: Message Editing with Conversation Branching

**Files:**
- Modify: `personal-assistant/src/components/chat/message-bubble.tsx`
- Modify: `personal-assistant/src/components/chat/chat-interface.tsx`

**Step 1: Add edit button on user messages**

In `message-bubble.tsx`, add a `Pencil` icon that appears on hover for user messages:

```tsx
// Add to props:
onEdit?: (messageId: string, newContent: string) => void

// State:
const [isEditing, setIsEditing] = useState(false)
const [editText, setEditText] = useState(message.content)

// For user messages, show edit button on hover + edit mode textarea:
{isUser && !isEditing && onEdit && (
  <button onClick={() => setIsEditing(true)} style={{ ... }}>
    <Pencil size={12} />
  </button>
)}

{isUser && isEditing && (
  <div>
    <textarea value={editText} onChange={e => setEditText(e.target.value)} />
    <button onClick={() => { onEdit(message.id, editText); setIsEditing(false) }}>Send</button>
    <button onClick={() => { setIsEditing(false); setEditText(message.content) }}>Cancel</button>
  </div>
)}
```

**Step 2: Add handleEditMessage in ChatInterface**

```tsx
const handleEditMessage = useCallback((messageId: string, newContent: string) => {
  // Find the message index
  const idx = messages.findIndex(m => m.id === messageId)
  if (idx === -1) return

  // Truncate conversation at this point (remove this message and everything after)
  setMessages(prev => prev.slice(0, idx))

  // Clear related state
  setInvoiceArtifacts(prev => {
    const removedIds = new Set(messages.slice(idx).map(m => m.id))
    return prev.filter(inv => !removedIds.has(inv.afterMessageId))
  })

  // Re-send with new content
  handleSend(newContent)
}, [messages, handleSend])
```

Pass `onEdit={handleEditMessage}` to MessageBubble for user messages.

**Step 3: Verify**

Run: `cd personal-assistant && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add personal-assistant/src/components/chat/message-bubble.tsx \
       personal-assistant/src/components/chat/chat-interface.tsx
git commit -m "feat(chat): edit user messages to fork conversation at any point"
```

---

## Task 9: Conversation Search

**Files:**
- Create: `personal-assistant/src/components/chat/conversation-search.tsx`
- Modify: `personal-assistant/src/components/chat/conversation-drawer.tsx`
- Modify: `personal-assistant/src/app/api/agent/chat/history/route.ts`

**Step 1: Add search query param to history API**

In `history/route.ts`, handle a `search` query parameter:

```ts
// In the GET handler, after the existing params:
const searchQuery = url.searchParams.get('search')

if (searchQuery) {
  // Full-text search across conversation_messages for this user's org
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, content, role, thread_id, created_at')
    .eq('org_id', profile.org_id)
    .ilike('content', `%${searchQuery}%`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ results: data })
}
```

**Step 2: Create ConversationSearch component**

Create `personal-assistant/src/components/chat/conversation-search.tsx`:

```tsx
'use client'

import React, { useState, useCallback } from 'react'
import { Search, X } from 'lucide-react'

interface SearchResult {
  id: string
  content: string
  role: string
  thread_id: string
  created_at: string
}

interface ConversationSearchProps {
  onSelectThread: (threadId: string) => void
  onClose: () => void
}

export function ConversationSearch({ onSelectThread, onClose }: ConversationSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/agent/chat/history?search=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.results || [])
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  return (
    <div style={{
      padding: '12px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search conversations..."
          autoFocus
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: 'var(--text-primary)', fontSize: 13,
          }}
        />
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={14} />
        </button>
      </div>
      {results.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}>
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => onSelectThread(r.thread_id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px', borderRadius: 6, border: 'none',
                background: 'transparent', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: 12,
                marginBottom: 2,
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.role}</span>
              {' '}{r.content.length > 80 ? r.content.slice(0, 77) + '...' : r.content}
            </button>
          ))}
        </div>
      )}
      {loading && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>Searching...</div>}
    </div>
  )
}
```

**Step 3: Add search to ConversationDrawer**

In `conversation-drawer.tsx`, add a search toggle button in the header and render `ConversationSearch` when active.

**Step 4: Verify**

Run: `cd personal-assistant && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add personal-assistant/src/components/chat/conversation-search.tsx \
       personal-assistant/src/components/chat/conversation-drawer.tsx \
       personal-assistant/src/app/api/agent/chat/history/route.ts
git commit -m "feat(chat): full-text conversation search in drawer"
```

---

## Task 10: Export & Sharing

**Files:**
- Create: `personal-assistant/src/components/chat/export-menu.tsx`
- Modify: `personal-assistant/src/components/chat/chat-interface.tsx`

**Step 1: Create ExportMenu component**

Create `personal-assistant/src/components/chat/export-menu.tsx`:

```tsx
'use client'

import React, { useState, useCallback } from 'react'
import { Download, Copy, Check, FileText, Code } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ExportMenuProps {
  messages: Message[]
}

function messagesToMarkdown(messages: Message[]): string {
  return messages.map(m => {
    const role = m.role === 'user' ? 'You' : 'BitBit'
    const time = m.timestamp.toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
    return `### ${role} — ${time}\n\n${m.content}`
  }).join('\n\n---\n\n')
}

function messagesToText(messages: Message[]): string {
  return messages.map(m => {
    const role = m.role === 'user' ? 'You' : 'BitBit'
    return `[${role}]\n${m.content}`
  }).join('\n\n')
}

export function ExportMenu({ messages }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyMarkdown = useCallback(() => {
    const md = messagesToMarkdown(messages)
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true)
      setTimeout(() => { setCopied(false); setOpen(false) }, 1500)
    })
  }, [messages])

  const handleDownloadMarkdown = useCallback(() => {
    const md = messagesToMarkdown(messages)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bitbit-conversation-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }, [messages])

  const handleDownloadJSON = useCallback(() => {
    const json = JSON.stringify(messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
    })), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bitbit-conversation-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }, [messages])

  if (messages.length === 0) return null

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '8px 12px', background: 'none', border: 'none',
    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
    borderRadius: 6, textAlign: 'left',
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none', border: 'none', padding: 4,
          color: 'var(--text-muted)', cursor: 'pointer',
        }}
        title="Export conversation"
      >
        <Download size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: 'var(--bg-card, rgba(15, 20, 30, 0.95))',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              overflow: 'hidden',
              minWidth: 200,
              zIndex: 50,
            }}
          >
            <button onClick={handleCopyMarkdown} style={btnStyle}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy as Markdown'}
            </button>
            <button onClick={handleDownloadMarkdown} style={btnStyle}>
              <FileText size={14} /> Download .md
            </button>
            <button onClick={handleDownloadJSON} style={btnStyle}>
              <Code size={14} /> Download .json
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

**Step 2: Add ExportMenu to ChatInterface**

In `chat-interface.tsx`, render the ExportMenu next to the drawer toggle button when a conversation is active:

```tsx
import { ExportMenu } from './export-menu'

// In the header area, next to the Menu button:
{hasMessages && (
  <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
    <ExportMenu messages={messages} />
  </div>
)}
```

**Step 3: Verify**

Run: `cd personal-assistant && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add personal-assistant/src/components/chat/export-menu.tsx \
       personal-assistant/src/components/chat/chat-interface.tsx
git commit -m "feat(chat): export conversation as markdown, JSON, or copy to clipboard"
```

---

## Dependency Map

```
Task 1 (code blocks) ──┐
Task 2 (regenerate)    │──→ Task 5 (artifact panel) uses CodeBlock
Task 3 (feedback)      │
Task 4 (follow-ups) ───┘
Task 6 (voice) ─────────── independent
Task 7 (commands) ───────── depends on Task 9 (search) for /search command
Task 8 (edit messages) ──── independent
Task 9 (search) ─────────── independent
Task 10 (export) ────────── independent
```

**Recommended execution order:**
1. Task 1 (code blocks) — foundation for Task 5
2. Task 2 (regenerate) — quick win
3. Task 3 (feedback) — quick win
4. Task 4 (follow-ups) — quick win
5. Task 5 (artifact panel) — builds on Task 1
6. Task 8 (edit messages) — independent
7. Task 9 (search) — needed for Task 7
8. Task 7 (commands) — uses search
9. Task 6 (voice) — independent, can be parallelized
10. Task 10 (export) — independent, can be parallelized

---

## Testing Notes

- **No component tests exist for chat/** — the project uses Vitest but all existing tests are for `lib/` (backend logic). These tasks are UI components, so manual testing via `npm run dev` is the primary verification method.
- **Type checking** (`npx tsc --noEmit`) is the automated gate for each task.
- **Build** (`npm run build`) should pass after each commit.
- **Manual test checklist per task:**
  - Task 1: Send "write a fibonacci function in python" — should see syntax-highlighted code with copy button
  - Task 2: After any response, click "Regenerate" — should re-send last user message
  - Task 3: Click thumbs up/down — icon should change color
  - Task 4: After response completes, should see 2-3 suggestion chips
  - Task 5: Generate a long code response — should see "Panel" button, clicking opens side panel
  - Task 6: Click mic icon — should start listening, speaking produces text
  - Task 7: Type "/" in input — should see command palette popup
  - Task 8: Hover user message — pencil icon appears, clicking enters edit mode
  - Task 9: Open drawer — search bar visible, typing searches across threads
  - Task 10: Click download icon — menu with copy/download options
