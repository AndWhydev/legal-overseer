---
phase: Q14
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - personal-assistant/src/components/dashboard/inbox-feed.tsx
  - personal-assistant/src/components/dashboard/dashboard-redesign.tsx
autonomous: true
requirements: [INBOX-ICONS, INBOX-TIME, INBOX-HEADER, INBOX-PANEL]
must_haves:
  truths:
    - "All channel icons render in a unified neutral monochrome tone, no brand colors visible"
    - "Time label appears on the same line as the subject, right-aligned, subject truncates to accommodate"
    - "Sender line shows only the sender name — no dot divider, no time"
    - "Autopilot button is more subtle — smaller icon-only or minimal presence"
    - "Clicking the Inbox header title navigates to inbox tab (replaces fullscreen button)"
    - "Collapsed panel edge shows a thin luminous strip that responds to cursor proximity"
    - "Panel expand/collapse uses smooth spring-like animation"
  artifacts:
    - path: "personal-assistant/src/components/dashboard/inbox-feed.tsx"
      provides: "Redesigned InboxFeed with neutral icons, fixed time placement, refined header"
    - path: "personal-assistant/src/components/dashboard/dashboard-redesign.tsx"
      provides: "Edge knock proximity detection and premium panel expand/collapse"
  key_links:
    - from: "dashboard-redesign.tsx"
      to: "inbox-feed.tsx"
      via: "InboxFeed props (isCollapsed, onCollapsedChange)"
      pattern: "<InboxFeed"
    - from: "dashboard-redesign.tsx"
      to: "localStorage"
      via: "bb-inbox-collapsed persistence"
      pattern: "localStorage.*bb-inbox-collapsed"
---

<objective>
Redesign the InboxFeed sidebar component for premium visual consistency: neutralize channel icon colors, fix time label placement to the subject line, refine header controls (subtle autopilot, clickable title replaces fullscreen button), and implement premium edge-knock panel expand/collapse with cursor proximity detection.

Purpose: Elevate the inbox sidebar from functional to premium — consistent monochrome icons, cleaner information hierarchy, and a polished interaction model for panel toggling.
Output: Updated inbox-feed.tsx and dashboard-redesign.tsx with all visual and interaction improvements.
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@personal-assistant/STYLE_GUIDE.md
@personal-assistant/src/components/dashboard/inbox-feed.tsx
@personal-assistant/src/components/dashboard/dashboard-redesign.tsx

<interfaces>
<!-- inbox-feed.tsx exports -->
export function InboxFeed({ isCollapsed, onCollapsedChange }: InboxFeedProps)

interface InboxFeedProps {
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

<!-- dashboard-redesign.tsx manages collapse state -->
const [inboxCollapsed, setInboxCollapsed] = React.useState(false);
// Grid: inboxCollapsed ? '1fr 40px' : '1fr 320px'
// When collapsed, parent renders a small chevron button (lines 188-222)
// When expanded, renders <InboxFeed isCollapsed={inboxCollapsed} onCollapsedChange={handleInboxCollapse} />
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Neutral icons, time placement fix, and header controls refinement</name>
  <files>personal-assistant/src/components/dashboard/inbox-feed.tsx</files>
  <action>
Modify inbox-feed.tsx with these specific changes:

**1. Neutral channel icons (all 9 icon components):**
Change every icon's `style={{ color: 'rgba(...)' }}` to use a unified neutral tone: `style={{ color: 'rgba(255, 255, 255, 0.4)' }}`. Affected icons: GmailIcon, OutlookIcon, WhatsAppIcon, IMessageIcon, AsanaIcon, StripeIcon, SlackIcon, CalendarIcon, SMSIcon. Each has a brand color in the `style` prop — replace with the same neutral value.

**2. Move time to subject line (Line 1):**
In the message row rendering (inside `displayMessages.map`), restructure the content layout:

Line 1 (subject + time): Wrap in a flex container with `justifyContent: 'space-between'`. Subject span gets `flex: 1, minWidth: 0` and keeps its truncation styles. Add the time label as a sibling span with `flexShrink: 0, fontSize: 11, color: 'var(--text-dim)', paddingLeft: 8`. Remove `· ` prefix from time display — just show `{timeAgo(messageTime)}`.

Line 2 (sender only): Remove the time span and the `· ` dot divider entirely. The sender span keeps its current styling but now occupies the full line. Remove the `flex: 1` since there is no time competing for space, and remove the wrapping flex container (the div with `display: 'flex', alignItems: 'center', gap: 4, fontSize: 12`). Replace with a simple span for the sender name, keeping `fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'`.

**3. Header controls refinement:**
- Remove the `Maximize2` import and the fullscreen button entirely (the `<button onClick={navigateToInbox} className="bb-btn bb-btn--icon" ...>` block).
- Make the "Inbox" title text clickable to navigate: wrap the `<span>` with text "Inbox" in a button (or make it the existing span but with `onClick={navigateToInbox}`, `cursor: 'pointer'`). Add subtle hover: on mouseenter set opacity to 0.8, on mouseleave set back to 1.
- Make autopilot more subtle: Change from a pill button with "Autopilot" label to a smaller icon-only button. Remove the "Autopilot" text label. Style the button as: `width: 28, height: 28, borderRadius: 8, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center'`. Keep the active state gradient border but make inactive state fully transparent border with `background: 'transparent'`. Keep the AutopilotIcon at size 14. Add a `title` attribute: `title={autopilotActive ? 'Autopilot active' : 'Enable autopilot'}`.
- Remove the `ChevronLeft` and `ChevronRight` imports and the collapse toggle button from the header. Collapse/expand is now handled by the parent's edge knock mechanism (Task 2).
- Remove the `Maximize2` import from lucide-react.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && npx tsc --noEmit --project personal-assistant/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>All 9 channel icons render in neutral rgba(255,255,255,0.4). Time label sits right-aligned on the subject line. Sender line shows only the name with no dot divider. Autopilot is icon-only. Inbox title is clickable and navigates to inbox tab. No Maximize2 button. No chevron collapse button in InboxFeed header.</done>
</task>

<task type="auto">
  <name>Task 2: Premium edge-knock panel expand/collapse with proximity detection</name>
  <files>personal-assistant/src/components/dashboard/dashboard-redesign.tsx</files>
  <action>
Modify dashboard-redesign.tsx to replace the collapsed-state chevron button with a premium edge-knock interaction.

**1. Add proximity state and refs:**
Add to the component: `const [edgeGlow, setEdgeGlow] = React.useState(0)` (0-1 float for glow intensity), `const edgeRef = React.useRef<HTMLDivElement>(null)`.

**2. Replace collapsed-state button (lines 188-222) with edge indicator:**
When `inboxCollapsed` is true, instead of the 32x32 chevron button, render a thin vertical strip:

```tsx
<div
  ref={edgeRef}
  onClick={() => handleInboxCollapse(false)}
  style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    position: 'relative',
    borderRadius: 12,
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
  }}
>
  {/* Luminous edge strip */}
  <div style={{
    position: 'absolute',
    top: 16,
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 3,
    borderRadius: 3,
    background: `rgba(255, 255, 255, ${0.06 + edgeGlow * 0.14})`,
    boxShadow: edgeGlow > 0.3
      ? `0 0 ${8 * edgeGlow}px rgba(255, 255, 255, ${0.05 * edgeGlow}), 0 0 ${20 * edgeGlow}px rgba(255, 255, 255, ${0.03 * edgeGlow})`
      : 'none',
    transition: 'all 0.3s ease',
  }} />
  {/* Inbox icon hint — appears on hover */}
  <div style={{
    opacity: edgeGlow > 0.5 ? edgeGlow : 0,
    transition: 'opacity 0.2s ease',
    color: `rgba(255, 255, 255, ${0.3 + edgeGlow * 0.3})`,
  }}>
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  </div>
</div>
```

**3. Add mouse proximity detection:**
Add a `useEffect` that listens for `mousemove` on the document when `inboxCollapsed` is true. When the cursor's X position is within 60px of the right edge of the viewport (or within 60px of the edge strip's left boundary), calculate a proximity float from 0 to 1 and set `edgeGlow`. Use `requestAnimationFrame` for smooth updates. Clean up the listener when collapsed changes or component unmounts.

