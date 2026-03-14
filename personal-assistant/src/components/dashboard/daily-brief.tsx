'use client';

import { useState, useEffect } from 'react';
import { Sparkles, ListTodo, Mail, DollarSign, Calendar, X } from 'lucide-react';
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

const CHIP_ICONS: Record<GlanceChip['icon'], typeof ListTodo> = {
  'list-todo': ListTodo,
  mail: Mail,
  'dollar-sign': DollarSign,
  calendar: Calendar,
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
          detail: 'Plan my day. Look at my tasks, messages, and calendar to suggest what I should focus on today.',
        })
      );
    }, 300);
  }

  const stripStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    padding: '10px 16px',
    borderRadius: 12,
    background: 'var(--glass-card-bg)',
    backdropFilter: 'var(--glass-card-blur)',
    WebkitBackdropFilter: 'var(--glass-card-blur)',
    border: '1px solid var(--glass-card-border)',
    boxShadow: 'var(--card-inset)',
    borderLeft: '3px solid transparent',
    borderImage: 'linear-gradient(to bottom, #a78bfa, #3b82f6) 1',
  };

  const chipStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 99,
    background: 'var(--glass-card-bg-light)',
    border: '1px solid var(--glass-interactive-border)',
    fontSize: 12,
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
  };

  if (loading) {
    return (
      <div style={stripStyle}>
        <Sparkles size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          Preparing your brief...
        </span>
        <div
          style={{
            width: 80,
            height: 8,
            background: 'var(--glass-hover-bg)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '40%',
              height: '100%',
              background: 'linear-gradient(90deg, #a78bfa, #3b82f6)',
              borderRadius: 4,
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    );
  }

  if (!brief) return null;

  const chips = brief.glanceChips;

  return (
    <div style={stripStyle}>
      <Sparkles size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
        Good morning
      </span>

      {chips && chips.length > 0 ? (
        <>
          <span style={{ width: 1, height: 16, background: 'var(--hover-bg-strong)', flexShrink: 0 }} />
          {chips.map((chip, i) => {
            const Icon = CHIP_ICONS[chip.icon] || ListTodo;
            return (
              <span key={i} style={chipStyle}>
                <Icon size={12} style={{ color: chip.accent || 'var(--text-secondary)', flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatChipValue(chip)}
                </span>
                {chip.label}
              </span>
            );
          })}
        </>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
          {brief.summary}
        </span>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <button
          onClick={handlePlanMyDay}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 12px',
            borderRadius: 8,
            border: '1px solid rgba(167, 139, 250, 0.3)',
            background: 'rgba(167, 139, 250, 0.1)',
            color: 'var(--bb-purple)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(167, 139, 250, 0.2)';
            e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(167, 139, 250, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.3)';
          }}
        >
          <Sparkles size={11} />
          Plan my day
        </button>
        <button
          onClick={handleDismiss}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'var(--glass-hover-bg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-dim)';
            e.currentTarget.style.background = 'transparent';
          }}
          aria-label="Dismiss daily brief"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
