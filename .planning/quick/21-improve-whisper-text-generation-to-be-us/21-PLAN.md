---
phase: 21-improve-whisper-text
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - personal-assistant/src/lib/whispers/sources/due-items.ts
  - personal-assistant/src/lib/whispers/sources/stale-contacts.ts
  - personal-assistant/src/lib/whispers/sources/anomalies.ts
  - personal-assistant/src/lib/whispers/sources/proactive-completions.ts
  - personal-assistant/src/lib/whispers/sources/unfinished-momentum.ts
autonomous: true
requirements: [WHISPER-TEXT-01]

must_haves:
  truths:
    - "All 5 whisper sources produce text in a consistent, user-facing voice from BitBit's perspective"
    - "No whisper text exceeds 45 characters (single-line pill fit)"
    - "Task whispers include framing context, not raw titles"
    - "Anomaly and completion whispers use formatted templates, not raw database strings"
    - "Stale contact whispers are reframed as proactive suggestions, not passive observations"
  artifacts:
    - path: "personal-assistant/src/lib/whispers/sources/due-items.ts"
      provides: "Task whispers with priority-prefix framing"
      contains: "formatWhisperText"
    - path: "personal-assistant/src/lib/whispers/sources/stale-contacts.ts"
      provides: "Suggestion-framed contact follow-up whispers"
      contains: "Follow up"
    - path: "personal-assistant/src/lib/whispers/sources/anomalies.ts"
      provides: "Severity-prefixed alert whispers and approval whispers"
      contains: "truncateWhisper"
    - path: "personal-assistant/src/lib/whispers/sources/proactive-completions.ts"
      provides: "BitBit-voiced completion whispers"
      contains: "truncateWhisper"
  key_links:
    - from: "personal-assistant/src/lib/whispers/sources/*.ts"
      to: "personal-assistant/src/lib/whispers/types.ts"
      via: "Whisper interface text field"
      pattern: "text:"
    - from: "personal-assistant/src/lib/whispers/generate-whispers.ts"
      to: "personal-assistant/src/lib/whispers/sources/*.ts"
      via: "source function imports"
      pattern: "whisper(Stale|Due|Unfinished|Anomalies|Proactive)"
---

<objective>
Rewrite all 5 whisper source text templates to produce consistent, user-facing, concise single-line text that conveys BitBit's proactive personality.

Purpose: The whisper pills are BitBit's ambient voice -- they should feel like a sharp assistant subtly nudging the user, not a database dump. Every whisper must fit a single line in the pill component (~45 chars max) and speak in a consistent product voice.

