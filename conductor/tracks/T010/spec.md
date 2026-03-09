# T010 - Onboarding Flow

## Overview

Define the ideal beta onboarding experience for BitBit so the first external tester can move from invitation to first real value through one clear, trustworthy, high-success path.

This spec is the canonical product target for onboarding. It replaces the current fragmented model of public self-serve marketing, invite-only auth, standalone workspace setup, duplicate connection surfaces, and in-app tours/wizards that compete for ownership of the first-run experience.

The intended beta model for this track is **private, invite-only, and concierge-led**. The onboarding flow should still feel polished and mostly self-guided, but it must optimize for successful activation of early testers rather than broad-market scale.

## Problem Statement

BitBit's product vision is clear: everything starts with connections, background learning begins immediately, and BitBit should introduce itself using real data rather than empty templates. The current implementation does not yet deliver that as a single user journey.

Today the onboarding experience has structural gaps:

- Public entry points imply self-serve access while authentication behaves as invite-only
- First-time users can be routed across multiple overlapping experiences instead of one canonical flow
- Connections are split across legacy and current surfaces with inconsistent naming and behavior
- The first in-app experience can expose incomplete or missing data states
- The true onboarding happy path is not validated end to end

Before onboarding the first beta tester, BitBit needs a single designed flow that engineering can implement, test, and operate with confidence.

## Product Goal

Help an invited beta user reach a trustworthy first-value moment in under 10 minutes by guiding them through:

1. understanding why they have access
2. authenticating successfully
3. confirming their BitBit workspace context
4. connecting one high-value data source
5. seeing BitBit start learning from real data
6. receiving one meaningful, personalized output

## Beta Assumptions

- The first beta tester is a primary account owner, not a broad self-serve prospect
- Access is granted intentionally via invite or direct beta access approval
- The first successful use case is single-user onboarding; team expansion is secondary
- A human operator may monitor early onboarding sessions, but the product should not require manual intervention for the happy path
- OAuth app registrations and core context systems are available enough to support at least one real connection path

## Design Principles

### 1. One path, not many

There must be one canonical onboarding route for first-time users. Setup, activation, and education should feel like one sequence, not separate systems.

### 2. Connections first

BitBit should not ask users to do generic account administration before demonstrating value. Workspace setup should be minimal; connection setup is the real beginning.

### 3. Real data beats empty UX

The onboarding experience should move users toward their first personalized result as quickly as possible. Loading, syncing, and partial states are acceptable. Empty dashboards are not.

### 4. Trust before ambition

Because BitBit asks for access to personal and business systems, onboarding must explain what is happening, why it is needed, and what the user can expect next.

### 5. Concierge-friendly, product-led feel

A human may be available to help, but the experience should feel coherent and self-explanatory even without direct intervention.

### 6. Recoverable failure states

When authentication, connection, or sync fails, users must know what happened, what they can retry, and how to get help.

## Target User

### Primary persona

An invited owner-operator, founder, or manager who wants BitBit to understand their work context quickly and prove it can be useful.

### User goals

- Get access without confusion
- Understand what BitBit will connect to and why
- Set up the minimum needed to begin
- See BitBit produce something personal and credible fast
- Feel safe continuing with deeper setup later

### User anxieties

- "Am I supposed to be here?"
- "Why is this asking for access to so much?"
- "Did setup actually work?"
- "Is this still generic AI, or does it actually know my world?"
- "If something breaks, am I stuck?"

## Canonical Beta Journey

### Stage 0: Beta access entry

**User intent:** Understand how to access BitBit beta.

**Experience:**
- Entry points describe the experience as beta access, not open self-serve signup
- Users are told whether they are signing in with an invited email or requesting access
- Copy sets expectation that BitBit works best after connecting real systems

**Exit criteria:**
- User understands they are entering a private beta flow

### Stage 1: Authentication

**User intent:** Get into the product securely and confidently.

