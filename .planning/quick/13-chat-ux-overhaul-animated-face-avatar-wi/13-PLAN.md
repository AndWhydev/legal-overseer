---
phase: Q13-chat-ux-overhaul
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - personal-assistant/src/components/chat/bitbit-face-avatar.tsx
  - personal-assistant/src/components/chat/use-avatar-emotion.ts
  - personal-assistant/src/components/chat/chat-interface.tsx
  - personal-assistant/src/components/chat/message-bubble.tsx
  - personal-assistant/src/components/chat/use-smart-scroll.ts
  - personal-assistant/src/components/chat/use-smooth-stream.ts
  - personal-assistant/src/components/chat/conversation-drawer.tsx
  - personal-assistant/src/app/api/conversations/list/route.ts
  - personal-assistant/src/styles/bitbit-design-system.css
autonomous: true
requirements: [Q13-AVATAR, Q13-EMOTIONS, Q13-STREAMING, Q13-SCROLL, Q13-HISTORY]

must_haves:
  truths:
    - "Animated face avatar with two eyes, eyebrows, and L-shaped nose replaces BitBit logo in chat messages and empty state"
    - "Face eyes subtly follow the user cursor position"
    - "Face emotion changes dynamically during AI response phases (thinking, processing tools, streaming content, error)"
    - "Text streams smoothly character-by-character instead of paragraph-level dumps"
    - "Chat auto-scrolls when user is near bottom but stops when user scrolls up"
    - "Scroll-to-bottom button appears when user scrolls away from bottom"
    - "User can browse recent conversations and start new ones"
  artifacts:
    - path: "personal-assistant/src/components/chat/bitbit-face-avatar.tsx"
      provides: "Animated face SVG component with cursor tracking and emotion states"
    - path: "personal-assistant/src/components/chat/use-avatar-emotion.ts"
      provides: "Hook that maps SSE event phases to emotion states"
    - path: "personal-assistant/src/components/chat/use-smart-scroll.ts"
      provides: "Smart auto-scroll hook with near-bottom detection"
    - path: "personal-assistant/src/components/chat/use-smooth-stream.ts"
      provides: "Optimistic character-by-character rendering hook"
    - path: "personal-assistant/src/components/chat/conversation-drawer.tsx"
      provides: "Slide-out drawer for conversation history"
  key_links:
    - from: "chat-interface.tsx"
      to: "bitbit-face-avatar.tsx"
      via: "import and render in place of BitBitLogoAnimated/BitBitLogoVideo"
      pattern: "BitBitFaceAvatar"
    - from: "chat-interface.tsx"
      to: "use-smart-scroll.ts"
      via: "hook replaces manual scrollToBottom useEffect"
      pattern: "useSmartScroll"
    - from: "chat-interface.tsx"
      to: "use-smooth-stream.ts"
      via: "hook wraps content_delta handling for smooth rendering"
      pattern: "useSmoothStream"
    - from: "chat-interface.tsx"
      to: "conversation-drawer.tsx"
      via: "state toggle + drawer component rendered in chat layout"
      pattern: "ConversationDrawer"
---

<objective>
Complete chat UX overhaul: replace BitBit logo with animated face avatar that tracks cursor and expresses emotions, implement smooth character-level text streaming, fix auto-scroll behavior, and add conversation history browsing.

Purpose: Transform chat from functional to premium feel -- the face creates personality, smooth streaming creates perceived speed, smart scroll eliminates frustration, and conversation history enables continuity.
Output: 5 new files (avatar, emotion hook, scroll hook, stream hook, drawer), 3 modified files (chat-interface, message-bubble, design-system CSS)
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@personal-assistant/src/components/chat/chat-interface.tsx
@personal-assistant/src/components/chat/message-bubble.tsx
@personal-assistant/src/components/chat/bitbit-logo-animated.tsx
@personal-assistant/src/components/chat/bitbit-logo-video.tsx
@personal-assistant/src/components/ai-elements/reasoning.tsx
@personal-assistant/src/components/chat/chat-input.tsx
@personal-assistant/src/app/api/conversations/recent/route.ts
@personal-assistant/src/app/api/agent/chat/history/route.ts
@personal-assistant/src/styles/bitbit-design-system.css