Output: All 5 whisper source files updated with improved text generation. A shared truncation helper ensures no whisper exceeds the character budget.
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@personal-assistant/src/lib/whispers/types.ts
@personal-assistant/src/lib/whispers/generate-whispers.ts
@personal-assistant/src/lib/whispers/sources/unfinished-momentum.ts
@personal-assistant/src/lib/whispers/sources/due-items.ts
@personal-assistant/src/lib/whispers/sources/stale-contacts.ts
@personal-assistant/src/lib/whispers/sources/anomalies.ts
@personal-assistant/src/lib/whispers/sources/proactive-completions.ts
@personal-assistant/src/components/chat/whispers.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite all 5 whisper source text templates</name>
  <files>
    personal-assistant/src/lib/whispers/sources/unfinished-momentum.ts,
    personal-assistant/src/lib/whispers/sources/due-items.ts,
    personal-assistant/src/lib/whispers/sources/stale-contacts.ts,
    personal-assistant/src/lib/whispers/sources/anomalies.ts,
    personal-assistant/src/lib/whispers/sources/proactive-completions.ts
  </files>
  <action>
    Create a shared `truncateWhisper(text: string, max?: number): string` helper (inline in each file or a tiny shared util -- prefer inline since it's a one-liner). Default max = 45 chars. Truncates with ellipsis at word boundary when possible.

    Apply these text template changes per source:

    **1. unfinished-momentum.ts** (already good -- minor tightening):
    - Keep "You were working on {topic}" template
    - Reduce topic truncation from 50 to ~28 chars so total stays under 45
    - Example: "You were working on Steve West..." (43 chars)

    **2. due-items.ts -- Invoices** (minor tweak):
    - Keep existing invoice templates, they're already good
    - Just apply truncateWhisper to the final text to enforce the 45-char cap
    - Due today: "{Name}'s invoice due today" (drop "is" for brevity)
    - Overdue: "{Name}'s invoice 3 days overdue" (drop "is" for brevity)

    **2b. due-items.ts -- Tasks** (major fix):
    - Raw task titles currently shown with no framing. Fix:
    - Critical priority: "Urgent: {truncated title}"
    - High priority: "Priority: {truncated title}"
    - Apply truncateWhisper to final text
    - Examples: "Urgent: Deceased Estates filing" (31 chars), "Priority: Q2 budget review" (26 chars)

    **3. stale-contacts.ts** (reframe from passive to proactive):
    - Old: "{Name} hasn't replied in N days" (passive, negative)
    - New: "Follow up with {Name}? {N} days"
    - For hot leads: "Reach out to {Name}? {N} days"
    - Apply truncateWhisper to final text
    - Examples: "Follow up with Maya? 5 days" (27 chars), "Reach out to James? 8 days" (26 chars)

    **4. anomalies.ts -- Alerts** (structured prefix, truncate body):
    - Old: raw `alert.issue_summary` from DB (unpredictable length/tone)
    - New: severity prefix + truncated summary
    - Critical: "Alert: {truncated summary}"
    - High: "Warning: {truncated summary}"
    - Other: "Notice: {truncated summary}"
    - Apply truncateWhisper to final text
    - Example: "Alert: API 500 errors detected" (30 chars)

    **4b. anomalies.ts -- Approvals** (action-oriented framing):
    - Old: raw `approval.action_summary` from DB
    - New: "Approve: {truncated summary}"
    - Apply truncateWhisper to final text
    - Example: "Approve: Send Maya's proposal" (29 chars)

    **5. proactive-completions.ts** (BitBit's voice):
    - Old: raw `action_summary` truncated to 60 chars
    - New: "Done: {truncated summary}"
    - Fallback: "Handled a task for you" (not "Completed a task" -- more BitBit personality)
    - Apply truncateWhisper -- reduce budget to account for "Done: " prefix
    - Example: "Done: Sent Maya's proposal" (26 chars)

    IMPORTANT:
    - Do NOT change any query logic, scoring, context objects, or function signatures
    - Only modify the `text:` field value in each whisper object
    - The `truncateWhisper` helper should truncate at word boundary: find last space before max, slice there, append "..."
    - If no space found (single long word), hard cut at max-3 and append "..."
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && npx tsc --noEmit --project personal-assistant/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    All 5 source files produce whisper text that:
    1. Never exceeds 45 characters
    2. Uses consistent voice (BitBit as proactive assistant)
    3. Tasks have priority-prefix framing ("Urgent:", "Priority:")
    4. Stale contacts reframed as suggestions ("Follow up with...?")
    5. Anomalies have severity prefix ("Alert:", "Warning:", "Approve:")
    6. Completions have "Done:" prefix with personality fallback
    7. Momentum template tightened to fit 45-char budget
    8. No query logic, scoring, or context objects changed
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Rewrote all 5 whisper text templates to be user-facing, single-line, and product-voiced. No query or scoring logic changed -- only the text field in each Whisper object.</what-built>
  <how-to-verify>
    1. Visit https://app.bitbit.chat (or localhost:3000) and log in
    2. Look at the whisper pills below the chat greeting
    3. Verify each pill:
       - Fits on a single line (no wrapping)
       - Reads naturally as BitBit speaking to you
       - Uses the new prefixes (Urgent:, Follow up with...?, Alert:, Done:, etc.)
    4. If no whispers appear (no data), review the source code changes to confirm templates match the specified patterns
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues with specific whisper texts</resume-signal>
</task>

</tasks>

<verification>
- TypeScript compiles without errors: `cd personal-assistant && npx tsc --noEmit`
- All 5 source files still export the same function signatures (no breaking changes)
- grep for text templates confirms new patterns: `grep -n "text:" personal-assistant/src/lib/whispers/sources/*.ts`
- No whisper text template exceeds 45 chars when populated with typical data (5-15 char names, 1-3 digit numbers)
</verification>

<success_criteria>
Every whisper source produces text that is: concise (under 45 chars), user-facing (BitBit's voice), contextually framed (not raw DB strings), and consistent across all 5 sources. The pill component renders each whisper on a single line without truncation or wrapping.
</success_criteria>

<output>
After completion, create `.planning/quick/21-improve-whisper-text-generation-to-be-us/21-01-SUMMARY.md`
</output>
