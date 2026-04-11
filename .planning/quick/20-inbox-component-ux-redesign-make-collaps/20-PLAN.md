---
phase: Q20
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/20-inbox-component-ux-redesign-make-collaps/20-INBOX-UX-DESIGN.md
autonomous: true
requirements: [Q20-DESIGN-SYNTHESIS]
must_haves:
  truths:
    - "Design document covers collapse/expand discoverability with specific affordance recommendations"
    - "Design document addresses the missing collapse button gap with a concrete solution"
    - "Design document defines sidebar-to-full-inbox transition UX"
    - "Design document evaluates edge-knock pattern and proposes fallback mechanisms"
    - "Design document covers mobile/responsive behavior"
    - "Design document provides first-time user onboarding strategy for inbox patterns"
    - "Design document addresses keyboard shortcut discoverability"
    - "Design document maps the relationship between inbox-feed sidebar and inbox-tab full view"
  artifacts:
    - path: ".planning/quick/20-inbox-component-ux-redesign-make-collaps/20-INBOX-UX-DESIGN.md"
      provides: "Comprehensive UX design document for inbox collapse/expand and interaction patterns"
      min_lines: 200
  key_links:
    - from: "20-INBOX-UX-DESIGN.md"
      to: "dashboard-redesign.tsx"
      via: "Collapse/expand state management recommendations"
      pattern: "inboxCollapsed|handleInboxCollapse|edge-knock"
    - from: "20-INBOX-UX-DESIGN.md"
      to: "inbox-feed.tsx"
      via: "Sidebar header affordance and collapse trigger design"
      pattern: "onCollapsedChange|InboxFeed"
    - from: "20-INBOX-UX-DESIGN.md"
      to: "inbox-tab.tsx"
      via: "Full inbox view relationship and transition patterns"
      pattern: "bb-navigate|inbox"
---

<objective>
Create a comprehensive UX design document synthesizing product design thinking for the inbox component's collapse/expand mechanism, discoverability, interaction patterns, and the relationship between the sidebar feed and full inbox view.

Purpose: The inbox has been through 4 redesign iterations (Q15-Q18) focusing on visual polish and content patterns, but the fundamental interaction model -- how users discover, collapse, expand, and transition between inbox views -- has a critical gap (no collapse button exists) and lacks a cohesive design vision. This document will serve as the authoritative design reference for all future inbox implementation work.

Output: `20-INBOX-UX-DESIGN.md` -- a complete design specification covering affordances, state management, transitions, responsive behavior, onboarding, and accessibility.
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@personal-assistant/src/components/dashboard/dashboard-redesign.tsx (collapse/expand state, edge-knock, grid layout)
@personal-assistant/src/components/dashboard/inbox-feed.tsx (sidebar feed component, header, props)
@personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx (full inbox view, categories, keyboard, expanded rows)
@personal-assistant/src/components/dashboard/inbox-drawer.tsx (full-screen overlay for reading)
@personal-assistant/src/components/dashboard/inbox-shortcuts-overlay.tsx (keyboard shortcut reference)
@personal-assistant/src/hooks/use-inbox-keyboard.ts (keyboard navigation, chords, actions)
@.planning/quick/16-inbox-toolbar-expanded-row-redesign/DESIGN-BRIEF.md (established design principles)
@personal-assistant/STYLE_GUIDE.md (glassmorphic design tokens)

<interfaces>
<!-- Current collapse/expand architecture from dashboard-redesign.tsx -->
State: inboxCollapsed (boolean), edgeGlow (0-1 float)
Storage: localStorage key 'bb-inbox-collapsed'
Handler: handleInboxCollapse(collapsed: boolean) -- sets state + persists
Grid: inboxCollapsed ? '1fr 36px' : '1fr 320px' with spring cubic-bezier(0.34, 1.56, 0.64, 1)
Edge-knock: mousemove listener within 60px of right viewport edge, RAF-throttled
Collapsed view: 36px strip with luminous 3px bar + chevron icon (opacity tied to edgeGlow)
Expand trigger: click on collapsed strip -> handleInboxCollapse(false)
Collapse trigger: NONE -- no UI element calls onCollapsedChange(true)

<!-- InboxFeed props -->
interface InboxFeedProps {
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}
// Note: onCollapsedChange is passed but NEVER called from within InboxFeed

<!-- Inbox navigation between views -->
// InboxFeed navigates to full inbox tab via custom event:
window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'inbox' } }));
// Both "Inbox" title click and message row clicks trigger this

