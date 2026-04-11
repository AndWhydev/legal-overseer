# Investor Pitch Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 13 slide HTML web presentation (shadcn aesthetic, light theme, monochrome) with embedded video clips, keyboard navigation, and Vercel hosting as a route group in the existing Next.js app.

**Architecture:** Standalone route group at `/pitch` inside the existing personal-assistant Next.js 16 app. Each slide is a React component. A `PitchDeck` wrapper manages slide state, keyboard navigation, and transitions via `motion`. Video clips are MP4 files loaded from `/public/pitch/`. No server components needed as the entire deck is interactive (client component).

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, motion (framer-motion v12), existing shadcn components (Table, Card), Geist Mono + Libre Baskerville fonts (already loaded in root layout).

**Slide count:** 13 slides (1, 2, 3, 4, 5a, 5b, 5c, 6, 7, 8, 9, 10, 11)

---

## File structure

```
personal-assistant/
  public/
    pitch/
      videos/              # MP4 clips (added manually by founders)
        chat-demo.mp4
        connections-grid.mp4
        whatsapp-triage.mp4
      bitbit-logo.svg       # Monochrome logo for cover slide
  src/
    app/
      pitch/
        layout.tsx          # Minimal layout: no navbar, no sidebar, pitch-specific styles
        page.tsx            # Entry point, renders PitchDeck
    components/
      pitch/
        pitch-deck.tsx      # Main wrapper: slide state, keyboard nav, transitions
        slide.tsx           # Base slide component: consistent padding, max-width, entry animation
        slides/
          cover.tsx         # Slide 1
          problem.tsx       # Slide 2
          why-now.tsx       # Slide 3
          meet-bitbit.tsx   # Slide 4
          connections.tsx   # Slide 5a
          memory.tsx        # Slide 5b
          trust-levels.tsx  # Slide 5c
          team.tsx          # Slide 6
          traction.tsx      # Slide 7
          business-model.tsx # Slide 8
          market.tsx        # Slide 9
          competition.tsx   # Slide 10
          next-steps.tsx    # Slide 11
        video-clip.tsx      # Looping muted autoplay MP4 component
        stat-block.tsx      # Reusable stat display (number + label)
        comparison-table.tsx # Styled table for slide 10
        slide-progress.tsx  # Subtle progress indicator (dots or bar)
```

---

### Task 1: Route group and layout

**Files:**
- Create: `src/app/pitch/layout.tsx`
- Create: `src/app/pitch/page.tsx`

- [ ] **Step 1: Create the pitch layout**

This layout strips the main app's navbar and sidebar. Light background, centered content, no chrome.

```tsx
// src/app/pitch/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BitBit | Meet your new COO",
  description: "BitBit handles your business while you do your work.",
};

export default function PitchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-zinc-200">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create the page entry point**

```tsx
// src/app/pitch/page.tsx
"use client";

import { PitchDeck } from "@/components/pitch/pitch-deck";

export default function PitchPage() {
  return <PitchDeck />;
}
```

- [ ] **Step 3: Create public directory for pitch assets**

```bash
mkdir -p personal-assistant/public/pitch/videos
```

- [ ] **Step 4: Verify the route loads**

```bash
cd personal-assistant && npm run dev
```

Open `http://localhost:3000/pitch` in browser. Should see a blank white page with no navbar or sidebar.

- [ ] **Step 5: Commit**

```bash
git add src/app/pitch/ public/pitch/
git commit -m "feat(pitch): add route group and minimal layout"
```

---

### Task 2: Base slide component and pitch deck wrapper

**Files:**
- Create: `src/components/pitch/slide.tsx`
- Create: `src/components/pitch/pitch-deck.tsx`
- Create: `src/components/pitch/slide-progress.tsx`

- [ ] **Step 1: Write the base Slide component**

Handles consistent layout, entry animation, and padding for every slide.

```tsx
// src/components/pitch/slide.tsx
"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

interface SlideProps {
  children: ReactNode;
  className?: string;
}

export function Slide({ children, className = "" }: SlideProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`flex min-h-screen w-full flex-col items-center justify-center px-8 py-16 md:px-16 lg:px-24 ${className}`}
    >
      <div className="w-full max-w-4xl">{children}</div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Write the SlideProgress indicator**

Subtle dots at the bottom showing current position.

```tsx
// src/components/pitch/slide-progress.tsx
"use client";

