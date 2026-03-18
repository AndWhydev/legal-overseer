'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Clock } from 'lucide-react';
import { logger } from '@/lib/core/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  events: {
    new_message: boolean;
    task_assigned: boolean;
    task_due: boolean;
    invoice_paid: boolean;
    agent_action: boolean;
    weekly_digest: boolean;
  };
  channels: {
    email: boolean;
    in_app: boolean;
    push: boolean;
  };
  quiet_hours: {
    enabled: boolean;
    start_time: string;
    end_time: string;
  };
  digest_mode: 'immediate' | 'daily' | 'weekly';
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  { id: 'new_message', label: 'New Messages', desc: 'Get notified about new incoming messages' },
  { id: 'task_assigned', label: 'Task Assigned', desc: 'When a task is assigned to you' },
  { id: 'task_due', label: 'Task Due Soon', desc: 'Reminders for upcoming deadlines' },
  { id: 'invoice_paid', label: 'Invoice Paid', desc: 'When invoices are marked as paid' },
  { id: 'agent_action', label: 'Agent Actions', desc: 'When agents take actions on your behalf' },
  { id: 'weekly_digest', label: 'Weekly Digest', desc: 'Summarized weekly activity report' },
] as const;

const CHANNELS = [
  { id: 'email' as const, label: 'Email', desc: 'Receive notifications via email', disabled: false },
  { id: 'in_app' as const, label: 'In-App', desc: 'Receive notifications in the app', disabled: false },
  { id: 'push' as const, label: 'Push', desc: 'Receive push notifications (coming soon)', disabled: true },
];

const DIGEST_MODES = [
  { id: 'immediate', label: 'Immediate', desc: 'Get notifications right away' },
  { id: 'daily', label: 'Daily', desc: 'Receive one digest each day' },
  { id: 'weekly', label: 'Weekly', desc: 'Receive one digest each week' },
] as const;

// ─── Inline Styles ───────────────────────────────────────────────────────────

const sectionWrapper: React.CSSProperties = {
  padding: '24px',
  overflow: 'auto',
  height: '100%',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  margin: 0,
};

const sectionDesc: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary, #94A3B8)',
  margin: '4px 0 16px',
};

const glassCard: React.CSSProperties = {
  padding: '16px',
  borderRadius: 12,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
};

const listRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'rgba(10, 14, 23, 0.5)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  transition: 'background 200ms',
};

const toggleContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
};

// ─── Toggle Component ────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        position: 'relative',
        display: 'inline-flex',
        height: 24,
        width: 44,
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 12,
        transition: 'background-color 200ms ease',
        border: 'none',
        background: checked && !disabled ? '#22C55E' : 'rgba(255, 255, 255, 0.1)',
        outline: 'none',
        opacity: disabled ? 0.5 : 1,
      }}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onFocus={e => {
        if (!disabled) {
          e.currentTarget.style.boxShadow = checked ? '0 0 0 2px rgba(34, 197, 94, 0.3)' : '0 0 0 2px rgba(255, 255, 255, 0.1)';
        }
      }}
      onBlur={e => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <span
        style={{
          pointerEvents: 'none',
          display: 'inline-block',
          height: 20,
          width: 20,
          borderRadius: 9999,
          background: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
          transition: 'transform 200ms ease',
          transform: checked ? 'translateX(20px)' : 'translateX(2px)',
          marginTop: 2,
        }}
      />
    </button>
  );
}

// ─── Save Indicator ──────────────────────────────────────────────────────────

function SaveIndicator({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 80,
        right: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderRadius: 8,
        background: 'rgba(34, 197, 94, 0.12)',
        color: '#22C55E',
        fontSize: 14,
        fontWeight: 500,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-8px)',
        transition: 'opacity 300ms, transform 300ms',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <Check size={14} />
      Saved
    </div>
  );
}

// ─── Time Input Component ────────────────────────────────────────────────────

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(13, 17, 23, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: 'var(--text-primary, #F1F5F9)',
        fontSize: 14,
        cursor: 'pointer',
        transition: 'border-color 200ms',
      }}
      onFocus={e => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      }}
      onBlur={e => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      }}
    />
  );
}

// ─── Notification Preferences Component ──────────────────────────────────────