<interfaces>
<!-- Existing SSE event types from chat-interface.tsx that drive emotion and streaming -->
SSE events consumed by chat-interface:
- type: 'thinking' | 'thinking_start' -> thinking begins
- type: 'thinking_delta' -> thinking content streaming
- type: 'thinking_complete' -> thinking done, data.duration_ms
- type: 'tool_call' -> tool execution starts, data.name
- type: 'tool_result' -> tool done, data.success
- type: 'content_delta' -> text content chunk, data = string
- type: 'error' -> error occurred
- type: 'done' -> response complete

Existing conversation API:
- GET /api/conversations/recent -> { thread: { id, title, last_activity_at, message_count, lastMessage } }
- GET /api/agent/chat/history?threadId=X -> { threadId, messages: [{ id, content, role, created_at }] }

Existing conversation_threads table columns:
- id, title, last_activity_at, last_channel, message_count, user_id, status

Motion library: "motion" ^12.36.0 (import from "motion/react")
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Animated face avatar with cursor tracking and emotion system</name>
  <files>
    personal-assistant/src/components/chat/bitbit-face-avatar.tsx
    personal-assistant/src/components/chat/use-avatar-emotion.ts
    personal-assistant/src/components/chat/message-bubble.tsx
    personal-assistant/src/components/chat/chat-interface.tsx
    personal-assistant/src/styles/bitbit-design-system.css
  </files>
  <action>
    **Create `bitbit-face-avatar.tsx`** -- a minimalist geometric face SVG component:
    - Props: `{ size?: number; emotion?: AvatarEmotion; className?: string }`
    - AvatarEmotion type: `'neutral' | 'thinking' | 'curious' | 'happy' | 'concerned' | 'focused' | 'surprised' | 'processing'`
    - SVG structure (viewBox "0 0 48 48"):
      - Head: subtle rounded rectangle or circle outline (stroke only, 1.5px), slightly translucent
      - Two eyes: simple filled circles (~3px radius), positioned at roughly (16, 20) and (32, 20)
      - Two eyebrows: high-curved arcs above eyes (Notion avatar style), stroke-only paths
      - L-shaped nose: a single path forming an L from between the eyes downward then right, stroke-only
    - Color: `var(--text-primary)` so it inverts naturally with theme (white on dark, dark on light)
    - Add subtle ethereal glow via CSS filter: `drop-shadow(0 0 6px var(--text-primary))` at 0.15 opacity

    **Cursor tracking** (eyes + slight head tilt):
    - Use `useEffect` to add a `mousemove` listener on `document`
    - Track mouse position relative to the SVG element using `getBoundingClientRect()`
    - Calculate angle and distance from face center to cursor
    - Apply small transform translations to eye circles (max 2px displacement) and subtle head rotation (max 3deg) via `motion` animate
    - Throttle mouse tracking to every 50ms via `requestAnimationFrame` for performance
    - Use `useRef` for the SVG element ref

    **Emotion expressions** using Framer Motion `animate` prop on each facial feature:
    - `neutral`: eyes centered, eyebrows relaxed, no extra animation
    - `thinking`: eyes shift up-left slightly, eyebrows raise (translateY -2px), slow blink animation
    - `curious`: one eyebrow raises higher than other, eyes widen slightly (scale 1.1)
    - `happy`: eyes squint (scaleY 0.7), eyebrows relax down, subtle bounce
    - `concerned`: eyebrows angle inward (rotate), eyes slightly smaller
    - `focused`: eyes narrow (scaleY 0.8), eyebrows lower, steady gaze
    - `surprised`: eyes widen (scale 1.3), eyebrows jump up, mouth-area hint
    - `processing`: eyes do a scanning left-right animation, eyebrows neutral
    - All transitions: `transition={{ duration: 0.4, ease: 'easeInOut' }}` for smooth morphing between states

    **Create `use-avatar-emotion.ts`** hook:
    - Input: `{ isThinking: boolean; isToolRunning: boolean; isStreaming: boolean; hasError: boolean }`
    - Returns: `AvatarEmotion`
    - Mapping logic:
      - `hasError` -> 'concerned'
      - `isThinking` -> 'thinking'
      - `isToolRunning` -> 'processing'
      - `isStreaming` -> 'happy' (content is flowing)
      - default -> 'neutral'
    - Use `useRef` to track previous emotion and add a brief delay (300ms) before switching to prevent rapid flickering

    **Update `message-bubble.tsx`**:
    - Replace `import { BitBitLogoAnimated }` with `import { BitBitFaceAvatar }` from './bitbit-face-avatar'
    - Replace `<BitBitLogoAnimated size={24} />` with `<BitBitFaceAvatar size={24} />` (no emotion prop needed for static message history)

    **Update `chat-interface.tsx`**:
    - Replace `import { BitBitLogoVideo }` and `import { BitBitLogoAnimated }` with `import { BitBitFaceAvatar }` from './bitbit-face-avatar'
    - Import `useAvatarEmotion` from './use-avatar-emotion'
    - In the component body, call: `const avatarEmotion = useAvatarEmotion({ isThinking: isThinkingStreaming, isToolRunning: toolCalls running check, isStreaming: isLoading and assistantContent growing, hasError: last message is error })`
    - Replace `<BitBitLogoVideo size={140} />` in empty state with `<BitBitFaceAvatar size={120} emotion={avatarEmotion} />`
    - Replace `<BitBitLogoAnimated size={24} />` in thinking indicator and pending approvals with `<BitBitFaceAvatar size={24} emotion={avatarEmotion} />`
    - Compute `isToolRunning` from toolCalls array: `toolCalls.some(tc => tc.status === 'running')`
    - Compute `isContentStreaming` from: `isLoading && !isThinkingStreaming && messages.some(m => m.id === assistantId)`

    **CSS additions to design-system.css** (after the existing `.bb-chat__assistant-icon` block):
    - `.bb-chat__face-avatar` with `filter: drop-shadow(0 0 6px rgba(255,255,255,0.12))` and `transition: filter 0.3s ease`
    - `.bb-chat__face-avatar--large` for empty state (add subtle floating animation reusing `logo-float` keyframes)
    - `html.light .bb-chat__face-avatar` with adjusted drop-shadow for light theme: `drop-shadow(0 0 4px rgba(0,0,0,0.08))`
  </action>
  <verify>
    <automated>cd /home/claude/agent-7/personal-assistant && npx tsc --noEmit --pretty 2>&1 | head -40</automated>
  </verify>
  <done>
    - BitBitFaceAvatar component renders a minimalist face SVG with eyes, eyebrows, and L-shaped nose
    - Eyes follow cursor position with throttled mousemove listener
    - 8 emotion states animate facial features via Framer Motion
    - useAvatarEmotion hook maps SSE phases to emotions with debounce
    - All BitBitLogoAnimated/BitBitLogoVideo references replaced in chat-interface and message-bubble
    - Face color inverts properly across midnight/aurora/light themes via var(--text-primary)
  </done>