**Experience:**
- User signs in with the invited account
- If the email is not recognized, the message explains the beta access model clearly
- Success messaging tells the user they are moving into setup, not dropping them into a generic dashboard

**Exit criteria:**
- Authenticated session established
- System knows whether the user is a first-time beta user or a returning user

### Stage 2: Welcome and workspace confirmation

**User intent:** Confirm who BitBit is setting up for.

**Experience:**
- A dedicated onboarding screen welcomes the user by name or email
- The screen explains the next three steps: confirm workspace, connect first source, let BitBit learn
- The form asks only for the minimum setup context required for beta:
  - workspace or business name
  - user's display name
  - optional role or operating context
- Pricing plan selection is not shown in beta onboarding
- The screen includes a short trust note explaining that connections come next and why

**Exit criteria:**
- User workspace is created or confirmed
- Authenticated user is correctly attached to that workspace
- User advances into connection setup

### Stage 3: Connect your world

**User intent:** Give BitBit enough context to become useful.

**Experience:**
- This is the centerpiece of onboarding
- The screen is titled `Connect your world`
- One canonical `Connections` surface is used everywhere in onboarding
- The user is guided to connect one recommended primary source first
- Candidate first-source recommendations may be based on the supported stack, but the initial beta default should bias toward the most reliable path
- Additional connections remain available but visually secondary
- Each connection card clearly communicates:
  - what BitBit will access
  - what value that source unlocks
  - whether setup is instant, OAuth-based, or manual
- OAuth return brings the user back into the onboarding sequence, not a legacy settings page

**Exit criteria:**
- At least one connection succeeds
- The system acknowledges success clearly and advances automatically or with a single CTA

### Stage 4: BitBit is learning

**User intent:** Understand that setup is working.

**Experience:**
- After the first successful connection, BitBit immediately begins sync or background crawl
- A dedicated progress state explains what BitBit is doing in plain language
- The user sees useful system-status messaging such as:
  - source connected
  - syncing recent history
  - building context
  - preparing first insights
- Partial progress is acceptable; silence is not
- The user is told roughly what happens next and how long initial learning may take

**Exit criteria:**
- Background processing has started
- User sees clear progress and is not left wondering whether anything happened

### Stage 5: First value

**User intent:** Decide whether BitBit feels real.

**Experience:**
- BitBit should produce one personalized, concrete first-value artifact using real or freshly synced context
- The preferred first-value hierarchy is:
  1. personalized chat introduction grounded in connected data
  2. daily brief or priority summary based on real context
  3. inbox, task, or contact synthesis derived from the first connection
- The output must feel specific enough that the user believes BitBit is beginning to understand their world
- Avoid placeholder-heavy dashboards or dead widgets during this moment

**Exit criteria:**
- User sees one credible personalized output
- User can proceed into the main product with confidence

### Stage 6: Guided next steps and support

**User intent:** Know what to do after the first success.

**Experience:**
- BitBit suggests the next 1-3 best setup actions, such as connecting a second source or asking a guided chat prompt
- A clear support affordance is present during and after onboarding
- If early beta requires human follow-up, that touchpoint is positioned as helpful, not compensatory

**Exit criteria:**
- User understands the next step
- User knows how to recover or ask for help

## Information Architecture

The onboarding IA for beta should be:

1. `Beta entry`
2. `Auth`
3. `Welcome setup`
4. `Connections`
5. `Sync progress`
6. `First value`
7. `Main app`

There should not be a competing parallel IA for `channels`, `integrations`, or secondary onboarding tours during the critical first-run path.

## Functional Requirements

### FR-1: Beta access model consistency

All user-facing entry points in the beta funnel must describe the product as invite-only or beta access controlled unless and until self-serve onboarding is intentionally launched.

- Acceptance: Public and in-app entry copy no longer contradict the actual auth model

### FR-2: Single first-time user routing model