interface SlideProgressProps {
  total: number;
  current: number;
}

export function SlideProgress({ total, current }: SlideProgressProps) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current
              ? "w-6 bg-zinc-900"
              : "w-1.5 bg-zinc-300"
          }`}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write the PitchDeck wrapper with keyboard navigation**

Manages slide index, arrow key navigation, and AnimatePresence for transitions.

```tsx
// src/components/pitch/pitch-deck.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { SlideProgress } from "./slide-progress";

import { CoverSlide } from "./slides/cover";
import { ProblemSlide } from "./slides/problem";
import { WhyNowSlide } from "./slides/why-now";
import { MeetBitbitSlide } from "./slides/meet-bitbit";
import { ConnectionsSlide } from "./slides/connections";
import { MemorySlide } from "./slides/memory";
import { TrustLevelsSlide } from "./slides/trust-levels";
import { TeamSlide } from "./slides/team";
import { TractionSlide } from "./slides/traction";
import { BusinessModelSlide } from "./slides/business-model";
import { MarketSlide } from "./slides/market";
import { CompetitionSlide } from "./slides/competition";
import { NextStepsSlide } from "./slides/next-steps";

const SLIDES = [
  CoverSlide,
  ProblemSlide,
  WhyNowSlide,
  MeetBitbitSlide,
  ConnectionsSlide,
  MemorySlide,
  TrustLevelsSlide,
  TeamSlide,
  TractionSlide,
  BusinessModelSlide,
  MarketSlide,
  CompetitionSlide,
  NextStepsSlide,
];

