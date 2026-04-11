# Superhuman Inbox Design: Comprehensive UX Analysis

> Research compiled 2026-03-13. Sources: Superhuman help docs, TechCrunch, product pages, Dribbble, user reviews, engineering blog posts.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Inbox Layout and Card Design](#inbox-layout-and-card-design)
3. [Split Inbox System](#split-inbox-system)
4. [AI-Powered Categorization (Auto Labels)](#ai-powered-categorization-auto-labels)
5. [Email Actions and Keyboard Shortcuts](#email-actions-and-keyboard-shortcuts)
6. [Non-Human Sender Handling](#non-human-sender-handling)
7. [Mobile vs Desktop Design](#mobile-vs-desktop-design)
8. [Notifications and Unread Counts](#notifications-and-unread-counts)
9. [Email Preview and Reading Experience](#email-preview-and-reading-experience)
10. [Search and Information Retrieval](#search-and-information-retrieval)
11. [Performance and Offline Architecture](#performance-and-offline-architecture)
12. [AI Features](#ai-features)
13. [Contact Pane and Social Context](#contact-pane-and-social-context)
14. [Team and Collaboration Features](#team-and-collaboration-features)
15. [Key Takeaways for BitBit](#key-takeaways-for-bitbit)

---

## Design Philosophy

Superhuman's core design principles:

- **Keyboard-first**: Every action accessible via keyboard shortcuts; mouse/touch is secondary
- **Speed as a feature**: Sub-100ms interactions; 32ms response time target even offline
- **Information density over decoration**: Compact, text-focused list view; no wasted pixels
- **Inbox Zero as mental model**: Total message counts (not unread counts) frame email as a processing queue
- **Minimalism**: Clean interface with minimal visual noise; commands accessed via Cmd+K palette rather than toolbars

### Visual Design Language

- **Color palette**: Honolulu Blue (#0068B1) for interactive elements, Baby Powder (#FEFEFC) for light backgrounds, Golden Yellow (#FFDD00) for accents, UCLA Gold (#FDB603) for secondary highlights
- **Two themes**: **Snow** (light) and **Carbon** (dark) -- auto-switches with system preference
- **Carbon dark mode**: Uses five distinct gray shades (not pure black), with lighter grays for nearer surfaces and darker for distant surfaces. This reduces halation (blurring from extreme contrast). All UI elements are themed consistently -- no jarring white compose windows like Gmail's dark mode
- **Typography**: Prioritizes legibility and information density. Font weight variations distinguish primary actions, secondary info, and metadata. No excessive font size options

---

## Inbox Layout and Card Design

### List View Structure

The inbox list view is a **compact, text-focused format** that prioritizes scanning speed:

| Column | Content |
|--------|---------|
| Left | Sender name + circular avatar (32-40px) |
| Center | Subject line (bold) + preview text (lighter gray) |
| Right | Timestamp + status flags (starred, unread) |

Key design choices:

- **No rich formatting or promotional graphics** in the list view -- pure text density
- **Preview text visible without opening** -- users can triage without clicking into each email
- **Conversation threads shown as single items** -- grouped by thread, not individual messages
- **Auto Summarize** (when enabled): One-line AI summary appears above each thread, updating in real time as new messages arrive
- **Split tabs** at top/side of inbox show category navigation with message counts per split
- **Contact Pane** appears in right sidebar on hover over sender name -- shows social profiles, job title, location, recent email history (sourced from Clearbit, AngelList, Gravatar)

### Visual Hierarchy

1. Sender identity (who sent it -- the primary decision point)
2. Subject line (what it's about)
3. Preview text (enough context to decide action without opening)
4. Timestamp (when it arrived)
5. Status indicators (starred, attachments, etc.)

---

## Split Inbox System

### Default Splits

New accounts get two automatic splits:

| Split | Contents |
|-------|----------|
| **Important** | Person-to-person messages; emails from real humans |
| **Other** | Automated messages, mailing lists, marketing, notifications |
| **Calendar** | Calendar invitations, scheduling emails, Calendly links (auto-created) |

### Creating Custom Splits

- Access via **Cmd+K > Add to Split Inbox** or Settings
- Build splits based on: sender addresses, domains, subject keywords, recipient lists, or AI-powered prompts
- **Real-time preview** shows matching emails as users configure criteria
- Recommended split count: **3-7** (balances organization vs cognitive overhead)
- Can combine AND/OR logic with exclusion rules

### Common Custom Split Patterns

| Role | Typical Splits |
|------|---------------|
| Sales Director | VIPs, Prospects, Team, Everything Else |
| Engineer | Team, Urgent, Bugs, Everything Else |
| PM | Direct Reports, Dependencies, Production Issues, Everything Else |
| Founder | Investors, Team, Customers, Everything Else |

### Split Behavior Configuration

- **Duplication control**: By default, emails appear in only ONE split. Users can enable duplication for critical messages to appear in both Important and Other
- **Navigation**: Tab / Shift+Tab to cycle between splits on desktop; bottom tabs on mobile
- **Message counts**: Each split shows **total** message count (not unread), reinforcing Inbox Zero processing model

---

## AI-Powered Categorization (Auto Labels)

### Built-in Auto Labels (all plans)

| Label | What It Catches |
|-------|----------------|
| **Marketing** | Promotional emails, product announcements, commercial solicitations |
| **News** | Newsletter subscriptions, industry updates, curated content feeds |
| **Pitch** | Unsolicited sales inquiries, cold outreach, business development |
| **Social** | Social media notifications, community platform alerts |

By default, all four route to the **Other** split. Users can override per-label (e.g., move Pitch to Important if cold outreach matters to their role).

### Custom AI Labels (Business/Enterprise plans)

- Write natural language prompts: "emails that need urgent action", "requests from potential partners"
- AI analyzes content, tone, context, and metadata -- not just pattern matching
- Applied retroactively to the **previous 14 days** of email
- Up to **10 custom AI-prompted labels** on Business plan
- Deterministic criteria (sender, domain, subject keywords) available on all tiers
- **Limitation**: Cannot edit existing AI label prompts; must create a new label if misclassifying

### How the AI Works

- Combines **deterministic rules** (sender, domain, subject) with **ML-powered content analysis**
- Learns from user behavior: which emails are read immediately, which are archived without action, which get long replies
- Uses NLP to understand intent and distinguish between e.g. friendly inquiry vs cold outreach
- Considers conversation history and sender-recipient relationship patterns
- Custom embedding models deployed on Baseten infrastructure with sub-500ms P95 latency

### Auto Labels + Splits Integration

Auto Labels tag emails contextually; Splits organize labeled emails into processing groups. The layered system means:

1. Email arrives
2. Auto Labels classify it (Marketing, News, Pitch, Social, or custom)
3. Split rules determine which split tab it appears in
4. User processes emails per-split in focused batches

---

## Email Actions and Keyboard Shortcuts

### Core Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Archive / Mark as Done | **E** |
| Snooze / Set Reminder | **H** |
| Reply | **R** |
| Reply All | **A** |
| Forward | **F** |
| Star | ***** |
| Mark as Read/Unread | **U** |
| Trash | **#** |
| Next message | **J** |
| Previous message | **K** |
| Next split | **Tab** |
| Previous split | **Shift+Tab** |
| Command palette | **Cmd+K** (Mac) / **Ctrl+K** (Win) |
| Search | **/** |
| Unsubscribe | **Cmd+U** / **Ctrl+U** |
| Quick Quote reply | **Q** (on selected text) |
| Send Later | Available via compose toolbar |

### Triage Bar

When reading a message, a **triage bar** appears at the bottom with action buttons:

- Default actions: Done, Reminder, Star, Trash, Reply
- **Fully customizable**: Add/remove actions with +/- buttons, reorder by dragging
- Keyboard shortcuts work simultaneously -- no need to click
- Separate customization for triage bar vs swipe actions on mobile

### Command Palette (Cmd+K)

- Central hub for all actions and navigation
- Search for splits, labels, folders, contacts, settings
- Natural language queries supported (via Ask AI on Business plans)
- Access any feature without remembering specific shortcuts
- Functions as the universal entry point to the entire application

### One-Key Unsubscribe (Cmd+U)

- Instantly unsubscribes from the current sender
- Optionally archives or trashes ALL previous messages from that sender in one action
- On mobile: open message, swipe down from top, tap Unsubscribe
- Dramatically reduces inbox clutter -- users report 20-30% volume reduction from unsubscribing

---

## Non-Human Sender Handling

### Automatic Classification

Superhuman distinguishes human vs non-human senders by analyzing:

- **Message headers**: Mailing list identifiers, automated sending system markers
- **Sender patterns**: Addresses from no-reply@, notifications@, etc.
- **Content structure**: Template formatting, standardized layouts
- **Send schedule**: Regular intervals vs ad-hoc timing
- **Metadata**: System-generated message flags from tools like Google Docs, Notion, Asana

### Default Treatment

- Newsletters -> **News** Auto Label -> **Other** split
- Marketing emails -> **Marketing** Auto Label -> **Other** split
- Social notifications -> **Social** Auto Label -> **Other** split
- Tool notifications (Asana, Notion, Docs) -> Can be given dedicated splits

### Customization for Automated Emails

- **Auto Archive**: Specific Auto Labels can skip the inbox entirely, going straight to Done folder
- **Dedicated splits**: Create a split for specific tool notifications (e.g., "Production Alerts" from monitoring)
- **Priority override**: Move any Auto Label category to Important split if role demands it
- **Batch processing**: Non-human emails are designed to be consumed in dedicated time blocks, not interrupting flow

### Philosophy

The core insight: newsletters, notifications, and marketing emails are **not urgent** and benefit from batch processing. Human-to-human communication is the default priority. But this is a starting point, not a constraint -- users override freely based on role.

---

## Mobile vs Desktop Design

### Desktop

- **Three-zone layout**: Left sidebar (splits), center (email list with previews), right sidebar (contact pane on hover)
- **Full-screen reading**: Selecting an email replaces the list view with full message content (NOT a split-pane)
- **Keyboard-first**: J/K navigation, E to archive, H to snooze, etc.
- **Command palette**: Cmd+K for everything
- **Contact pane**: Hover over sender name to see social profiles, job title, recent history

### Mobile (iOS + Android)

- **Gesture vocabulary** replaces keyboard shortcuts:
  - Pull down from top -> triggers search
  - Swipe right (L-shape motion) -> opens Command palette
  - Two-finger tap on message -> opens Command for that message
  - Swipe left on message -> Mark as Done (customizable)
  - Swipe right on message -> Set Reminder (customizable)
  - Swipe triage bar right-to-left -> advance to next message without marking done
- **Split navigation**: Bottom tabs; swipe right-to-left to see more splits beyond screen width
- **Pull up from bottom**: Access folder/label hierarchies
- **Full-screen sequential navigation**: Portrait phones show one email at a time; tablets in landscape can show preview pane
- **Contact info**: Tap area above message subject to see contact details; swipe left/right to cycle through thread participants
- **Formatting**: Frame icon above send button; double-tap text selection for formatting tools

### Feature Parity

Mobile maintains near-complete feature parity with desktop. The same Split Inbox architecture, Auto Labels, AI features, and triage actions are available on both platforms -- adapted to touch interaction patterns.

---

## Notifications and Unread Counts

### Badge Philosophy

Superhuman **does not emphasize unread counts**. Instead:

- Badges show **total email count** in the current split (both read and unread)
- This reframes email as a processing queue (Inbox Zero) rather than a growing unread pile
- No mechanism to show badge counts for inactive splits simultaneously (prevents visual distraction)

### Notification Controls

- Toggle notifications per-account via Cmd+K > Notifications
- **Per-split notification control**: Enable notifications for critical splits (e.g., Direct Messages), silence less urgent ones
- Calendar event notifications configurable separately
- Granular enough to support: batch notifications during scheduled processing, or real-time interrupts for urgent messages only

### Psychology

The design deliberately avoids the anxiety of growing unread numbers. By showing total count and framing it as "messages to process," users feel motivated toward completion rather than overwhelmed by accumulation.

---

## Email Preview and Reading Experience

### Reading Pane Design

- **NOT a traditional split view**: Clicking an email transitions to **full-screen reading** (replaces the email list)
- Email displays "like a typed business letter" -- clean typography, minimal header clutter
- Conversation view shows all messages in thread, most recent first (reverse chronological)
- Quoted text automatically collapsed (expandable per section)
- J/K shortcuts to navigate between messages without returning to list

### Conversation Threading

- All emails grouped by thread automatically
- Each message shows: sender name, timestamp, content -- clearly separated
- Multi-participant threads display each person's messages consistently
- **Quick Quote (Q)**: Select a portion of text and hit Q to quote just that section in your reply -- handles multi-topic emails elegantly

### Attachments

- Attachments displayed inline where possible
- Dedicated attachment handling accessible through message UI
- Cached locally for offline access via CacheStorage

### Auto Summarize

- One-line AI summary per conversation thread
- Updates in real time as new messages arrive
- Enables processing multiple conversations quickly without reading full history
- Balances brevity with informativeness -- surfaces decision-relevant information

---

## Search and Information Retrieval

### Instant Search

- Activated via **/** or **Cmd+K > Search**
- Results appear instantly from local index -- years of email history in milliseconds
- Mobile: pull-down gesture from inbox top

### Search Operators

| Operator | Example |
|----------|---------|
| Sender | `from:alice@company.com` |
| Recipient | `to:bob@company.com` |
| Subject | `subject:quarterly review` |
| Date range | Date-based filtering supported |
| OR logic | `cohort 126 OR satisfaction` |
| Exclude | `cohort 126 -morningbrew.com` |
| Exact match | `"exact phrase here"` |

### Ask AI (Business/Enterprise)

- Natural language queries: "where is the Q2 offsite?", "when is my flight?"
- Returns answers with **direct citations** to relevant emails
- Cross-thread search: "find positive quotes about instant reply" scans all threads
- Can create calendar events from natural language: "schedule meeting with Mike Thursday 3pm"
- Retrieves from up to **one year** of email history
- Learns communication patterns over time for increasingly sophisticated answers

---

## Performance and Offline Architecture

### Speed Targets

- **32ms response time** for UI interactions (even offline)
- Sub-500ms P95 latency for AI features (embedding models on Baseten)
- Instant search results from local index

### Offline Support

- **ServiceWorkers** serve cached assets when disconnected
- Users can: read cached emails, search local history, compose messages offline
- **Storage architecture**:
  - CacheStorage: Application code + attachments (binary-safe)
  - WebSQL: Email metadata + message content (queryable)
  - LocalStorage: Configuration data (simple key-value)

### Offline Sync (Modifier Architecture)

1. User takes action offline (archive, star, label)
2. Action queued as a "modifier" and persisted to disk
3. On reconnection, modifiers sync to server in original order
4. Pure functions ensure operations can retry without inconsistency
5. If sync fails permanently, modifier rolls back and UI reverts to server state

This architecture means users never notice network issues -- the app feels native-fast regardless of connectivity.

---

## AI Features

### Write with AI

- Type a quick prompt ("follow up about yesterday's meeting")
- AI generates a complete email matching the user's writing style
- Learns voice from analysis of previously sent emails
- Available in compose flow

### Instant Reply

- Suggested responses appear when opening a message
- One-click to insert and customize before sending
- Contextually relevant based on thread content

### Auto Summarize

- One-line thread summaries in the inbox list view
- Updates in real time as new replies arrive
- Reduces need to read full conversation history

### Auto Reminders + Auto Drafts

- Automatically resurfaces emails that haven't received replies
- Optionally auto-drafts a follow-up response in the user's voice
- Feedback mechanism: Cmd+K > "Give Feedback on Auto Draft" to improve tone/style

### Ask AI

- Natural language search across email + calendar
- Creates calendar events from conversation
- Answers contextual questions with citations
- One-year historical retrieval depth

---

## Contact Pane and Social Context

The Contact Pane appears in the right sidebar when hovering over sender names:

### Information Displayed

- Name, profile picture, email address
- Work city/region
- Professional bio (when available)
- Links to four most recent emails with that person
- Social media profiles, personal website, company website

### Data Sources

- **Clearbit**: LinkedIn profiles, job titles, industry
- **AngelList**: Startup ecosystem connections
- **Gravatar**: Profile images

### Interactions

- Click name -> search inbox for all emails from that person
- Click email -> open new compose to that contact
- Hover name -> copy button for single-click address copy
- **Refer** button for non-Superhuman contacts (both get a free month)
- **Invite to Team** button for same-domain colleagues

### Human vs Company Distinction

- Human email addresses get full Contact Pane data
- Company/generic addresses (info@, support@) typically don't show Contact Pane

---

## Team and Collaboration Features

### Shared Conversations

- Share email threads with teammates without forwarding
- Team members can view the original thread in their Superhuman

### Team Comments

- Add internal comments to email threads (invisible to external recipients)
- Enables async discussion about an email without polluting the thread

### Team Templates (Snippets)

- Shared email templates across team members
- Individual snippets expandable with keyboard shortcuts
- Team-wide consistency in responses

### Team Analytics

- Visibility into team email response times
- Shared read statuses for team coordination

### Read Statuses

- See when recipients open emails and on which device
- Informs follow-up timing decisions
- Recent Opens Feed shows chronological open activity

### CRM Integrations

- Native Salesforce integration
- Contact and deal context surfaced directly in the email interface
- Eliminates switching between email and CRM

---

## Key Takeaways for BitBit

### Design Patterns Worth Adopting

1. **Split Inbox with AI categorization**: Human vs automated sender separation as the primary organizational axis
2. **Keyboard-first with gesture parity**: Desktop shortcuts translated to intuitive mobile gestures
3. **Command palette as universal entry point**: Cmd+K for everything reduces interface clutter
4. **Total count (not unread) badge model**: Reframes processing psychology from anxiety to completion
5. **Full-screen reading (not split pane)**: Maximizes focus when engaging with content
6. **Contact context on hover**: Social/professional context without leaving the inbox
7. **One-action unsubscribe with cleanup**: Reduces noise at the source
8. **Auto Archive for low-priority categories**: Newsletters/notifications skip inbox entirely
9. **Thread summaries**: AI one-liners in list view enable faster triage
10. **Offline-first with modifier sync**: Native-feeling speed regardless of connectivity

### Differentiation Opportunities

- Superhuman is email-only; BitBit spans multiple channels -- the split concept could extend to channel-aware categorization
- Superhuman's AI labels are limited to email content; BitBit's Context Baseplate could provide richer entity-aware categorization
- Superhuman charges $30/mo per user; a more accessible pricing model with similar UX quality is a competitive advantage
- Team features in Superhuman are basic (comments, shared threads); BitBit's agent-first architecture could provide deeper automation
- Superhuman lacks proactive capabilities; BitBit agents can anticipate needs rather than just categorize

---

## Sources

1. https://help.superhuman.com/hc/en-us/articles/38458392810643-Default-Split-Inbox
2. https://help.superhuman.com/hc/en-us/articles/45274846287891-Organize-with-AI
3. https://superhuman.com/products/mail/shortcuts
4. https://help.superhuman.com/hc/en-us/articles/38458431506067-Customizing-Swipes-and-Triage-Bar
5. https://help.superhuman.com/hc/en-us/articles/45274749770771-Organize-Your-Inbox-with-Superhuman-Mail
6. https://blog.superhuman.com/automate-emails/
7. https://dribbble.com/superhuman
8. https://techcrunch.com/2025/02/19/superhuman-introduces-ai-powered-categorization-to-reduce-spammy-emails-in-your-inbox/
9. https://blog.superhuman.com/group-emailing/
10. https://help.superhuman.com/hc/en-us/articles/40127432866323-Auto-Labels
11. https://superhuman.com/products/mail
12. https://help.superhuman.com/hc/en-us/articles/45294459598099-Stop-the-Inbox-Clutter
13. https://superhuman.com/products/mail/customer-story/ateam
14. https://sparkmailapp.com/blog/spark-vs-superhuman
15. https://blog.superhuman.com/bulk-unsubscribe-from-emails/
16. https://blog.superhuman.com/using-ai-to-manage-emails/
17. https://help.superhuman.com/hc/en-us/articles/40144492186515-Auto-Reminders-Auto-Drafts
18. https://superhuman.com/products/mail/ai
19. https://blog.superhuman.com/gmail-dark-mode/
20. https://help.superhuman.com/hc/en-us/articles/38458640102291-Auto-Summarize
21. https://help.superhuman.com/hc/en-us/articles/40183187164051-Search
22. https://help.superhuman.com/hc/en-us/articles/38458628979091-Ask-AI
23. https://blog.superhuman.com/architecting-a-web-app-to-just-work-offline-part-1/
24. https://connect.superhuman.com/t/launched-custom-profile-pictures/17688
25. https://help.superhuman.com/hc/en-us/articles/45579561399699-Attachments
26. https://curiouse.co/superhuman-shifting-your-email-experience-to-hyper-speed-be2dba0d1dc7
27. https://superhuman.com/products/mail/plp/ai-v1
28. https://help.superhuman.com/hc/en-us/articles/38458397554963-Instant-Reply
29. https://help.superhuman.com/hc/en-us/articles/45263736431507-Compose-Quickly
30. https://help.superhuman.com/hc/en-us/articles/45271247561107-Structure-Your-Inbox
31. https://help.superhuman.com/hc/en-us/articles/44790851872019-Email-Notifications
32. https://help.superhuman.com/hc/en-us/articles/38456037129235-Contact-Pane
33. https://superhuman.com/products/mail/shortcuts
34. https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/
35. https://www.baseten.co/resources/customers/superhuman/
36. https://help.superhuman.com/hc/en-us/articles/38458549947539-Calendar-Overview
37. https://superhuman.com/products/mail/crm-integrations
38. https://help.superhuman.com/hc/en-us/articles/38457432565267-Shared-Conversations-and-Team-Comments
39. https://help.superhuman.com/hc/en-us/articles/38457566867347-Read-Statuses-and-Recent-Opens-Feed
40. https://help.superhuman.com/hc/en-us/articles/38458290528531-Mobile-Navigation
41. https://help.superhuman.com/hc/en-us/articles/45275075302931-Create-Your-Own-Split-Inbox
42. https://help.superhuman.com/hc/en-us/articles/45272865605139-Team-Templates
43. https://help.superhuman.com/hc/en-us/articles/45272688421267-Tracking-Reads-and-Replies-Together
44. https://www.schemecolor.com/superhuman-color-scheme.php