A first-time authenticated user must enter one canonical onboarding flow. Returning users must bypass first-time setup unless explicitly re-entering onboarding.

- Acceptance: The system has one deterministic path for first-time users after authentication

### FR-3: Minimal workspace confirmation

The onboarding flow must collect only the minimum information necessary to establish user and workspace context for beta.

- Acceptance: Workspace confirmation excludes unnecessary plan or billing choices during beta

### FR-4: Correct authenticated user-to-workspace assignment

Onboarding must create or assign the workspace in a way that preserves identity continuity for the authenticated user.

- Acceptance: The signed-in user lands in the correct workspace after onboarding without duplicate identity confusion

### FR-5: Canonical connections surface

The onboarding flow must use one connection UI and one terminology system. The product must consistently say `Connections` in the first-run path.

- Acceptance: No onboarding-critical step routes the user into a legacy or duplicate connection experience

### FR-6: First connection success handling

After a connection succeeds, the product must clearly acknowledge success and return the user to the onboarding sequence.

- Acceptance: OAuth and non-OAuth success states route back into the canonical flow with visible confirmation

### FR-7: Learning progress state

The onboarding flow must include a visible post-connection progress state that explains sync and context-building progress.

- Acceptance: Users see system activity and next-step expectations after the first connection

### FR-8: Personalized first-value artifact

Before onboarding is considered complete, the user must see at least one personalized artifact grounded in real connected data or a meaningful partial sync.

- Acceptance: The first-value surface contains specific user-relevant content, not only static placeholders

### FR-9: Guided next steps

After first value is shown, the product must suggest the next best actions for deepening setup and usage.

- Acceptance: Users are given clear recommended next steps rather than being dropped into an unexplained dashboard

### FR-10: Recoverable failure handling

Every critical step in onboarding must provide actionable failure handling.

- Acceptance: Auth, connection, callback, and sync failures each present retry and help options

### FR-11: Support visibility

The onboarding path must include a visible support affordance for beta users.

- Acceptance: A user can reach help from any onboarding-critical screen

### FR-12: Instrumented funnel

The onboarding funnel must emit trackable events for conversion and failure analysis.

- Acceptance: Product and engineering can identify where invited users drop off

## Non-Functional Requirements

### NFR-1: Reliability

The onboarding happy path must complete without server errors for a valid invited user.

- Target: No 5xx errors on the golden path from auth through first connection and first-value display
- Verification: End-to-end test plus manual beta smoke test

### NFR-2: Terminology consistency

User-facing onboarding copy must follow BitBit terminology rules.

- Target: Onboarding uses `Connections` consistently and avoids `channels`/`integrations` as the primary user term
- Verification: Copy review across all onboarding surfaces

### NFR-3: Time to first value

The onboarding experience should reach a credible first-value moment quickly.

- Target: First-value artifact displayed within 10 minutes of entering setup under normal beta conditions
- Verification: Timed happy-path walkthrough with a seeded beta account

### NFR-4: Accessibility

The onboarding flow must be keyboard navigable and support standard accessible feedback patterns.

- Target: Focus order, labels, status messaging, and actionable errors meet a usable beta baseline
- Verification: Manual keyboard pass and screen-reader-aware review

### NFR-5: Operational observability

The team must be able to understand whether a beta user's onboarding is blocked by auth, connection, or sync issues.

- Target: Logs and funnel events distinguish between major failure categories
- Verification: Simulated failure walkthroughs and event review

## Success Metrics

### Primary metrics

- Invited-user auth completion rate
- Workspace setup completion rate
- First connection success rate
- Time to first successful connection
- Time to first-value artifact
- Onboarding completion rate

### Beta quality signals

- Number of support interventions per tester
- Number of onboarding retries required
- User-reported clarity of setup process
- User confidence after first session

## Acceptance Criteria