export function PitchDeck() {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  }, []);

  const prev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const CurrentSlide = SLIDES[index];

  return (
    <div className="relative overflow-hidden" onClick={next}>
      <AnimatePresence mode="wait">
        <CurrentSlide key={index} />
      </AnimatePresence>
      <SlideProgress total={SLIDES.length} current={index} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/pitch/
git commit -m "feat(pitch): add slide wrapper, deck nav, and progress indicator"
```

---

### Task 3: Video clip and stat block components

**Files:**
- Create: `src/components/pitch/video-clip.tsx`
- Create: `src/components/pitch/stat-block.tsx`

- [ ] **Step 1: Write the VideoClip component**

Autoplay, muted, looping MP4 with lazy loading and rounded corners.

```tsx
// src/components/pitch/video-clip.tsx
"use client";

interface VideoClipProps {
  src: string;
  alt: string;
  className?: string;
}

export function VideoClip({ src, alt, className = "" }: VideoClipProps) {
  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      preload="none"
      aria-label={alt}
      className={`rounded-lg border border-zinc-200 shadow-sm ${className}`}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
```

- [ ] **Step 2: Write the StatBlock component**

Reusable stat display for slides 3, 8, 9.

```tsx
// src/components/pitch/stat-block.tsx
interface StatBlockProps {
  value: string;
  label: string;
  source?: string;
}

export function StatBlock({ value, label, source }: StatBlockProps) {
  return (
    <div className="text-center">
      <div className="text-4xl font-semibold tracking-tight text-zinc-900 md:text-5xl">
        {value}
      </div>
      <div className="mt-1 text-sm text-zinc-500">{label}</div>
      {source && (
        <div className="mt-0.5 text-xs text-zinc-400">{source}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pitch/video-clip.tsx src/components/pitch/stat-block.tsx
git commit -m "feat(pitch): add video clip and stat block components"
```

---

### Task 4: Slides 1 through 3 (Cover, Problem, Why Now)

**Files:**
- Create: `src/components/pitch/slides/cover.tsx`
- Create: `src/components/pitch/slides/problem.tsx`
- Create: `src/components/pitch/slides/why-now.tsx`

- [ ] **Step 1: Write the Cover slide**

```tsx
// src/components/pitch/slides/cover.tsx
"use client";

import { Slide } from "../slide";

export function CoverSlide() {
  return (
    <Slide className="items-center justify-center text-center">
      <div className="flex flex-col items-center gap-8">
        <img
          src="/pitch/bitbit-logo.svg"
          alt="BitBit"
          className="h-16 w-auto"
        />
        <h1 className="font-serif text-5xl font-bold tracking-tight text-zinc-900 md:text-7xl">
          Meet your new COO
        </h1>
      </div>
    </Slide>
  );
}
```

- [ ] **Step 2: Write the Problem slide**

```tsx
// src/components/pitch/slides/problem.tsx
"use client";

import { Slide } from "../slide";

const ICONS = [
  { name: "Gmail", color: "bg-red-100 text-red-600" },
  { name: "WhatsApp", color: "bg-green-100 text-green-600" },
  { name: "Xero", color: "bg-blue-100 text-blue-600" },
  { name: "Calendar", color: "bg-amber-100 text-amber-600" },
  { name: "Slack", color: "bg-purple-100 text-purple-600" },
  { name: "CRM", color: "bg-zinc-100 text-zinc-600" },
];

export function ProblemSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        You're doing two jobs
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        You started a business to do work you're good at. Instead you spend half
        your day switching between apps, chasing invoices, and forwarding
        messages to the right person. Every service is its own silo. Nobody
        connects them. Nobody remembers the context. So you do it yourself.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        {ICONS.map((icon) => (
          <div
            key={icon.name}
            className={`rounded-lg px-4 py-2 text-sm font-medium opacity-60 ${icon.color}`}
          >
            {icon.name}
          </div>
        ))}
      </div>
    </Slide>
  );
}
```

- [ ] **Step 3: Write the Why Now slide**

```tsx
// src/components/pitch/slides/why-now.tsx
"use client";

import { Slide } from "../slide";
import { StatBlock } from "../stat-block";

export function WhyNowSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        December 2025 changed everything
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        AI agents crossed a reliability threshold. Claude, GPT, and Gemini all
        shipped models within weeks that can hold complex tasks in memory, reason
        about edge cases, and recover from mistakes. The technology is ready. The
        question is who builds the right product.
      </p>
      <div className="mt-12 grid grid-cols-3 gap-8">
        <StatBlock
          value="57%"
          label="of small businesses now use AI"
          source="US Census BTOS, 2026"
        />
        <StatBlock
          value="80%"
          label="report measurable returns from agents"
          source="Anthropic/Material, 2026"
        />
        <StatBlock
          value="36% to 57%"
          label="adoption growth in 3 years"
          source="US Census BTOS"
        />
      </div>
    </Slide>
  );
}
```

- [ ] **Step 4: Verify slides render**

```bash
cd personal-assistant && npm run dev
```

Navigate to `/pitch`, press arrow keys to advance through slides 1, 2, 3. Verify layout, typography, animations.

- [ ] **Step 5: Commit**

```bash
git add src/components/pitch/slides/cover.tsx src/components/pitch/slides/problem.tsx src/components/pitch/slides/why-now.tsx
git commit -m "feat(pitch): add cover, problem, and why-now slides"
```

---

### Task 5: Slide 4 (Meet BitBit)

**Files:**
- Create: `src/components/pitch/slides/meet-bitbit.tsx`

- [ ] **Step 1: Write the Meet BitBit slide**

```tsx
// src/components/pitch/slides/meet-bitbit.tsx
"use client";

import { Slide } from "../slide";
import { VideoClip } from "../video-clip";

export function MeetBitbitSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        BitBit handles your business while you do your work
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        Every user gets their own BitBit. It reads your messages, manages your
        invoices, triages your communications, follows up with your clients. It
        knows who Dave is, that he owes you money, and that he mentioned Steve's
        project last Tuesday. You can message it from WhatsApp while you're on a
        job site. You can ignore it and let it handle things. It tells you what
        it did, not what it's about to do.
      </p>
      <p className="mt-4 text-xl font-medium text-zinc-900">
        A COO costs $200k a year. BitBit costs $99 a month.
      </p>
      <div className="mt-8">
        <VideoClip
          src="/pitch/videos/chat-demo.mp4"
          alt="BitBit chat interface responding in real time"
          className="w-full max-w-lg"
        />
      </div>
    </Slide>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pitch/slides/meet-bitbit.tsx
git commit -m "feat(pitch): add meet bitbit slide with video clip"
```

---

### Task 6: Slides 5a, 5b, 5c (Connections, Memory, Trust)

**Files:**
- Create: `src/components/pitch/slides/connections.tsx`
- Create: `src/components/pitch/slides/memory.tsx`
- Create: `src/components/pitch/slides/trust-levels.tsx`

- [ ] **Step 1: Write the Connections slide**

```tsx
// src/components/pitch/slides/connections.tsx
"use client";

import { Slide } from "../slide";
import { VideoClip } from "../video-clip";

export function ConnectionsSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        It connects to everything you already use
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        200+ services through one screen. Email, WhatsApp, iMessage, Xero,
        Calendar, Slack, and hundreds more. Click to connect. Native bridges for
        WhatsApp and iMessage mean real two way messaging, not API wrappers.
        Voice notes get transcribed automatically. Say "invoice him" and it knows
        who you mean.
      </p>
      <div className="mt-8">
        <VideoClip
          src="/pitch/videos/connections-grid.mp4"
          alt="BitBit connections grid showing service tiles"
          className="w-full max-w-lg"
        />
      </div>
    </Slide>
  );
}
```

- [ ] **Step 2: Write the Memory slide**

```tsx
// src/components/pitch/slides/memory.tsx
"use client";