<!-- Keyboard shortcuts defined in inbox-shortcuts-overlay.tsx -->
Navigation: j/k (next/prev), Enter/o (open), g+i (go to inbox)
Actions: e (archive), d (done), r (reply), f (forward), s (snooze), * (star), # (delete), Shift+! (spam)
Selection: Shift+Click (range), Cmd/Ctrl+Click (toggle), Cmd+a (all), Cmd+Shift+a (deselect)
Other: / (search), ? (show shortcuts), 1-4 (switch category), Esc (close/clear)

<!-- Established design principles from DESIGN-BRIEF.md -->
1. Read first, act second -- content flows top-down, actions at bottom
2. AI is the content, not a feature -- invisible AI integration
3. Progressive disclosure at every level
4. Non-intrusive selection -- floating bulk actions
5. Speed as UX -- functional animations, fast ghost drafts
6. Keyboard-native -- every action reachable via keyboard
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Research competitive collapse/expand and sidebar panel patterns</name>
  <files>.planning/quick/20-inbox-component-ux-redesign-make-collaps/20-INBOX-UX-DESIGN.md</files>
  <action>
Research and synthesize UX patterns from these specific products and create the comprehensive design document. The document must cover ALL of the following sections:

**Section 1: Current State Audit**
Document the exact current implementation by reading the source files listed in context:
- The collapse/expand state flow (dashboard-redesign.tsx lines 28-74)
- The missing collapse button gap (InboxFeed has onCollapsedChange prop but never calls it)
- The edge-knock pattern (proximity detection within 60px of right edge)
- The sidebar-to-full-inbox navigation (bb-navigate custom event)
- The keyboard shortcuts layer (use-inbox-keyboard.ts)
- Map ALL interaction entry points: how does a user currently interact with inbox? (sidebar feed click, edge-knock expand, full tab via nav, keyboard shortcuts)

**Section 2: Competitive Analysis**
Research these specific interaction patterns (use WebFetch where helpful):
- **Slack sidebar collapse**: How does Slack handle sidebar collapse/expand? (drag handle, keyboard shortcut Cmd+Shift+D, menu toggle)
- **VS Code panel/sidebar**: Activity bar icons toggle panels, drag-to-resize, Cmd+B shortcut
- **Notion sidebar**: Hover-to-reveal on collapsed state, pin/unpin toggle, Cmd+\ shortcut
- **Linear sidebar**: Compact/expanded modes, keyboard toggle
- **Superhuman split pane**: Reading pane resize and hide
- **macOS Finder sidebar**: Toggle via View menu or Cmd+Opt+S, smooth animation
- For each: document the trigger mechanism, visual affordance, animation, keyboard shortcut, and persistence model

**Section 3: Collapse/Expand Design Specification**
Based on the competitive analysis, design the complete collapse/expand interaction:

A. **Collapse trigger** (the critical missing piece):
- Recommend a specific UI element in the InboxFeed header that calls onCollapsedChange(true)
- Consider: should it be a dedicated chevron/arrow button? A double-click on header? A drag handle?
- Specify exact placement, size, icon, hover state, and animation
- The solution must not conflict with the existing "Inbox" title click (which navigates to full inbox tab)

B. **Edge-knock evaluation**:
- Is the current 60px proximity zone sufficient?
- Should there be a persistent subtle affordance even without hover (e.g., a faint 2px line always visible)?
- Should the collapsed strip show a tooltip or badge count?
- Evaluate: should edge-knock be the primary expand mechanism or a secondary one?

C. **Keyboard shortcut for collapse/expand**:
- Recommend a shortcut (e.g., [ or ] to toggle inbox panel) that integrates with the existing use-inbox-keyboard.ts chord system
- Consider conflict with existing shortcuts

D. **Animation and transition design**:
- Current: spring cubic-bezier(0.34, 1.56, 0.64, 1) on grid-template-columns
- Evaluate: is the spring bounce appropriate? Should it be more subtle?
- Specify duration, easing, and any staggered sub-animations (e.g., content fade during collapse)

E. **Collapsed state enhancements**:
- Should the collapsed strip show unread count?
- Should it show the latest message preview on hover?
- Should it have a mini notification badge?

**Section 4: Sidebar to Full Inbox Transition**
Design the relationship between the three inbox surfaces:
1. **Inbox sidebar feed** (dashboard, 320px) -- preview surface
2. **Inbox full tab** (full width) -- work surface
3. **Inbox drawer** (overlay) -- deep-read surface