```tsx
React.useEffect(() => {
  if (!inboxCollapsed) {
    setEdgeGlow(0);
    return;
  }
  let rafId: number;
  const handleMouseMove = (e: MouseEvent) => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const distFromRight = window.innerWidth - e.clientX;
      // Proximity zone: 60px from right edge
      if (distFromRight < 60) {
        setEdgeGlow(Math.min(1, (60 - distFromRight) / 60));
      } else {
        setEdgeGlow(0);
      }
    });
  };
  document.addEventListener('mousemove', handleMouseMove, { passive: true });
  return () => {
    document.removeEventListener('mousemove', handleMouseMove);
    cancelAnimationFrame(rafId);
  };
}, [inboxCollapsed]);
```

**4. Smooth spring animation for grid transition:**
Update the grid container's `transition` from `'grid-template-columns 0.3s ease'` to `'grid-template-columns 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'` for a spring-like overshoot effect. This makes the panel expand feel bouncy/premium.

**5. Update collapsed column width:**
Change the collapsed grid column from `40px` to `36px` — slightly thinner for a more refined edge strip (the strip itself is only 3px wide with padding).

**6. Keep `InboxFeed` props as-is** when expanded. The InboxFeed no longer has its own collapse button (removed in Task 1), but `isCollapsed` and `onCollapsedChange` props remain for potential future use. The `isCollapsed` prop is still passed but InboxFeed no longer uses it for rendering a collapse chevron.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && npx tsc --noEmit --project personal-assistant/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>Collapsed inbox shows a thin luminous edge strip (3px) that glows brighter as cursor approaches within 60px. Clicking the strip expands the panel. Grid transition uses spring-like cubic bezier for premium feel. No more square chevron button when collapsed.</done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors: `cd personal-assistant && npx tsc --noEmit`
2. Visual verification: All channel icons appear in the same neutral white tone
3. Time labels appear right-aligned on the subject line in every message row
4. Sender lines show only the name without `· Xh` suffix
5. Autopilot is icon-only (no text label), header "Inbox" text is clickable
6. Collapsed state shows thin glowing strip, mouse proximity triggers glow intensification
7. Click on edge strip expands panel with spring animation
</verification>

<success_criteria>
- Zero brand colors on channel icons — all 9 use rgba(255,255,255,0.4)
- Time on line 1 right of subject, sender on line 2 alone
- No Maximize2 button, no chevron collapse button in inbox header
- Autopilot is a 28x28 icon-only button with tooltip
- Edge knock: luminous strip visible when collapsed, glow responds to cursor proximity (60px zone)
- Spring animation on panel expand/collapse (cubic-bezier 0.34, 1.56, 0.64, 1)
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/14-redesign-inbox-component-neutral-channel/14-SUMMARY.md`
</output>
</task_details>