import { Slide } from "../slide";

export function MemorySlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        It remembers everything and keeps getting smarter
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        BitBit's Memory Palace stores seven types of business knowledge:
        conversations, decisions, patterns, facts, relationships, pricing
        history, and learned conventions. It scores confidence on everything it
        learns. Memories that aren't confirmed fade over time. Ones that get
        corroborated grow stronger.
      </p>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-600">
        Ask "Why did we stop working with TechCorp?" and it reconstructs the
        full timeline. Ask "What did we charge for the last 3 WordPress builds?"
        and it cross references invoices with contacts. It also watches your
        margins. If it notices scope creep that wasn't invoiced, it tells you
        before doing more work for that client.
      </p>
      <div className="mt-10 grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6">
          <div className="text-sm font-medium text-zinc-400">ChatGPT</div>
          <div className="mt-2 text-zinc-600">Remembers what you said</div>
        </div>
        <div className="rounded-lg border border-zinc-900 bg-white p-6">
          <div className="text-sm font-medium text-zinc-900">BitBit</div>
          <div className="mt-2 text-zinc-600">
            Understands how your business works
          </div>
        </div>
      </div>
    </Slide>
  );
}
```

- [ ] **Step 3: Write the Trust Levels slide**

```tsx
// src/components/pitch/slides/trust-levels.tsx
"use client";

import { Slide } from "../slide";

const LEVELS = [
  {
    name: "Observer",
    description: "Watches and tells you what it sees",
    fill: "w-1/4",
  },
  {
    name: "Co pilot",
    description: "Drafts and you approve",
    fill: "w-1/2",
  },
  {
    name: "Autopilot",
    description: "Acts and reports back",
    fill: "w-3/4",
  },
  {
    name: "Full delegation",
    description: '"Handle Steve for me"',
    fill: "w-full",
  },
];

export function TrustLevelsSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        You choose how much it does
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        Three levels of trust, set per role. You can also delegate specific
        contacts entirely. Say "Handle Steve for me" and BitBit manages all
        communications, invoicing, and follow ups for Steve, then sends you a
        morning summary. Say "Stop" and it stops instantly.
      </p>
      <div className="mt-10 flex flex-col gap-4">
        {LEVELS.map((level) => (
          <div key={level.name} className="flex items-center gap-4">
            <div className="w-32 text-right text-sm font-medium text-zinc-900">
              {level.name}
            </div>
            <div className="h-3 flex-1 rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full bg-zinc-900 transition-all ${level.fill}`}
              />
            </div>
            <div className="w-48 text-sm text-zinc-500">
              {level.description}
            </div>
          </div>
        ))}
      </div>
    </Slide>
  );
}
```

- [ ] **Step 4: Verify slides 5a through 5c render and transition**

```bash
cd personal-assistant && npm run dev
```

Navigate through all slides with arrow keys. Check layout, text, video placeholders (videos won't exist yet, that's expected).

- [ ] **Step 5: Commit**

```bash
git add src/components/pitch/slides/connections.tsx src/components/pitch/slides/memory.tsx src/components/pitch/slides/trust-levels.tsx
git commit -m "feat(pitch): add connections, memory, and trust level slides"
```

---

### Task 7: Slides 6 and 7 (Team, Traction)

**Files:**
- Create: `src/components/pitch/slides/team.tsx`
- Create: `src/components/pitch/slides/traction.tsx`

- [ ] **Step 1: Write the Team slide**

```tsx
// src/components/pitch/slides/team.tsx
"use client";

