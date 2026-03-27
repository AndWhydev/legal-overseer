'use client';

import { useState, useEffect } from 'react';
import { IconSparkles, IconListCheck, IconMail, IconCurrencyDollar, IconCalendar, IconX } from '@tabler/icons-react';
import { useSeedData } from '@/hooks/use-seed-data';

interface GlanceChip {
  icon: 'list-todo' | 'mail' | 'dollar-sign' | 'calendar';
  value: number;
  label: string;
  accent?: string;
}

interface BriefData {
  summary: string;
  glanceChips?: GlanceChip[];
  sections: Array<{ title: string; items: string[] }>;
  generatedAt: string;
}

const DISMISS_KEY = 'bb-daily-brief-dismissed';

function isDismissedToday(): boolean {
  if (typeof window === 'undefined') return false;
  const val = localStorage.getItem(DISMISS_KEY);
  if (!val) return false;
  return val === new Date().toISOString().split('T')[0];
}

const CHIP_ICONS: Record<GlanceChip['icon'], typeof IconListCheck> = {
  'list-todo': IconListCheck,
  mail: IconMail,
  'dollar-sign': IconCurrencyDollar,
  calendar: IconCalendar,
};

function formatChipValue(chip: GlanceChip): string {
  if (chip.icon === 'dollar-sign' && chip.value >= 1000) {
    return `$${(chip.value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(chip.value);
}

export function DailyBrief() {
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const seed = useSeedData();

  useEffect(() => {
    setDismissed(isDismissedToday());
  }, []);

  useEffect(() => {
    if (seed.active && seed.data?.dailyBrief) {
      setBrief(seed.data.dailyBrief as BriefData);
      setLoading(false);
      return;
    }

    fetch('/api/agent/daily-brief')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setBrief(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [seed.active, seed.data]);

  if (dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString().split('T')[0]);
    setDismissed(true);
  }

  function handlePlanMyDay() {
    window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'chat' } }));
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('bitbit-chat-send', {
          detail: 'Plan our day. Look at tasks, messages, and calendar to figure out what to focus on today.',
        })
      );
    }, 300);
  }

  if (loading) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border-l-[3px] border-l-violet-400 bg-card px-4 py-3 shadow-sm">
        <IconSparkles size={14} className="shrink-0 text-violet-400" />
        <span className="text-sm italic text-muted-foreground">
          Pulling things together...
        </span>
        <div className="h-2 w-20 overflow-hidden rounded bg-muted">
          <div className="h-full w-2/5 animate-pulse rounded bg-gradient-to-r from-violet-400 to-blue-500" />
        </div>
      </div>
    );
  }

  if (!brief) return null;

  const chips = brief.glanceChips;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border-l-[3px] border-l-violet-400 bg-card px-4 py-3 shadow-sm">
      <IconSparkles size={14} className="shrink-0 text-violet-400" />
      <span className="whitespace-nowrap text-sm font-medium text-foreground">
        Good morning
      </span>

      {chips && chips.length > 0 ? (
        <>
          <span className="h-4 w-px shrink-0 bg-border" />
          {chips.map((chip, i) => {
            const Icon = CHIP_ICONS[chip.icon] || IconListCheck;
            return (
              <span key={i} className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-muted/50 px-3 py-1 text-sm text-muted-foreground">
                <Icon size={12} className="shrink-0" style={{ color: chip.accent || undefined }} />
                <span className="font-mono font-medium text-foreground">
                  {formatChipValue(chip)}
                </span>
                {chip.label}
              </span>
            );
          })}
        </>
      ) : (
        <span className="flex-1 text-sm text-muted-foreground">
          {brief.summary}
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          onClick={handlePlanMyDay}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-sm font-medium text-violet-400 transition-colors hover:border-violet-400/50 hover:bg-violet-400/20"
        >
          <IconSparkles size={11} />
          Plan our day
        </button>
        <button
          onClick={handleDismiss}
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss daily brief"
        >
          <IconX size={14} />
        </button>
      </div>
    </div>
  );
}
