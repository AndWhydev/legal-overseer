'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { IntegrationGrid } from '@/components/integrations/integration-grid';
import { Sun, Moon, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

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

// ─── Toggle Switch ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ background: checked ? 'var(--bb-orange, #FF5A1F)' : 'rgba(255,255,255,0.12)' }}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span
        className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(2px)', marginTop: 2 }}
      />
    </button>
  );
}

// ─── Agent Toggles Section ───────────────────────────────────────────────────

function AgentTogglesSection({ enabledAgents, onToggle }: { enabledAgents: string[]; onToggle: (id: string) => void }) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Agent Toggles</CardTitle>
        <CardDescription>Enable or disable agents for your organization.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {AGENT_TYPES.map(agent => (
          <div key={agent.id} className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
            <div>
              <p className="font-medium text-foreground text-sm">{agent.label}</p>
              <p className="text-xs text-muted-foreground">{agent.description}</p>
            </div>
            <Toggle
              checked={enabledAgents.includes(agent.id)}
              onChange={() => onToggle(agent.id)}
              label={`Toggle ${agent.label}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Cost Limits Section ─────────────────────────────────────────────────────

function CostLimitsSection({
  dailyLimit, monthlyLimit, onDailyChange, onMonthlyChange,
}: { dailyLimit: number; monthlyLimit: number; onDailyChange: (v: number) => void; onMonthlyChange: (v: number) => void }) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Cost Limits</CardTitle>
        <CardDescription>Set spending limits for AI operations.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-sm text-muted-foreground">Daily Cost Limit (USD)</label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={dailyLimit}
            onChange={e => onDailyChange(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-muted-foreground">Monthly Cost Limit (USD)</label>
          <Input
            type="number"
            min={0}
            step={5}
            value={monthlyLimit}
            onChange={e => onMonthlyChange(parseFloat(e.target.value) || 0)}
          />
        </div>
      </CardContent>
    </Card>
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
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Channel Configuration</CardTitle>
        <CardDescription>Manage connected channels and API keys.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {CHANNELS.map(ch => {
          const state = channels[ch.id];
          return (
            <div key={ch.id} className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-medium text-foreground text-sm">{ch.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {state?.maskedKey || 'Not configured'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={state?.connected ? 'default' : 'outline'} className="text-xs">
                  {state?.connected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Voice Profile Editor ────────────────────────────────────────────────────

function VoiceProfileEditor({ supabase }: { supabase: SupabaseClient | null }) {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [editing, setEditing] = useState<VoiceProfile | null>(null);
  const [saving, setSaving] = useState(false);

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
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Voice Profiles</CardTitle>
        <CardDescription>Define communication tone and style per client.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {profiles.map(p => (
          <div key={p.id} className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
            <div>
              <p className="font-medium text-foreground text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.tone} / {p.style}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing({ ...p })}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => p.id && handleDelete(p.id)}
                className="text-xs text-destructive hover:text-destructive/80 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {editing ? (
          <div className="flex flex-col gap-3 rounded-md border border-border/50 bg-muted/10 p-4">
            <Input placeholder="Profile name" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <Input placeholder="Tone (e.g. professional, friendly)" value={editing.tone} onChange={e => setEditing({ ...editing, tone: e.target.value })} />
            <Input placeholder="Style (e.g. concise, detailed)" value={editing.style} onChange={e => setEditing({ ...editing, style: e.target.value })} />
            <Input
              placeholder="Example phrases (comma-separated)"
              value={editing.example_phrases.join(', ')}
              onChange={e => setEditing({ ...editing, example_phrases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-[var(--bb-orange,#FF5A1F)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save
              </button>
              <button
                onClick={() => setEditing(null)}
                className="rounded-md border border-border/50 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing({ name: '', tone: '', style: '', example_phrases: [] })}
            className="flex items-center gap-1.5 self-start rounded-md border border-dashed border-border/50 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus size={12} /> Add Profile
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Policy Pack Editor ──────────────────────────────────────────────────────

function PolicyPackEditor({
  settings, onChange,
}: { settings: OrgSettings; onChange: (s: Partial<OrgSettings>) => void }) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Approval Policy</CardTitle>
        <CardDescription>Configure approval thresholds and escalation rules.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-sm text-muted-foreground">
            Auto-approve threshold (confidence above this = auto-act)
          </label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={settings.approval_threshold_auto}
            onChange={e => onChange({ approval_threshold_auto: parseFloat(e.target.value) || 0.85 })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-muted-foreground">
            Queue threshold (below this = escalate immediately)
          </label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={settings.approval_threshold_queue}
            onChange={e => onChange({ approval_threshold_queue: parseFloat(e.target.value) || 0.55 })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-muted-foreground">Escalation Email</label>
          <Input
            type="email"
            placeholder="escalation@company.com"
            value={settings.escalation_email}
            onChange={e => onChange({ escalation_email: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Settings Tab ───────────────────────────────────────────────────────

function SettingsTab() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [saving, setSaving] = useState(false);
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

  // Load org settings
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
      if (!profile?.org_id) return;
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-[var(--bb-orange,#FF5A1F)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save All Settings
        </button>
      </div>

      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="voice">Voice Profiles</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-4 max-w-2xl">
          <AgentTogglesSection enabledAgents={settings.enabled_agents} onToggle={handleAgentToggle} />
        </TabsContent>

        <TabsContent value="costs" className="mt-4 max-w-lg">
          <CostLimitsSection
            dailyLimit={settings.daily_cost_limit}
            monthlyLimit={settings.monthly_cost_limit}
            onDailyChange={v => setSettings(p => ({ ...p, daily_cost_limit: v }))}
            onMonthlyChange={v => setSettings(p => ({ ...p, monthly_cost_limit: v }))}
          />
        </TabsContent>

        <TabsContent value="channels" className="mt-4 max-w-2xl">
          <ChannelConfigSection />
        </TabsContent>

        <TabsContent value="voice" className="mt-4 max-w-2xl">
          <VoiceProfileEditor supabase={supabase} />
        </TabsContent>

        <TabsContent value="policy" className="mt-4 max-w-lg">
          <PolicyPackEditor settings={settings} onChange={partial => setSettings(p => ({ ...p, ...partial }))} />
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationGrid />
        </TabsContent>

        <TabsContent value="profile" className="mt-4">
          <Card className="max-w-lg border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Your Profile</CardTitle>
              <CardDescription>Manage your account details.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Display Name</label>
                <Input defaultValue="Tor Kay" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Email</label>
                <Input defaultValue="contact@torkay.com" disabled />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Organization</label>
                <Input defaultValue="Torkay Digital" disabled />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <div className="flex flex-col gap-4 max-w-lg">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Theme</CardTitle>
                <CardDescription>Switch between dark and light mode.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? (
                      <Moon className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Sun className="h-4 w-4 text-amber-500" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">
                        {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {theme === 'dark' ? 'Easy on the eyes' : 'Bright and clean'}
                      </p>
                    </div>
                  </div>
                  <Toggle checked={theme === 'light'} onChange={toggleTheme} label="Toggle theme" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Preferences</CardTitle>
                <CardDescription>Customize your assistant behavior.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
                <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                  <div>
                    <p className="font-medium text-foreground">Autonomy Level</p>
                    <p className="text-xs">How much the agent can do without asking</p>
                  </div>
                  <Badge variant="outline">Medium</Badge>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                  <div>
                    <p className="font-medium text-foreground">Communication Style</p>
                    <p className="text-xs">Agent response verbosity</p>
                  </div>
                  <Badge variant="outline">Concise</Badge>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                  <div>
                    <p className="font-medium text-foreground">Default Email Action</p>
                    <p className="text-xs">What to do with outgoing emails</p>
                  </div>
                  <Badge variant="outline">Draft</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default React.memo(SettingsTab);