</task>

<task type="auto">
  <name>Task 2: Smooth text streaming and smart auto-scroll</name>
  <files>
    personal-assistant/src/components/chat/use-smooth-stream.ts
    personal-assistant/src/components/chat/use-smart-scroll.ts
    personal-assistant/src/components/chat/chat-interface.tsx
    personal-assistant/src/styles/bitbit-design-system.css
  </files>
  <action>
    **Create `use-smooth-stream.ts`** -- optimistic character-by-character rendering hook:
    - Interface: `useSmoothStream(): { displayedContent: string; feedContent: (chunk: string) => void; reset: () => void; isBuffering: boolean }`
    - Internal state:
      - `buffer: string` (accumulated raw content not yet displayed)
      - `displayed: string` (what user sees)
      - `charsPerFrame: number` (adaptive render speed, starts at 3)
    - Algorithm (runs in RAF loop):
      - When `feedContent(chunk)` called, append to buffer
      - Each animation frame: move `charsPerFrame` characters from buffer to displayed
      - Adaptive speed:
        - Buffer > 100 chars: speed up to 5 chars/frame (catching up)
        - Buffer > 200 chars: speed up to 8 chars/frame
        - Buffer 20-100 chars: steady 3 chars/frame (smooth feel)
        - Buffer < 20 chars: slow to 1 char/frame (graceful coast)
        - Buffer empty: stop RAF loop, resume when new content arrives
      - This creates the "always flowing" perception even when server is bursty
    - Use `useRef` for buffer and RAF handle, `useState` for displayed string
    - `reset()` clears buffer and displayed, cancels RAF
    - Clean up RAF on unmount
    - The displayed string should be set via a single `setState` per frame to avoid excessive re-renders

    **Create `use-smart-scroll.ts`** -- smart auto-scroll with near-bottom detection:
    - Interface: `useSmartScroll(scrollRef: RefObject<HTMLDivElement>): { shouldShowScrollButton: boolean; scrollToBottom: () => void; onScroll: () => void }`
    - Logic:
      - Track `isNearBottom` state (within 150px of bottom)
      - `onScroll` handler: compute `scrollHeight - scrollTop - clientHeight`, set `isNearBottom` if < 150
      - When `isNearBottom` is true and new content arrives, auto-scroll (use `MutationObserver` on the scroll container to detect child changes, or expose a `triggerScroll()` that chat-interface calls after content updates)
      - When user scrolls UP past threshold, stop auto-scrolling
      - `shouldShowScrollButton`: true when NOT near bottom AND there is overflow content
      - `scrollToBottom()`: smooth scroll to bottom, set `isNearBottom = true`
    - Use `useCallback` for all handlers, `useRef` for tracking state to avoid re-render loops
    - Attach scroll listener via `useEffect` on mount

    **Update `chat-interface.tsx`**:

    1. **Replace RAF-batched content_delta with smooth stream**:
       - Import and call `useSmoothStream()` at component level
       - In `handleSend`, call `smoothStream.reset()` when starting new message
       - In `content_delta` case: instead of accumulating `assistantContent` and RAF-batching `setMessages`, call `smoothStream.feedContent(event.data)`. Still accumulate `assistantContent` for the final message state.
       - Add a `useEffect` watching `smoothStream.displayedContent` that updates the assistant message:
         ```
         useEffect(() => {
           if (!smoothStream.displayedContent) return
           setMessages(prev => {
             const existing = prev.find(m => m.id === currentAssistantId)
             if (existing) return prev.map(m => m.id === currentAssistantId ? { ...m, content: smoothStream.displayedContent } : m)
             return [...prev, { id: currentAssistantId, role: 'assistant', content: smoothStream.displayedContent, timestamp: new Date() }]
           })
         }, [smoothStream.displayedContent])
         ```
       - Keep the `assistantContent` accumulator for the final `done` event (set full content to ensure nothing is lost)
       - Remove the `rafPending` ref and the old `requestAnimationFrame` block in content_delta

    2. **Replace naive scrollToBottom with smart scroll**:
       - Import and call `useSmartScroll(scrollRef)`
       - Remove the old `scrollToBottom` useCallback and the `useEffect` that calls it on `[messages, thinkingContent, isThinkingStreaming]`
       - Instead, call `smartScroll.scrollToBottom()` only when: a new user message is sent (in handleSend), and optionally in the `useEffect` watching `smoothStream.displayedContent` only if `smartScroll` says we are near bottom (it handles this internally)
       - Actually, the simplest approach: in the useEffect watching displayedContent, also call a `smartScroll.onContentUpdate()` method that scrolls IF near bottom
       - Add the `onScroll` handler to the scroll container div: `onScroll={smartScroll.onScroll}`

    3. **Add scroll-to-bottom button**:
       - Render a floating button just above the input area when `smartScroll.shouldShowScrollButton` is true
       - Button: circular, semi-transparent glass background, down-arrow icon (ChevronDown from lucide-react)
       - Position: absolute bottom of messages container, centered
       - onClick: `smartScroll.scrollToBottom()`
       - Wrap in `AnimatePresence` + `motion.button` for fade in/out

    **CSS additions**:
    - `.bb-chat__scroll-btn`: positioned absolute, bottom: 80px (above input), left: 50%, transform: translateX(-50%), z-index: 10, width: 36px, height: 36px, border-radius: 50%, background: var(--glass-pill-bg), backdrop-filter: blur(12px), border: 1px solid rgba(255,255,255,0.1), cursor: pointer, display: flex, align-items: center, justify-content: center, color: var(--text-secondary), transition: opacity 0.2s, box-shadow: 0 2px 8px rgba(0,0,0,0.2)
    - `.bb-chat__scroll-btn:hover`: color: var(--text-primary), transform: translateX(-50%) scale(1.05)
    - `html.light .bb-chat__scroll-btn`: adjusted border and shadow for light theme
  </action>
  <verify>
    <automated>cd /home/claude/agent-7/personal-assistant && npx tsc --noEmit --pretty 2>&1 | head -40</automated>
  </verify>
  <done>
    - Text streams visually character-by-character with adaptive speed (fast when buffer full, coasting when empty)
    - No more paragraph-level content dumps -- smooth continuous flow
    - Auto-scroll follows new content when user is near bottom
    - Auto-scroll stops when user scrolls up to read earlier messages
    - Floating "scroll to bottom" button appears when not at bottom, disappears when at bottom
    - Clicking scroll button smoothly returns to bottom and re-enables auto-scroll
    - Old RAF batching removed, old naive scrollToBottom removed
  </done>