For each transition:
- Sidebar feed -> Full tab: What happens when user clicks "Inbox" title? (currently fires bb-navigate event). Should there be a visual transition? Should the sidebar collapse automatically?
- Full tab -> Sidebar: When user navigates away from inbox tab, does sidebar re-expand? Should it?
- Message click in sidebar -> What opens? (currently: navigates to full tab). Consider: should a short-press open the inline expanded row in full tab, while a long-press or modifier-click opens the drawer?
- Drawer relationship: When is drawer appropriate vs inline expand? Document the decision criteria.

**Section 5: First-Time User Experience**
Design onboarding for inbox interaction patterns:
- How does a new user discover the collapse/expand mechanism?
- How do they discover keyboard shortcuts? (currently: ? key opens overlay, but users must know to press ?)
- Consider: a one-time tooltip on the collapse button on first visit
- Consider: a subtle "Press ? for shortcuts" hint in the inbox footer
- Consider: progressive shortcut hints (show "j/k" hint after 5 manual navigations)
- All onboarding must be dismissable and non-intrusive (per established design principles)

**Section 6: Responsive and Mobile Behavior**
Design inbox behavior across breakpoints:
- Current: `@media (max-width: 1024px)` forces single column (grid-template-columns: 1fr)
- What happens to inbox on tablet (768-1024px)? Should it become a bottom sheet? A swipe-from-right panel?
- What happens on mobile (<768px)? Should inbox be a separate page?
- How do touch gestures map to keyboard shortcuts? (swipe left to archive, swipe right to snooze?)
- Should the collapsed strip exist on tablet or should it be hidden entirely?

**Section 7: Accessibility**
- ARIA roles and states for the collapse/expand mechanism
- Focus management when transitioning between collapsed/expanded
- Screen reader announcements for state changes
- Keyboard trap prevention in the expanded inbox
- Reduced motion preferences and animation behavior

**Section 8: State Management Recommendations**
- Current: localStorage only for collapse state
- Should collapse state sync across tabs? (BroadcastChannel API)
- Should collapse state be per-user preference stored server-side?
- Unread count synchronization between sidebar badge and full tab
- Message read state propagation between sidebar and full tab views

**Section 9: Implementation Roadmap**
Prioritize the recommendations into phases:
- Phase A (Critical): Fix the missing collapse button, add keyboard shortcut
- Phase B (Important): Enhanced collapsed strip, transition polish, accessibility
- Phase C (Nice-to-have): First-time onboarding, responsive touch gestures, cross-tab sync
- For each phase: list specific files to modify and estimated scope

Format the document with clear section headers, ASCII diagrams for layouts, interaction state machines where appropriate, and specific CSS/style values using the established glassmorphic design system tokens. Reference the DESIGN-BRIEF.md principles throughout.
  </action>
  <verify>
    <automated>test -f /home/claude/bitbit/.planning/quick/20-inbox-component-ux-redesign-make-collaps/20-INBOX-UX-DESIGN.md && wc -l /home/claude/bitbit/.planning/quick/20-inbox-component-ux-redesign-make-collaps/20-INBOX-UX-DESIGN.md | awk '{if ($1 >= 200) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines (need 200+)"; exit ($1 >= 200 ? 0 : 1)}'</automated>
  </verify>
  <done>
    - Design document exists at 20-INBOX-UX-DESIGN.md with 200+ lines
    - Section 1 documents the current state including the missing collapse button gap
    - Section 2 covers 5+ competitive products with specific interaction pattern analysis
    - Section 3 provides a concrete collapse trigger design with exact UI specs
    - Section 4 maps all three inbox surfaces and their transitions
    - Section 5 defines first-time user onboarding strategy
    - Section 6 covers responsive breakpoints and mobile behavior
    - Section 7 addresses accessibility requirements
    - Section 8 covers state management recommendations
    - Section 9 provides a prioritized implementation roadmap with file references
  </done>
</task>

</tasks>

<verification>
- Design document exists and has comprehensive coverage (200+ lines)
- All 9 sections are present with substantive content
- The critical gap (missing collapse button) has a concrete, specific solution
- Competitive analysis references real products with specific patterns
- Implementation roadmap references actual codebase files
- Design tokens reference established glassmorphic system (globals.css, bitbit-design-system.css)
- Keyboard shortcuts do not conflict with existing shortcuts in use-inbox-keyboard.ts
</verification>

<success_criteria>
A comprehensive design document that a Claude executor could use to implement each recommendation without interpretation. Every section provides specific enough guidance (exact CSS values, component placement, interaction state machines) that implementation plans can be derived directly from it. The document becomes the authoritative reference for all future inbox interaction work, superseding ad-hoc decisions made during Q15-Q18.
</success_criteria>

<output>
After completion, create `.planning/quick/20-inbox-component-ux-redesign-make-collaps/20-SUMMARY.md`
</output>
