---
phase: quick-19
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - personal-assistant/src/components/chat/chat-interface.tsx
  - personal-assistant/src/components/ai-elements/chain-of-thought.tsx
autonomous: true
requirements: [FIX-COT-STACKING]

must_haves:
  truths:
    - "Narration text freezes when first tool_call arrives and does not grow further"
    - "All chain-of-thought steps (narration + each tool call) stack vertically like Lego bricks"
    - "Content after tool calls flows only to smoothStream, never to narration"
    - "ChainOfThought open/close state reflects parent-controlled prop changes"
  artifacts:
    - path: "personal-assistant/src/components/chat/chat-interface.tsx"
      provides: "Fixed narration tracking with separate narrationContentRef"
    - path: "personal-assistant/src/components/ai-elements/chain-of-thought.tsx"
      provides: "Fixed controlled component open prop sync"
  key_links:
    - from: "chat-interface.tsx content_delta handler"
      to: "narrationContentRef"
      via: "append only when !narrationLockedRef.current"
      pattern: "narrationContentRef"
    - from: "chat-interface.tsx narration state"
      to: "ChainOfThoughtStep label"
      via: "frozen narration string"
      pattern: "narration\\.trim\\(\\)"
---

<objective>
Fix the chain-of-thought timeline so steps stack (accumulate) instead of replacing each other.

Purpose: The timeline should show narration + tool call 1 + tool call 2 + ... as accumulated steps. Currently narration grows unboundedly because it reads from the full `assistantContent` string, and the ChainOfThought component has a controlled/uncontrolled state bug where `open` prop changes after mount are ignored.

Output: Two fixed files — chat-interface.tsx with proper narration tracking, chain-of-thought.tsx with proper controlled state.
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@personal-assistant/src/components/chat/chat-interface.tsx
@personal-assistant/src/components/ai-elements/chain-of-thought.tsx

<interfaces>
From chain-of-thought.tsx:
```typescript
export interface ChainOfThoughtProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export interface ChainOfThoughtStepProps {
  icon?: ElementType;
  label: string;
  status?: "active" | "complete" | "pending";
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}
```