- [ ] Beta entry points clearly communicate private beta access rather than generic self-serve signup
- [ ] First-time users follow one canonical onboarding route after authentication
- [ ] Workspace setup asks only for minimal beta-relevant information
- [ ] The authenticated user is attached to the correct workspace without identity duplication
- [ ] The onboarding flow uses one canonical `Connections` surface
- [ ] First connection success returns users to the canonical onboarding sequence
- [ ] Users see visible sync or learning progress after their first connection
- [ ] Users receive one credible personalized first-value artifact before onboarding completes
- [ ] Users are shown recommended next steps after first value
- [ ] Critical onboarding failures provide retry guidance and support access
- [ ] The end-to-end onboarding happy path is covered by automated verification
- [ ] Funnel instrumentation exists for key onboarding stages and failures

## Scope

### In Scope

- Beta entry messaging and access framing
- Auth-to-onboarding routing for first-time users
- Welcome and minimal workspace confirmation
- Canonical connections setup for first activation
- OAuth callback return into onboarding
- Sync or crawl progress state
- First-value moment design and completion rule
- Post-onboarding next-step guidance
- Onboarding support affordances
- Funnel instrumentation for beta onboarding
- End-to-end onboarding verification for the happy path

### Out of Scope

- Public self-serve pricing and billing onboarding
- Full multi-seat team rollout flows beyond a minimal beta path
- Long-term lifecycle onboarding for advanced product areas
- Marketing site redesign beyond access-model alignment
- Deep admin configuration after initial activation
- Full production-scale onboarding analytics dashboards

## Dependencies

### Internal

- `product.md` and `product-guidelines.md` as the source of truth for product behavior and voice
- T008 Platform OAuth App Registrations
- T009 Context Baseplate
- Reliable tenancy resolution and authenticated workspace routing
- Stable connections and sync infrastructure

### External

- OAuth app registrations and provider credentials
- Supabase authentication and profile persistence
- At least one dependable external connection path for the first beta tester

## Risks and Mitigations

### Risk 1: Beta access remains conceptually unclear

If the product continues to present itself as public self-serve while behaving as invite-only, users will begin onboarding confused.

- Mitigation: Align all beta entry messaging before inviting testers

### Risk 2: Duplicate onboarding surfaces continue to compete

If multiple routes still own parts of onboarding, engineering fixes may improve one path while leaving another broken.

- Mitigation: Explicitly choose one canonical flow and deprecate non-canonical first-run routes

### Risk 3: First-value moment depends on incomplete services

If onboarding depends on missing or fragile data surfaces, the user may reach the end of setup and still not feel value.

- Mitigation: Define a strict first-value hierarchy and hide non-critical incomplete modules during beta onboarding

### Risk 4: Team onboarding scope expands too early

If multi-user org onboarding is folded into the first beta milestone, complexity may delay the primary happy path.

- Mitigation: Optimize first for single-user owner onboarding; defer broader team flows unless required

### Risk 5: Failures are discoverable by users before operators

Without instrumentation and clear logs, onboarding failures will be experienced by testers before the team understands them.

- Mitigation: Add funnel events, structured logging, and a beta smoke test before inviting users

## Open Questions

These questions do not block the product target, but they should be answered during planning:

1. Which connection should be the recommended first source for beta based on the most reliable real-world path?
2. Should the first-value artifact be chat-led, dashboard-led, or adapt based on the connected source?
3. Is beta onboarding strictly single-user for the first tester, or must one invite-acceptance path ship in the first milestone?
4. What level of manual operator support should be visible in-product during beta?
5. What specific event schema should be used for onboarding funnel instrumentation?

## Implementation Notes For Planning

When this track moves into planning, the implementation should be sequenced in this order:

1. Align beta entry and auth messaging
2. Define the canonical first-time routing model
3. Unify the connections experience and callback return path
4. Harden workspace provisioning
5. Add sync-progress and first-value states
6. Add support affordances and instrumentation
7. Add the full onboarding end-to-end test

This ordering reduces rework and ensures the first beta experience is coherent before it is polished.
