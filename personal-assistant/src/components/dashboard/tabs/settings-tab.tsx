'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { IntegrationGrid } from '@/components/integrations/integration-grid';
import { Sun, Moon, Plus, Trash2, Save, Loader2, Smartphone, LayoutGrid, Maximize2 } from 'lucide-react';
import { QrAuthConnect } from '@/components/ui/qr-auth-connect';
import { createClient } from '@/lib/supabase/client';
import { TabShell } from '@/components/ui/tab-shell';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/core/logger';

// ─── Agent types ─────────────────────────────────────────────────────────────

const AGENT_TYPES = [
  { id: 'lead_swarm', label: 'Lead Swarm', description: 'Automated lead generation and scoring' },
  { id: 'invoice_flow', label: 'Invoice Flow', description: 'Invoice creation and follow-up' },
  { id: 'sentry', label: 'Sentry', description: 'Security monitoring and alerting' },
  { id: 'channel_triage', label: 'Channel Triage', description: 'Cross-channel message classification' },
  { id: 'client_comms', label: 'Client Comms', description: 'AI-drafted client communications' },
  { id: 'proposal_bot', label: 'Proposal Bot', description: 'Scope generation and pricing' },
  { id: 'client_onboarding', label: 'Client Onboarding', description: 'Automated onboarding workflows' },
  { id: 'ad_scripts', label: 'Ad Script Generator', description: 'Creative ad copy and storyboards' },
  { id: 'ai_search', label: 'AI Search Optimizer', description: 'Visibility audits and SEO content' },
  { id: 'tender_hunter', label: 'Tender Hunter', description: 'Government tender discovery and response' },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface VoiceProfile {
  id?: string;
  name: string;
  tone: string;
  style: string;
  example_phrases: string[];
}

interface OrgSettings {
  daily_cost_limit: number;
  monthly_cost_limit: number;
  enabled_agents: string[];
  approval_threshold_auto: number;
  approval_threshold_queue: number;
  escalation_email: string;
}

interface UserProfile {
  display_name: string;
  email: string;
  organization: string;
}

// ─── Inline Styles ───────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  padding: '20px',
  borderRadius: 16,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
};

const glassInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  background: 'rgba(13, 17, 23, 0.6)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 200ms, box-shadow 200ms',
};

const glassInputFocus: React.CSSProperties = {
  ...glassInput,
  borderColor: 'rgba(255, 255, 255, 0.2)',
  boxShadow: '0 0 0 2px rgba(255, 90, 31, 0.15)',
};

const pillBtn: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 20,
  background: 'rgba(10, 14, 23, 0.42)',
  backdropFilter: 'blur(22px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  border: 'none',
  fontSize: 12,
  color: 'var(--text-secondary, #94A3B8)',
  cursor: 'pointer',
  transition: 'all 200ms',
};

const pillBtnActive: React.CSSProperties = {
  ...pillBtn,
  color: 'var(--text-primary)',
  background: 'rgba(255, 90, 31, 0.15)',
};

const accentBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 10,
  background: '#FF5A1F',
  border: 'none',
  color: '#000',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 200ms',
};

const ghostBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 10,
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
};

const listRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 18px',
  borderRadius: 12,
  background: 'rgba(10, 14, 23, 0.5)',
  backdropFilter: 'blur(26px) saturate(1.15)',
  WebkitBackdropFilter: 'blur(26px) saturate(1.15)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  border: 'none',
  transition: 'background 200ms',
};

const badge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'var(--text-secondary, #94A3B8)',
};

const sectionHeader: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim, #475569)',
  marginBottom: 12,
};

const cardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-primary, #F1F5F9)',
  marginBottom: 4,
};

const cardDescription: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary, #94A3B8)',
  marginBottom: 16,
};

// ─── Toggle Switch ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        height: 24,
        width: 44,
        flexShrink: 0,
        cursor: 'pointer',
        borderRadius: 9999,
        transition: 'background-color 200ms',
        border: 'none',
        background: checked ? 'var(--bb-orange, #FF5A1F)' : 'rgba(255,255,255,0.12)',
      }}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span
        style={{
          pointerEvents: 'none',
          display: 'inline-block',
          height: 20,
          width: 20,
          borderRadius: 9999,
          background: 'white',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          transition: 'transform 200ms',
          transform: checked ? 'translateX(20px)' : 'translateX(2px)',
          marginTop: 2,
        }}
      />
    </button>
  );
}