import { Slide } from "../slide";

export function TeamSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        One who can build it. One who can sell it.
      </h2>
      <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-8">
          <div className="text-lg font-semibold text-zinc-900">Torrin</div>
          <div className="mt-1 text-sm text-zinc-500">Technical founder</div>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600">
            Solo built the full stack. Agent engine with confidence routing
            validated against 65 real and adversarial scenarios with no false
            positives in production. Multi channel bridge architecture with per
            user WhatsApp and iMessage instances. Memory Palace with seven
            knowledge types and confidence decay. 120+ migrations, 2,072 tests,
            10 agent packages.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-8">
          <div className="text-lg font-semibold text-zinc-900">Andy</div>
          <div className="mt-1 text-sm text-zinc-500">
            Operations and distribution
          </div>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600">
            Runs All Webbed Up, a marketing agency in AU. First deployment.
            Agency network across Australia as the distribution channel. Knows
            the customer because he is the customer.
          </p>
        </div>
      </div>
      <p className="mt-8 text-sm text-zinc-500">
        The architecture is documented, tested, and built to hand off. Hiring a
        second engineer is one of the first things funding unlocks.
      </p>
    </Slide>
  );
}
```

- [ ] **Step 2: Write the Traction slide**

```tsx
// src/components/pitch/slides/traction.tsx
"use client";

import { Slide } from "../slide";
import { VideoClip } from "../video-clip";

export function TractionSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        Built for real operations, tested by real work
      </h2>
      <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
        <div className="text-center">
          <div className="text-3xl font-semibold text-zinc-900">10</div>
          <div className="mt-1 text-sm text-zinc-500">agents deployed</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-semibold text-zinc-900">5</div>
          <div className="mt-1 text-sm text-zinc-500">messaging channels</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-semibold text-zinc-900">2,072</div>
          <div className="mt-1 text-sm text-zinc-500">tests passing</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-semibold text-zinc-900">120+</div>
          <div className="mt-1 text-sm text-zinc-500">database migrations</div>
        </div>
      </div>
      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-zinc-600">
        Full agency workflow running at All Webbed Up. Multi channel messaging
        live across WhatsApp, iMessage, SMS, email, and Slack. Waitlist
        collecting signups at bitbit.chat.
      </p>
      <div className="mt-8">
        <VideoClip
          src="/pitch/videos/whatsapp-triage.mp4"
          alt="Real BitBit interaction showing WhatsApp triage"
          className="w-full max-w-lg"
        />
      </div>
    </Slide>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pitch/slides/team.tsx src/components/pitch/slides/traction.tsx
git commit -m "feat(pitch): add team and traction slides"
```

---

### Task 8: Slides 8 and 9 (Business Model, Market)

**Files:**
- Create: `src/components/pitch/slides/business-model.tsx`
- Create: `src/components/pitch/slides/market.tsx`

- [ ] **Step 1: Write the Business Model slide**

```tsx
// src/components/pitch/slides/business-model.tsx
"use client";

import { Slide } from "../slide";

const TIERS = [
  { name: "Trades", agents: "4 agents", price: "$99/mo", width: "w-1/4" },
  { name: "Agency", agents: "10 agents", price: "$499/mo", width: "w-2/3" },
  {
    name: "Enterprise",
    agents: "Tender Hunter",
    price: "$1,000 to $2,000/mo",
    width: "w-full",
  },
];