</task>

<task type="auto">
  <name>Task 3: Conversation history drawer with new-conversation support</name>
  <files>
    personal-assistant/src/components/chat/conversation-drawer.tsx
    personal-assistant/src/app/api/conversations/list/route.ts
    personal-assistant/src/components/chat/chat-interface.tsx
    personal-assistant/src/styles/bitbit-design-system.css
  </files>
  <action>
    **Create `/api/conversations/list/route.ts`** API endpoint:
    - GET handler, authenticated (same pattern as existing `/api/conversations/recent/route.ts`)
    - Query `conversation_threads` table: `select('id, title, last_activity_at, message_count, status')` where `user_id = user.id` and `status = 'active'`, ordered by `last_activity_at desc`, limit 20
    - For each thread, fetch the last message as preview: query `conversation_messages` for each thread_id, `select('content, role')`, order by `turn_number desc`, limit 1
    - Return: `{ threads: [{ id, title, lastActivity, messageCount, preview }] }`
    - Handle table-not-exist gracefully (return empty array) like existing history route does
    - Use `Promise.all` to fetch previews in parallel (batched, not N+1)

    **Create `conversation-drawer.tsx`** component:
    - Props: `{ isOpen: boolean; onClose: () => void; threads: Thread[]; activeThreadId: string | null; onSelectThread: (threadId: string) => void; onNewConversation: () => void; isLoading: boolean }`
    - Thread type: `{ id: string; title: string | null; lastActivity: string; messageCount: number; preview: string | null }`
    - Layout: slide-in panel from left side, 320px wide, full height
    - Use `motion.div` with `AnimatePresence` for slide animation (`initial={{ x: -320 }}`, `animate={{ x: 0 }}`, `exit={{ x: -320 }}`)
    - Backdrop: semi-transparent overlay behind drawer, click to close
    - Header section:
      - "Conversations" title
      - "New chat" button with Plus icon (lucide-react) -- glassmorphic style, calls `onNewConversation`
      - Close button (X icon)
    - Thread list:
      - Each thread rendered as a clickable row
      - Show: title (or "Untitled" fallback), preview text (truncated to 60 chars), relative time ("2h ago", "yesterday")
      - Active thread highlighted with subtle accent border-left
      - Hover: background lighten
      - onClick: `onSelectThread(thread.id)` then `onClose()`
    - Empty state: "No conversations yet" centered text
    - Loading state: 3 skeleton shimmer rows
    - Style: glassmorphic background (`var(--glass-bg)`, `backdrop-filter: blur(20px)`), matching chat aesthetic
    - Use `useEffect` to fetch `/api/conversations/list` when drawer opens (`isOpen` changes to true)

    **Relative time helper** (inline in drawer file):
    - Function `relativeTime(dateStr: string): string`
    - < 1 min: "just now", < 60 min: "Xm ago", < 24h: "Xh ago", < 7d: "Xd ago", else: date string

    **Update `chat-interface.tsx`**:
    - Add state: `const [drawerOpen, setDrawerOpen] = useState(false)`
    - Add state: `const [conversationThreads, setConversationThreads] = useState<Thread[]>([])`
    - Add state: `const [threadsLoading, setThreadsLoading] = useState(false)`

    - Add `fetchThreads` function that calls `/api/conversations/list`, sets threads and loading state

    - Add `handleNewConversation` function:
      - Clear messages: `setMessages([])`
      - Clear threadId: `setThreadId(null)`
      - Remove from localStorage: `localStorage.removeItem(THREAD_STORAGE_KEY)`
      - Reset all reasoning state
      - Close drawer

    - Add `handleSelectThread` function:
      - Set threadId, save to localStorage
      - Fetch messages from `/api/agent/chat/history?threadId=X`
      - Map to Message[] format (same as existing mount logic)
      - Set messages

    - Add a small history toggle button in the top-left of the chat (visible only when `chatStarted` is true OR there are stored threads):
      - Icon: `MessageSquare` from lucide-react (or `History`)
      - Position: fixed/absolute top-left of chat area
      - On click: `setDrawerOpen(true)` and `fetchThreads()`

    - Render `<ConversationDrawer>` with AnimatePresence inside the main chat div, passing all props

    **CSS additions**:
    - `.bb-chat__history-btn`: position absolute, top: 12px, left: 12px, z-index: 20, width: 32px, height: 32px, border-radius: 8px, background: var(--glass-pill-bg), backdrop-filter: blur(8px), border: 1px solid rgba(255,255,255,0.08), cursor: pointer, display: flex, align-items: center, justify-content: center, color: var(--text-secondary), transition: all 0.15s ease, opacity: 0.7
    - `.bb-chat__history-btn:hover`: opacity: 1, color: var(--text-primary), background: rgba(255,255,255,0.08)
    - `.bb-chat__drawer-backdrop`: position: fixed, inset: 0, background: rgba(0,0,0,0.4), z-index: 50, backdrop-filter: blur(4px)
    - `.bb-chat__drawer`: position: fixed, top: 0, left: 0, bottom: 0, width: 320px, z-index: 51, background: var(--bg-primary, rgba(12,14,20,0.95)), backdrop-filter: blur(20px), border-right: 1px solid rgba(255,255,255,0.08), display: flex, flex-direction: column, overflow: hidden
    - `.bb-chat__drawer-header`: padding: 16px, display: flex, align-items: center, justify-content: space-between, border-bottom: 1px solid rgba(255,255,255,0.06)
    - `.bb-chat__drawer-title`: font-size: 15px, font-weight: 600, color: var(--text-primary)
    - `.bb-chat__drawer-new-btn`: background: var(--glass-pill-bg), border: 1px solid rgba(255,255,255,0.1), border-radius: 8px, padding: 6px 12px, font-size: 12px, color: var(--text-secondary), cursor: pointer, display: flex, align-items: center, gap: 4px, transition: all 0.15s
    - `.bb-chat__drawer-new-btn:hover`: color: var(--text-primary), border-color: rgba(255,255,255,0.2)
    - `.bb-chat__drawer-list`: flex: 1, overflow-y: auto, padding: 8px
    - `.bb-chat__drawer-thread`: padding: 12px, border-radius: 8px, cursor: pointer, transition: background 0.15s, border-left: 2px solid transparent, margin-bottom: 2px
    - `.bb-chat__drawer-thread:hover`: background: rgba(255,255,255,0.04)
    - `.bb-chat__drawer-thread--active`: border-left-color: var(--accent-primary), background: rgba(255,255,255,0.03)
    - `.bb-chat__drawer-thread-title`: font-size: 13px, font-weight: 500, color: var(--text-primary), white-space: nowrap, overflow: hidden, text-overflow: ellipsis
    - `.bb-chat__drawer-thread-preview`: font-size: 12px, color: var(--text-secondary), margin-top: 2px, white-space: nowrap, overflow: hidden, text-overflow: ellipsis
    - `.bb-chat__drawer-thread-time`: font-size: 11px, color: var(--text-muted), margin-top: 2px
    - `.bb-chat__drawer-empty`: padding: 40px 16px, text-align: center, color: var(--text-muted), font-size: 13px
    - Light theme overrides for all drawer classes (html.light prefix): adjusted backgrounds, borders, shadows
  </action>
  <verify>
    <automated>cd /home/claude/agent-7/personal-assistant && npx tsc --noEmit --pretty 2>&1 | head -40</automated>
  </verify>
  <done>
    - GET /api/conversations/list returns up to 20 recent threads with preview text
    - ConversationDrawer slides in from left with glassmorphic styling
    - Active thread highlighted in drawer list
    - Clicking a thread loads its messages into chat
    - "New chat" button clears current conversation and starts fresh
    - History toggle button appears in top-left of chat area
    - Drawer works across all 3 themes (midnight, aurora, light)
    - Table-not-exist errors handled gracefully (empty state)
  </done>
</task>

</tasks>

<verification>
1. `cd /home/claude/agent-7/personal-assistant && npx tsc --noEmit` -- zero new type errors
2. `cd /home/claude/agent-7/personal-assistant && npx next build 2>&1 | tail -5` -- build succeeds
3. Visual check: face avatar renders in empty state and message bubbles, eyes track cursor
4. Visual check: text streams smoothly character-by-character during AI response
5. Scroll check: scroll up during streaming, auto-scroll stops, button appears, click it returns to bottom
6. History check: click history button, drawer opens with thread list, click thread to load it
</verification>

<success_criteria>
- Animated face avatar replaces all BitBit logo instances in chat with cursor tracking and emotion transitions
- Text streaming feels smooth and continuous (no visible content dumps)
- Smart auto-scroll respects user scroll position with visible scroll-to-bottom affordance
- Conversation history drawer enables thread browsing and new conversation creation
- Zero TypeScript errors, successful production build
</success_criteria>

<output>
After completion, create `.planning/quick/13-chat-ux-overhaul-animated-face-avatar-wi/13-01-SUMMARY.md`
</output>