export function NotificationPreferencesTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    events: {
      new_message: true,
      task_assigned: true,
      task_due: true,
      invoice_paid: true,
      agent_action: true,
      weekly_digest: false,
    },
    channels: {
      email: true,
      in_app: true,
      push: false,
    },
    quiet_hours: {
      enabled: false,
      start_time: '22:00',
      end_time: '08:00',
    },
    digest_mode: 'immediate',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [saveIndicatorVisible, setSaveIndicatorVisible] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load preferences from API
  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/settings/notifications');
        if (!res.ok) throw new Error('Failed to fetch preferences');
        const data = await res.json() as { preferences: NotificationPreferences };
        setPrefs(data.preferences);
      } catch (err) {
        logger.error('Failed to load notification preferences:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, []);

  // Auto-save preferences
  const autoSave = useCallback((newPrefs: NotificationPreferences) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings/notifications', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPrefs),
        });
        if (!res.ok) throw new Error('Failed to save preferences');
        setSaveIndicatorVisible(true);
        setTimeout(() => setSaveIndicatorVisible(false), 1500);
      } catch (err) {
        logger.error('Auto-save failed:', err);
      }
    }, 600);
  }, []);

  const updateEvent = (eventId: keyof typeof prefs.events, value: boolean) => {
    const newPrefs = {
      ...prefs,
      events: { ...prefs.events, [eventId]: value },
    };
    setPrefs(newPrefs);
    autoSave(newPrefs);
  };

  const updateChannel = (channelId: keyof typeof prefs.channels, value: boolean) => {
    const newPrefs = {
      ...prefs,
      channels: { ...prefs.channels, [channelId]: value },
    };
    setPrefs(newPrefs);
    autoSave(newPrefs);
  };

  const updateQuietHours = (field: keyof typeof prefs.quiet_hours, value: unknown) => {
    const newPrefs = {
      ...prefs,
      quiet_hours: { ...prefs.quiet_hours, [field]: value },
    };
    setPrefs(newPrefs);
    autoSave(newPrefs);
  };

  const updateDigestMode = (mode: typeof prefs.digest_mode) => {
    const newPrefs = { ...prefs, digest_mode: mode };
    setPrefs(newPrefs);
    autoSave(newPrefs);
  };

  if (isLoading) {
    return (
      <div style={sectionWrapper}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-secondary, #94A3B8)' }}>
            <div style={{ fontSize: 14 }}>Loading preferences...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={sectionWrapper}>
      <SaveIndicator visible={saveIndicatorVisible} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Event Types */}
        <div>
          <h3 style={sectionTitle}>Event Notifications</h3>
          <p style={sectionDesc}>Choose which events trigger notifications</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {EVENT_TYPES.map(event => (
              <div key={event.id} style={{ ...listRow, justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: 0 }}>
                    {event.label}
                  </p>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: '2px 0 0' }}>
                    {event.desc}
                  </p>
                </div>
                <Toggle
                  checked={prefs.events[event.id as keyof typeof prefs.events]}
                  onChange={v => updateEvent(event.id as keyof typeof prefs.events, v)}
                  label={event.label}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Channels */}
        <div>
          <h3 style={sectionTitle}>Delivery Channels</h3>
          <p style={sectionDesc}>Where you want to receive notifications</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CHANNELS.map(channel => (
              <div key={channel.id} style={{ ...listRow, justifyContent: 'space-between', opacity: channel.disabled ? 0.5 : 1 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: 0 }}>
                    {channel.label}
                  </p>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: '2px 0 0' }}>
                    {channel.desc}
                  </p>
                </div>
                <Toggle
                  checked={prefs.channels[channel.id as keyof typeof prefs.channels]}
                  onChange={v => updateChannel(channel.id as keyof typeof prefs.channels, v)}
                  label={channel.label}
                  disabled={channel.disabled}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Digest Mode */}
        <div>
          <h3 style={sectionTitle}>Notification Batching</h3>
          <p style={sectionDesc}>Control how often you receive notification batches</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {DIGEST_MODES.map(mode => (
              <button
                key={mode.id}
                onClick={() => updateDigestMode(mode.id as typeof prefs.digest_mode)}
                style={{
                  ...glassCard,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  border: prefs.digest_mode === mode.id ? '2px solid #FF5A1F' : '1px solid rgba(255, 255, 255, 0.03)',
                  transition: 'all 200ms',
                }}
                onMouseEnter={e => {
                  if (prefs.digest_mode !== mode.id) {
                    e.currentTarget.style.background = 'rgba(15, 20, 30, 0.8)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  }
                }}
                onMouseLeave={e => {
                  if (prefs.digest_mode !== mode.id) {
                    e.currentTarget.style.background = 'rgba(15, 20, 30, 0.6)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.03)';
                  }
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: 0 }}>
                  {mode.label}
                </p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: '4px 0 0' }}>
                  {mode.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Quiet Hours */}
        <div>
          <h3 style={sectionTitle}>Quiet Hours</h3>
          <p style={sectionDesc}>Pause notifications during specific times</p>
          <div style={{ ...glassCard, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={toggleContainer}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: 0 }}>
                  Enable Quiet Hours
                </p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: '2px 0 0' }}>
                  Notifications will be silenced during this time
                </p>
              </div>
              <Toggle
                checked={prefs.quiet_hours.enabled}
                onChange={v => updateQuietHours('enabled', v)}
                label="Enable Quiet Hours"
              />
            </div>

            {prefs.quiet_hours.enabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', display: 'block', marginBottom: 4 }}>
                      From
                    </label>
                    <TimeInput value={prefs.quiet_hours.start_time} onChange={v => updateQuietHours('start_time', v)} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', display: 'block', marginBottom: 4 }}>
                      To
                    </label>
                    <TimeInput value={prefs.quiet_hours.end_time} onChange={v => updateQuietHours('end_time', v)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