From chat-interface.tsx (relevant state):
```typescript
const [narration, setNarration] = useState('')
const narrationLockedRef = useRef(false)
// assistantContent is a local let variable inside handleSend
let assistantContent = ''
const toolCalls: ToolCall[] = []
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix narration tracking — separate narrationContentRef from assistantContent</name>
  <files>personal-assistant/src/components/chat/chat-interface.tsx</files>
  <action>
The root cause: `narration` state is set to the full `assistantContent` string on each content_delta. Since `assistantContent` accumulates ALL content (before, between, and after tools), narration becomes unbounded text that visually overwhelms tool call steps.

Fix the `content_delta` handler (around line 399-415) and the narration initialization:

1. **Add a `narrationContentRef`** (useRef<string>('')): This tracks ONLY the pre-tool narration text, separate from `assistantContent`. Initialize alongside `narrationLockedRef` near line 131.

2. **Reset `narrationContentRef.current = ''`** in handleSend alongside the existing `narrationLockedRef.current = false` reset (around line 242).

3. **Rewrite the `content_delta` case** (lines 399-415):
   ```typescript
   case 'content_delta': {
     setIsThinkingStreaming(false)
     assistantContent += event.data

     // Pre-tool narration: content before any tool_call is narration text.
     // Once narration is locked (first tool_call arrived), all content
     // goes to smoothStream for the final answer display.
     if (!narrationLockedRef.current && toolCalls.length === 0) {
       narrationContentRef.current += event.data
       setNarration(narrationContentRef.current)
     } else {
       if (!narrationLockedRef.current) {
         narrationLockedRef.current = true
       }
       smoothStream.feedContent(event.data)
     }
     break
   }
   ```

   Key change: Instead of `setNarration(assistantContent)` (which is the FULL accumulated string), we append `event.data` to `narrationContentRef.current` and set narration from that. Once tools start, `narrationContentRef.current` stops growing because the condition blocks it. The narration string stays frozen at its pre-tool value.

4. **Truncate narration for display**: In the `reasoningChainJSX` block (around line 652-657), truncate narration to first sentence for a clean step label:
   ```typescript
   {narration && (
     <ChainOfThoughtStep
       label={(() => {
         const trimmed = narration.trim()
         // Show first sentence only for a clean timeline step
         const firstSentence = trimmed.match(/^[^.!?\n]+[.!?]?/)?.[0] || trimmed
         return firstSentence.length > 120 ? firstSentence.slice(0, 117) + '...' : firstSentence
       })()}
       status={isReasoningActive ? 'active' : 'complete'}
     />
   )}
   ```

These changes ensure narration is a short, frozen label that stacks cleanly with tool call steps below it.
  </action>
  <verify>
    <automated>cd /home/claude/agent-7/personal-assistant && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>Narration state tracked via dedicated narrationContentRef, frozen on first tool_call, truncated to first sentence in display. content_delta after tools flows exclusively to smoothStream.</done>
</task>

<task type="auto">
  <name>Task 2: Fix ChainOfThought controlled component — sync open prop with internal state</name>
  <files>personal-assistant/src/components/ai-elements/chain-of-thought.tsx</files>
  <action>
The `ChainOfThought` component has a controlled/uncontrolled state bug. Line 44:
```typescript
const [isOpen, setIsOpen] = useState(open ?? defaultOpen);
```
This only uses `open` for the initial value. When parent changes `reasoningOpen` (e.g., auto-open on content arrival, auto-close when reasoning finishes), the internal `isOpen` stays stale. This can cause the timeline content to appear invisible even when the parent says it should be open.

Fix by making the component properly handle controlled mode:

1. **Determine if controlled**: `const isControlled = open !== undefined`

2. **Use the controlled value when available**:
   ```typescript
   const [internalOpen, setInternalOpen] = useState(defaultOpen);
   const isOpen = isControlled ? open! : internalOpen;

   const handleOpenChange = (newOpen: boolean) => {
     if (!isControlled) {
       setInternalOpen(newOpen);
     }
     onOpenChange?.(newOpen);
   };
   ```

3. **Update the useMemo** to include proper deps:
   ```typescript
   const chainOfThoughtContext = useMemo(
     () => ({ isOpen, setIsOpen: handleOpenChange }),
     [isOpen]
   );
   ```
   Note: `handleOpenChange` should be wrapped in useCallback or the useMemo deps should be correct. Since the component uses `memo()` already and `handleOpenChange` captures `isControlled` and `onOpenChange`, it needs to be stable. Simplest: just inline the logic in useMemo or use useCallback for handleOpenChange.

4. **Full corrected component body** (inside the memo render function):
   ```typescript
   const isControlled = open !== undefined
   const [internalOpen, setInternalOpen] = useState(defaultOpen)
   const isOpen = isControlled ? open! : internalOpen

   const chainOfThoughtContext = useMemo(
     () => ({
       isOpen,
       setIsOpen: (newOpen: boolean) => {
         if (!isControlled) {
           setInternalOpen(newOpen)
         }
         onOpenChange?.(newOpen)
       },
     }),
     [isOpen, isControlled, onOpenChange]
   )
   ```

This ensures when `chat-interface.tsx` passes `open={reasoningOpen}`, the ChainOfThought component reflects that value immediately, and user clicks on the header call `onOpenChange` which updates the parent's `reasoningOpen` state.
  </action>
  <verify>
    <automated>cd /home/claude/agent-7/personal-assistant && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>ChainOfThought properly supports controlled mode — internal state defers to `open` prop when provided, clicks propagate via `onOpenChange`. Parent auto-open/auto-close effects now work correctly.</done>
</task>

</tasks>

<verification>
1. TypeScript compilation passes with zero new errors
2. Manual verification: Send a message that triggers tool calls. The chain-of-thought timeline should show:
   - A short narration step (frozen first sentence, e.g., "I'll search for WhatsApp messages")
   - Each tool call as a separate step below (stacking, not replacing)
   - The final answer streams in the message bubble, NOT in the narration
3. The reasoning chain auto-opens when content arrives and auto-closes when reasoning finishes
</verification>

<success_criteria>
- Narration step shows only pre-tool text, frozen at first sentence, never grows after tool_call
- Tool call steps stack below narration as separate Lego-brick entries
- ChainOfThought open/close state responds to parent prop changes (auto-open, auto-close work)
- No TypeScript errors introduced
</success_criteria>

<output>
After completion, create `.planning/quick/19-fix-chain-of-thought-timeline-stacking-s/19-SUMMARY.md`
</output>