// ─── Agent Toggles Section ───────────────────────────────────────────────────

function AgentTogglesSection({ enabledAgents, onToggle }: { enabledAgents: string[]; onToggle: (id: string) => void }) {
  return (
    <div style={glassCard}>
      <h3 style={cardTitle}>Agent Toggles</h3>
      <p style={cardDescription}>Enable or disable agents for your organization.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {AGENT_TYPES.map(agent => (
          <div key={agent.id} style={{ ...listRow, justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>{agent.label}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary, #94A3B8)' }}>{agent.description}</p>
            </div>
            <Toggle
              checked={enabledAgents.includes(agent.id)}
              onChange={() => onToggle(agent.id)}
              label={`Toggle ${agent.label}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cost Limits Section ─────────────────────────────────────────────────────

function CostLimitsSection({
  dailyLimit, monthlyLimit, onDailyChange, onMonthlyChange,
}: { dailyLimit: number; monthlyLimit: number; onDailyChange: (v: number) => void; onMonthlyChange: (v: number) => void }) {
  const [dailyFocus, setDailyFocus] = useState(false);
  const [monthlyFocus, setMonthlyFocus] = useState(false);

  return (
    <div style={glassCard}>
      <h3 style={cardTitle}>Cost Limits</h3>
      <p style={cardDescription}>Set spending limits for AI operations.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary, #94A3B8)' }}>
            Daily Cost Limit (USD)
          </label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={dailyLimit}
            onChange={e => onDailyChange(parseFloat(e.target.value) || 0)}
            onFocus={() => setDailyFocus(true)}
            onBlur={() => setDailyFocus(false)}
            style={dailyFocus ? glassInputFocus : glassInput}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary, #94A3B8)' }}>
            Monthly Cost Limit (USD)
          </label>
          <input
            type="number"
            min={0}
            step={5}
            value={monthlyLimit}
            onChange={e => onMonthlyChange(parseFloat(e.target.value) || 0)}
            onFocus={() => setMonthlyFocus(true)}
            onBlur={() => setMonthlyFocus(false)}
            style={monthlyFocus ? glassInputFocus : glassInput}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Channel Config Section ──────────────────────────────────────────────────

const CHANNELS = [
  { id: 'outlook', label: 'Outlook', keyField: 'client_id' },
  { id: 'asana', label: 'Asana', keyField: 'access_token' },
  { id: 'calendly', label: 'Calendly', keyField: 'api_key' },
  { id: 'stripe', label: 'Stripe', keyField: 'api_key' },
  { id: 'whatsapp', label: 'WhatsApp', keyField: 'phone_number_id' },
] as const;

// ─── WhatsApp Connect Card ──────────────────────────────────────────────────

function WhatsAppConnectCard() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  useEffect(() => {
    const client = createClient();
    if (!client) return;
    setSupabase(client);

    // Check for existing connected session
    (async () => {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      const { data: profile } = await client.from('profiles').select('org_id').eq('id', user.id).single();
      if (!profile?.org_id) return;

      const { data: session } = await client
        .from('whatsapp_sessions')
        .select('id, status, phone_number')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (session?.status === 'connected') {
        setConnected(true);
        setConnectedPhone(session.phone_number);
      } else if (session?.status === 'qr_pending') {
        setSessionId(session.id);
      }
    })();
  }, []);

  const handleConnect = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
      if (!profile?.org_id) return;

      const { data: session, error } = await supabase
        .from('whatsapp_sessions')
        .insert({ org_id: profile.org_id, status: 'qr_pending' })
        .select('id')
        .single();

      if (error || !session) {
        logger.error('Failed to create WhatsApp session:', error?.message);
        return;
      }

      setSessionId(session.id);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!supabase || !sessionId) return;
    await supabase
      .from('whatsapp_sessions')
      .update({ status: 'disconnected' })
      .eq('id', sessionId);
    setSessionId(null);
    setConnected(false);
    setConnectedPhone(null);
  };

  return (
    <div style={glassCard}>
      <h3 style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Smartphone size={16} />
        WhatsApp (Baileys Bridge)
      </h3>
      <p style={cardDescription}>
        Connect your WhatsApp account via QR code. Messages are sent through a local bridge worker.
      </p>
      {connected ? (
        <div style={{ ...listRow, justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>Connected</p>
            {connectedPhone && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary, #94A3B8)', fontFamily: 'monospace' }}>{connectedPhone}</p>
            )}
          </div>
          <button
            onClick={handleDisconnect}
            style={{
              ...ghostBtn,
              borderColor: 'rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
            }}
          >
            Disconnect
          </button>
        </div>
      ) : sessionId ? (
        <QrAuthConnect
          sessionId={sessionId}
          serviceName="WhatsApp"
          onConnected={(phone) => {
            setConnected(true);
            setConnectedPhone(phone);
          }}
        />
      ) : (
        <button
          onClick={handleConnect}
          disabled={loading}
          style={{
            ...accentBtn,
            opacity: loading ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Smartphone size={14} />}
          Connect WhatsApp
        </button>
      )}
    </div>
  );
}

function ChannelConfigSection() {
  const [channels, setChannels] = useState<Record<string, { active: boolean; connected: boolean; maskedKey: string }>>({});

  useEffect(() => {
    // Initialize with defaults
    const initial: typeof channels = {};
    CHANNELS.forEach(ch => {
      initial[ch.id] = { active: false, connected: false, maskedKey: '' };
    });
    setChannels(initial);

    // Fetch actual status
    fetch('/api/channels/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.channels) return;
        const updated = { ...initial };
        for (const ch of data.channels) {
          if (updated[ch.provider]) {
            updated[ch.provider] = {
              active: ch.active ?? false,
              connected: ch.connected ?? false,
              maskedKey: ch.masked_key ?? '',
            };
          }
        }
        setChannels(updated);
      })
      .catch(() => { /* silent */ });
  }, []);

  return (
    <div style={glassCard}>
      <h3 style={cardTitle}>Channel Configuration</h3>
      <p style={cardDescription}>Manage connected channels and API keys.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {CHANNELS.map(ch => {
          const state = channels[ch.id];
          return (
            <div key={ch.id} style={{ ...listRow, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>{ch.label}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary, #94A3B8)', fontFamily: 'monospace' }}>
                    {state?.maskedKey || 'Not configured'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    ...badge,
                    background: state?.connected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                    color: state?.connected ? '#22c55e' : 'var(--text-secondary, #94A3B8)',
                  }}
                >
                  {state?.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Voice Profile Editor ────────────────────────────────────────────────────

function VoiceProfileEditor({ supabase }: { supabase: SupabaseClient | null }) {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [editing, setEditing] = useState<VoiceProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [inputFocus, setInputFocus] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('voice_profiles').select('*').order('name');
    if (data) setProfiles(data);
  }, [supabase]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handleSave = async () => {
    if (!supabase || !editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        await supabase.from('voice_profiles').update({
          name: editing.name,
          tone: editing.tone,
          style: editing.style,
          example_phrases: editing.example_phrases,
        }).eq('id', editing.id);
      } else {
        await supabase.from('voice_profiles').insert({
          name: editing.name,
          tone: editing.tone,
          style: editing.style,
          example_phrases: editing.example_phrases,
        });
      }
      setEditing(null);
      await fetchProfiles();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    await supabase.from('voice_profiles').delete().eq('id', id);
    await fetchProfiles();
  };

  return (
    <div style={glassCard}>
      <h3 style={cardTitle}>Voice Profiles</h3>
      <p style={cardDescription}>Define communication tone and style per client.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {profiles.map(p => (
          <div key={p.id} style={{ ...listRow, justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>{p.name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary, #94A3B8)' }}>{p.tone} / {p.style}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setEditing({ ...p })}
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary, #94A3B8)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'color 200ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary, #F1F5F9)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary, #94A3B8)')}
              >
                Edit
              </button>
              <button
                onClick={() => p.id && handleDelete(p.id)}
                style={{
                  fontSize: 12,
                  color: '#ef4444',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'color 200ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#ef4444')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {editing ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(10, 14, 23, 0.3)',
            padding: 16,
          }}>
            <input
              placeholder="Profile name"
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              onFocus={() => setInputFocus('name')}
              onBlur={() => setInputFocus(null)}
              style={inputFocus === 'name' ? glassInputFocus : glassInput}
            />
            <input
              placeholder="Tone (e.g. professional, friendly)"
              value={editing.tone}
              onChange={e => setEditing({ ...editing, tone: e.target.value })}
              onFocus={() => setInputFocus('tone')}
              onBlur={() => setInputFocus(null)}
              style={inputFocus === 'tone' ? glassInputFocus : glassInput}
            />
            <input
              placeholder="Style (e.g. concise, detailed)"
              value={editing.style}
              onChange={e => setEditing({ ...editing, style: e.target.value })}
              onFocus={() => setInputFocus('style')}
              onBlur={() => setInputFocus(null)}
              style={inputFocus === 'style' ? glassInputFocus : glassInput}
            />
            <input
              placeholder="Example phrases (comma-separated)"
              value={editing.example_phrases.join(', ')}
              onChange={e => setEditing({ ...editing, example_phrases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              onFocus={() => setInputFocus('phrases')}
              onBlur={() => setInputFocus(null)}
              style={inputFocus === 'phrases' ? glassInputFocus : glassInput}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  ...accentBtn,
                  opacity: saving ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {saving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                Save
              </button>
              <button
                onClick={() => setEditing(null)}
                style={ghostBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing({ name: '', tone: '', style: '', example_phrases: [] })}
            style={{
              ...ghostBtn,
              borderStyle: 'dashed',
              alignSelf: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Plus size={12} /> Add Profile
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Policy Pack Editor ──────────────────────────────────────────────────────

function PolicyPackEditor({
  settings, onChange,
}: { settings: OrgSettings; onChange: (s: Partial<OrgSettings>) => void }) {
  const [inputFocus, setInputFocus] = useState<string | null>(null);

  return (
    <div style={glassCard}>
      <h3 style={cardTitle}>Approval Policy</h3>
      <p style={cardDescription}>Configure approval thresholds and escalation rules.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary, #94A3B8)' }}>
            Auto-approve threshold (confidence above this = auto-act)
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={settings.approval_threshold_auto}
            onChange={e => onChange({ approval_threshold_auto: parseFloat(e.target.value) || 0.85 })}
            onFocus={() => setInputFocus('auto')}
            onBlur={() => setInputFocus(null)}
            style={inputFocus === 'auto' ? glassInputFocus : glassInput}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary, #94A3B8)' }}>
            Queue threshold (below this = escalate immediately)
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={settings.approval_threshold_queue}
            onChange={e => onChange({ approval_threshold_queue: parseFloat(e.target.value) || 0.55 })}
            onFocus={() => setInputFocus('queue')}
            onBlur={() => setInputFocus(null)}
            style={inputFocus === 'queue' ? glassInputFocus : glassInput}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary, #94A3B8)' }}>Escalation Email</label>
          <input
            type="email"
            placeholder="escalation@company.com"
            value={settings.escalation_email}
            onChange={e => onChange({ escalation_email: e.target.value })}
            onFocus={() => setInputFocus('email')}
            onBlur={() => setInputFocus(null)}
            style={inputFocus === 'email' ? glassInputFocus : glassInput}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Layout Section ─────────────────────────────────────────────────

function DashboardLayoutSection({ supabase }: { supabase: SupabaseClient | null }) {
  const [currentProfile, setCurrentProfile] = useState<string>('full');
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('member');
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('org_id, role').eq('id', user.id).single();
      if (!profile?.org_id) return;
      setUserRole(profile.role ?? 'member');
      const { data: org } = await supabase.from('organisations').select('ui_profile').eq('id', profile.org_id).single();
      setCurrentProfile((org?.ui_profile as string) ?? 'full');
      setLoading(false);
    })();
  }, [supabase]);

  const handleSelect = async (profile: string) => {
    if (!supabase || profile === currentProfile) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
    if (!prof?.org_id) return;

    await supabase.from('organisations').update({ ui_profile: profile }).eq('id', prof.org_id);
    window.location.reload();
  };

  const isAdmin = userRole === 'owner' || userRole === 'admin';

  if (loading) return null;
  if (!isAdmin) return null;

  const profiles = [
    {
      id: 'essential',
      label: 'Essential',
      description: 'Streamlined: Home, Inbox, Approvals, Contacts',
      icon: LayoutGrid,
    },
    {
      id: 'full',
      label: 'Full',
      description: 'All tabs for power users',
      icon: Maximize2,
    },
  ];

  return (
    <div style={glassCard}>
      <h3 style={cardTitle}>Dashboard Layout</h3>
      <p style={cardDescription}>Choose which tabs appear in the sidebar for your organization.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {profiles.map(p => {
          const active = p.id === currentProfile;
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
              onMouseEnter={() => setHovered(p.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 8,
                borderRadius: 12,
                padding: 16,
                textAlign: 'left',
                transition: 'all 200ms',
                border: '1px solid ' + (active ? '#FF5A1F' : 'rgba(255, 255, 255, 0.06)'),
                background: active ? 'rgba(255, 90, 31, 0.08)' : (hovered === p.id ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.03)'),
                cursor: 'pointer',
              }}
            >
              <Icon size={20} style={{ color: active ? '#FF5A1F' : 'var(--text-secondary, #94A3B8)' }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>{p.label}</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary, #94A3B8)' }}>{p.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Settings Tab ───────────────────────────────────────────────────────

function SettingsTab() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [saving, setSaving] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeSection, setActiveSection] = useState<string>('agents');
  const [inputFocus, setInputFocus] = useState<string | null>(null);
  const [preferencesHovered, setPreferencesHovered] = useState<string | null>(null);
  const [settings, setSettings] = useState<OrgSettings>({
    daily_cost_limit: 10,
    monthly_cost_limit: 200,
    enabled_agents: AGENT_TYPES.map(a => a.id),
    approval_threshold_auto: 0.85,
    approval_threshold_queue: 0.55,
    escalation_email: '',
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('bitbit-theme') as 'dark' | 'light' | null;
      if (saved) setTheme(saved);
      else setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark');
    } catch {
      // ignore
    }
    const client = createClient();
    if (client) setSupabase(client);
  }, []);

  // Load user profile and org settings
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load user profile
      const { data: profile } = await supabase.from('profiles').select('org_id, display_name').eq('id', user.id).single();
      if (profile) {
        setUserProfile({
          display_name: profile.display_name || user.user_metadata?.full_name || 'User',
          email: user.email || '',
          organization: profile.org_id || '',
        });
      }

      if (!profile?.org_id) return;

      // Load org settings
      const { data: orgSettings } = await supabase.from('org_settings').select('*').eq('org_id', profile.org_id).single();
      if (orgSettings) {
        setSettings(prev => ({
          ...prev,
          daily_cost_limit: orgSettings.daily_cost_limit ?? prev.daily_cost_limit,
          monthly_cost_limit: orgSettings.monthly_cost_limit ?? prev.monthly_cost_limit,
          enabled_agents: orgSettings.enabled_agents ?? prev.enabled_agents,
          approval_threshold_auto: orgSettings.approval_threshold_auto ?? prev.approval_threshold_auto,
          approval_threshold_queue: orgSettings.approval_threshold_queue ?? prev.approval_threshold_queue,
          escalation_email: orgSettings.escalation_email ?? prev.escalation_email,
        }));
      }
    })();
  }, [supabase]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.className = next;
    try { localStorage.setItem('bitbit-theme', next); } catch { /* ignore */ }
  }, [theme]);

  const handleAgentToggle = (agentId: string) => {
    setSettings(prev => ({
      ...prev,
      enabled_agents: prev.enabled_agents.includes(agentId)
        ? prev.enabled_agents.filter(a => a !== agentId)
        : [...prev.enabled_agents, agentId],
    }));
  };

  const handleSaveSettings = async () => {
    if (!supabase) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
      if (!profile?.org_id) return;

      await supabase.from('org_settings').upsert({
        org_id: profile.org_id,
        daily_cost_limit: settings.daily_cost_limit,
        monthly_cost_limit: settings.monthly_cost_limit,
        enabled_agents: settings.enabled_agents,
        approval_threshold_auto: settings.approval_threshold_auto,
        approval_threshold_queue: settings.approval_threshold_queue,
        escalation_email: settings.escalation_email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });
    } finally {
      setSaving(false);
    }
  };

  const SECTIONS = [
    { id: 'agents', label: 'Agents' },
    { id: 'costs', label: 'Costs' },
    { id: 'channels', label: 'Channels' },
    { id: 'voice', label: 'Voice Profiles' },
    { id: 'policy', label: 'Policy' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'organization', label: 'Organization' },
    { id: 'profile', label: 'Profile' },
    { id: 'preferences', label: 'Preferences' },
  ];

  return (
    <TabShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary, #F1F5F9)', letterSpacing: '-0.02em' }}>Settings</h1>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            style={{
              ...accentBtn,
              opacity: saving ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
            Save All Settings
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={activeSection === s.id ? pillBtnActive : pillBtn}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ maxWidth: activeSection === 'agents' || activeSection === 'channels' || activeSection === 'voice' ? '900px' : '600px' }}>
          {activeSection === 'agents' && (
            <AgentTogglesSection enabledAgents={settings.enabled_agents} onToggle={handleAgentToggle} />
          )}

          {activeSection === 'costs' && (
            <CostLimitsSection
              dailyLimit={settings.daily_cost_limit}
              monthlyLimit={settings.monthly_cost_limit}
              onDailyChange={v => setSettings(p => ({ ...p, daily_cost_limit: v }))}
              onMonthlyChange={v => setSettings(p => ({ ...p, monthly_cost_limit: v }))}
            />
          )}

          {activeSection === 'channels' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <WhatsAppConnectCard />
              <ChannelConfigSection />
            </div>
          )}

          {activeSection === 'voice' && (
            <VoiceProfileEditor supabase={supabase} />
          )}

          {activeSection === 'policy' && (
            <PolicyPackEditor settings={settings} onChange={partial => setSettings(p => ({ ...p, ...partial }))} />
          )}

          {activeSection === 'integrations' && (
            <IntegrationGrid />
          )}

          {activeSection === 'organization' && (
            <DashboardLayoutSection supabase={supabase} />
          )}

          {activeSection === 'profile' && (
            <div style={glassCard}>
              <h3 style={cardTitle}>Your Profile</h3>
              <p style={cardDescription}>Manage your account details.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary, #94A3B8)' }}>Display Name</label>
                  <input
                    defaultValue={userProfile?.display_name || 'User'}
                    onFocus={() => setInputFocus('displayName')}
                    onBlur={() => setInputFocus(null)}
                    style={inputFocus === 'displayName' ? glassInputFocus : glassInput}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary, #94A3B8)' }}>Email</label>
                  <input
                    defaultValue={userProfile?.email || ''}
                    disabled
                    style={{ ...glassInput, opacity: 0.6 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary, #94A3B8)' }}>Organization</label>
                  <input
                    defaultValue={userProfile?.organization || ''}
                    disabled
                    style={{ ...glassInput, opacity: 0.6 }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'preferences' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: '600px' }}>
              <div style={glassCard}>
                <h3 style={cardTitle}>Theme</h3>
                <p style={cardDescription}>Switch between dark and light mode.</p>
                <div style={{ ...listRow, justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {theme === 'dark' ? (
                      <Moon size={16} style={{ color: 'var(--text-secondary, #94A3B8)' }} />
                    ) : (
                      <Sun size={16} style={{ color: '#eab308' }} />
                    )}
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>
                        {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary, #94A3B8)' }}>
                        {theme === 'dark' ? 'Easy on the eyes' : 'Bright and clean'}
                      </p>
                    </div>
                  </div>
                  <Toggle checked={theme === 'light'} onChange={toggleTheme} label="Toggle theme" />
                </div>
              </div>

              <div style={glassCard}>
                <h3 style={cardTitle}>Preferences</h3>
                <p style={cardDescription}>Customize your assistant behavior.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div
                    style={{ ...listRow, justifyContent: 'space-between' }}
                    onMouseEnter={() => setPreferencesHovered('autonomy')}
                    onMouseLeave={() => setPreferencesHovered(null)}
                  >
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>Autonomy Level</p>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary, #94A3B8)' }}>How much the agent can do without asking</p>
                    </div>
                    <span style={badge}>Medium</span>
                  </div>
                  <div
                    style={{ ...listRow, justifyContent: 'space-between' }}
                    onMouseEnter={() => setPreferencesHovered('communication')}
                    onMouseLeave={() => setPreferencesHovered(null)}
                  >
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>Communication Style</p>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary, #94A3B8)' }}>Agent response verbosity</p>
                    </div>
                    <span style={badge}>Concise</span>
                  </div>
                  <div
                    style={{ ...listRow, justifyContent: 'space-between' }}
                    onMouseEnter={() => setPreferencesHovered('email')}
                    onMouseLeave={() => setPreferencesHovered(null)}
                  >
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>Default Email Action</p>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary, #94A3B8)' }}>What to do with outgoing emails</p>
                    </div>
                    <span style={badge}>Draft</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </TabShell>
  );
}

export default React.memo(SettingsTab);