export function BusinessModelSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        Per agent pricing. Agency network distribution.
      </h2>
      <div className="mt-10 flex flex-col gap-4">
        {TIERS.map((tier) => (
          <div key={tier.name} className="flex items-center gap-4">
            <div className="w-24 text-right text-sm font-medium text-zinc-900">
              {tier.name}
            </div>
            <div className="h-10 flex-1 rounded bg-zinc-50">
              <div
                className={`flex h-full items-center rounded bg-zinc-900 px-4 text-sm text-white ${tier.width}`}
              >
                {tier.agents} / {tier.price}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-zinc-200 p-6">
          <div className="text-sm font-medium text-zinc-400">Gross margin</div>
          <div className="mt-2 text-zinc-600">
            ~70% on agency tier. Compute ~$150/mo vs $499/mo revenue. Living
            Brain v2 targets 90%+ at scale.
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-6">
          <div className="text-sm font-medium text-zinc-400">Distribution</div>
          <div className="mt-2 text-zinc-600">
            Andy's agency network. Agencies sell to agencies. First 10 from
            direct outreach. Every deployment is a reference.
          </div>
        </div>
      </div>
    </Slide>
  );
}
```

- [ ] **Step 2: Write the Market slide**

```tsx
// src/components/pitch/slides/market.tsx
"use client";

import { Slide } from "../slide";
import { StatBlock } from "../stat-block";

export function MarketSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        The market exists and it's paying
      </h2>
      <div className="mt-12 grid grid-cols-3 gap-8">
        <StatBlock
          value="$79.8B"
          label="Global SMB software market, 2026"
          source="Business Research Insights"
        />
        <StatBlock
          value="99%"
          label="of all businesses globally are SMBs"
          source="OECD"
        />
        <StatBlock
          value="7.4%"
          label="CAGR through 2035"
          source="BRI, March 2026"
        />
      </div>
      <div className="mt-10">
        <div className="text-sm font-medium text-zinc-400">
          Others are already proving willingness to pay
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-600">
          <span className="rounded-full border border-zinc-200 px-3 py-1">
            Sintra: 40,000+ users, $39 to $197/mo
          </span>
          <span className="rounded-full border border-zinc-200 px-3 py-1">
            Hynge: 2,374 users, $59 to $149/mo
          </span>
          <span className="rounded-full border border-zinc-200 px-3 py-1">
            Ambiguous: a16z backed
          </span>
          <span className="rounded-full border border-zinc-200 px-3 py-1">
            ai.work: $10M seed
          </span>
          <span className="rounded-full border border-zinc-200 px-3 py-1">
            Maisa: $30M seed
          </span>
        </div>
      </div>
    </Slide>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pitch/slides/business-model.tsx src/components/pitch/slides/market.tsx
git commit -m "feat(pitch): add business model and market slides with sourced data"
```

---

### Task 9: Slides 10 and 11 (Competition, Next Steps)

**Files:**
- Create: `src/components/pitch/slides/competition.tsx`
- Create: `src/components/pitch/slides/next-steps.tsx`
- Create: `src/components/pitch/comparison-table.tsx`

- [ ] **Step 1: Write the ComparisonTable component**

```tsx
// src/components/pitch/comparison-table.tsx
"use client";

interface Row {
  name: string;
  channels: string;
  memory: string;
  invoicing: string;
  autonomy: string;
  price: string;
  highlight?: boolean;
}

const ROWS: Row[] = [
  {
    name: "Zo",
    channels: "SMS, Email, Telegram",
    memory: "Conversational",
    invoicing: "No",
    autonomy: "On/off",
    price: "$18/mo",
  },
  {
    name: "Hynge",
    channels: "Telegram, WhatsApp, Slack",
    memory: "Conversational",
    invoicing: "No",
    autonomy: "Draft only",
    price: "$59 to $149/mo",
  },
  {
    name: "Sintra",
    channels: "Chat only",
    memory: "Brand voice",
    invoicing: "No",
    autonomy: "No",
    price: "$39 to $197/mo",
  },
  {
    name: "Lindy",
    channels: "Email, Slack, Phone",
    memory: "Per agent",
    invoicing: "Via integrations",
    autonomy: "Per agent",
    price: "$20 to $299/mo",
  },
  {
    name: "Ambiguous",
    channels: "Email, Slack",
    memory: "Agentic",
    invoicing: "No",
    autonomy: "No",
    price: "TBD (a16z)",
  },
  {
    name: "BitBit",
    channels: "WhatsApp, iMessage, SMS, Email, Slack",
    memory: "Memory Palace",
    invoicing: "Built in",
    autonomy: "Observer to Autopilot",
    price: "$99 to $499/mo",
    highlight: true,
  },
];

export function ComparisonTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs text-zinc-400">
            <th className="pb-3 pr-4 font-medium" />
            <th className="pb-3 pr-4 font-medium">Channels</th>
            <th className="pb-3 pr-4 font-medium">Memory</th>
            <th className="pb-3 pr-4 font-medium">Invoicing</th>
            <th className="pb-3 pr-4 font-medium">Autonomy</th>
            <th className="pb-3 font-medium">Price</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr
              key={row.name}
              className={`border-b border-zinc-100 ${
                row.highlight
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600"
              }`}
            >
              <td
                className={`py-3 pr-4 font-medium ${
                  row.highlight ? "text-white" : "text-zinc-900"
                }`}
              >
                {row.name}
              </td>
              <td className="py-3 pr-4">{row.channels}</td>
              <td className="py-3 pr-4">{row.memory}</td>
              <td className="py-3 pr-4">{row.invoicing}</td>
              <td className="py-3 pr-4">{row.autonomy}</td>
              <td className="py-3">{row.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write the Competition slide**

```tsx
// src/components/pitch/slides/competition.tsx
"use client";

import { Slide } from "../slide";
import { ComparisonTable } from "../comparison-table";

export function CompetitionSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        Others are building chat interfaces. We built autonomous infrastructure.
      </h2>
      <div className="mt-10">
        <ComparisonTable />
      </div>
      <p className="mt-8 text-center text-xl font-medium text-zinc-900">
        They draft. BitBit does.
      </p>
    </Slide>
  );
}
```

- [ ] **Step 3: Write the Next Steps slide**

```tsx
// src/components/pitch/slides/next-steps.tsx
"use client";

import { Slide } from "../slide";

export function NextStepsSlide() {
  return (
    <Slide className="items-center justify-center text-center">
      <div className="flex flex-col items-center gap-8">
        <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
          What we're looking for
        </h2>
        <div className="max-w-lg text-left">
          <ul className="flex flex-col gap-4 text-lg text-zinc-600">
            <li>First engineering hire to reduce bus factor</li>
            <li>
              Beta program: 5 to 10 agencies from Andy's network
            </li>
            <li>Infrastructure scale: bridge ops and compute</li>
          </ul>
        </div>
        <div className="mt-8">
          <img
            src="/pitch/bitbit-logo.svg"
            alt="BitBit"
            className="h-10 w-auto opacity-30"
          />
        </div>
        <p className="text-sm text-zinc-400">bitbit.chat</p>
      </div>
    </Slide>
  );
}
```

- [ ] **Step 4: Verify full deck navigation**

```bash
cd personal-assistant && npm run dev
```

Navigate through all 13 slides with arrow keys. Verify transitions, layout, table rendering, progress dots.

- [ ] **Step 5: Commit**

```bash
git add src/components/pitch/slides/competition.tsx src/components/pitch/slides/next-steps.tsx src/components/pitch/comparison-table.tsx
git commit -m "feat(pitch): add competition and next steps slides with comparison table"
```

---

### Task 10: Final polish and build verification

**Files:**
- Modify: `src/components/pitch/pitch-deck.tsx` (if any import issues)
- Modify: `src/app/pitch/layout.tsx` (if any font issues)

- [ ] **Step 1: Run production build**

```bash
cd personal-assistant && npm run build
```

Fix any TypeScript errors or build warnings.

- [ ] **Step 2: Test the built version**

```bash
cd personal-assistant && npm run start
```

Open `http://localhost:3000/pitch`. Navigate all 13 slides. Check:
- All slide transitions work
- Progress dots update correctly
- Keyboard nav (arrow keys, spacebar) works
- Click to advance works
- Video placeholders don't break layout (videos not yet recorded)
- Typography renders correctly (Libre Baskerville for headings, Geist Mono for stats)
- Light theme is consistent throughout

- [ ] **Step 3: Commit final state**

```bash
git add -A
git commit -m "feat(pitch): complete 13 slide investor pitch deck"
```

---

## Post implementation

After all tasks are complete:

1. **Record video clips** and place in `public/pitch/videos/`
2. **Export or screenshot** the BitBit monochrome logo to `public/pitch/bitbit-logo.svg`
3. **Deploy** via standard Vercel pipeline (push to main)
4. **Founders** fill in slide 11 specifics (raise amount, milestone)
5. **Test on the actual device** that will be used in the meeting
