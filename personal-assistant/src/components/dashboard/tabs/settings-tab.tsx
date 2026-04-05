'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  IconSun, IconMoon, IconDeviceDesktop, IconLoader2, IconCheck, IconX,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { BillingSettings } from '@/components/settings/billing-settings';
import { QrAuthConnect } from '@/components/ui/qr-auth-connect';
import { ConnectionsGrid } from '@/components/connections/connections-grid';
import { RagStatsWidget } from '@/components/dashboard/rag-stats-widget';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/core/logger';
import { useTheme, type ThemeName } from '@/lib/theme/theme-provider';

// ---- Plugin types ----

const AUTOMATION_TYPES = [
  { id: 'lead_swarm', label: 'Lead Generation', description: 'Automatically find and score new leads' },
  { id: 'invoice_flow', label: 'Invoicing', description: 'Create and follow up on invoices' },
  { id: 'sentry', label: 'Monitoring', description: 'Watch for issues and raise alerts' },
  { id: 'channel_triage', label: 'Message Sorting', description: 'Categorise incoming messages by priority' },
  { id: 'client_comms', label: 'Client Emails', description: 'Draft email responses for clients' },
  { id: 'proposal_bot', label: 'Proposals', description: 'Generate quotes and scope documents' },
  { id: 'client_onboarding', label: 'Onboarding', description: 'Guide new clients through setup' },
  { id: 'ad_scripts', label: 'Ad Copy', description: 'Write creative ad scripts and copy' },
  { id: 'ai_search', label: 'SEO', description: 'Audit and improve search visibility' },
  { id: 'tender_hunter', label: 'Tenders', description: 'Find and respond to government tenders' },
] as const;

// ---- Types ----

interface OrgSettings {
  enabled_agents: string[];
}

interface OrgIntegration {
  id: string;
  provider: string;
  status: string;
  connected_at: string | null;
  metadata: Record<string, unknown>;
}

// ---- WhatsApp Wizard Modal ----

function WhatsAppWizardModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [alreadyConnected, setAlreadyConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkAndStart = async () => {
      setStarting(true);
      setError(null);
      try {
        const statusRes = await fetch('/api/channels/whatsapp/bridge');
        if (statusRes.ok) {
          const s = await statusRes.json() as { status?: string; running?: boolean };
          if (s.status === 'connected') {
            if (!cancelled) {
              setAlreadyConnected(true);
              setStarting(false);
              setTimeout(() => { if (!cancelled) onConnected(); }, 1500);
            }
            return;
          }
        }
        const response = await fetch('/api/channels/whatsapp/bridge', { method: 'POST' });
        if (!response.ok) throw new Error('Failed to start WhatsApp bridge');
        const data = await response.json() as { sessionId?: string; message?: string };
        if (!cancelled && data.sessionId) {
          setSessionId(data.sessionId);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to start pairing. Please try again.');
          logger.error('WhatsApp pairing error:', err);
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    checkAndStart();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-background"
        onClick={onClose}
      />
      <Card className="relative z-10 w-[90%] max-w-[420px] shadow-lg">
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-3 top-3"
          onClick={onClose}
        >
          <IconX className="size-4" />
        </Button>

        <CardContent className="pt-8 pb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/integrations/whatsapp.png"
            alt=""
            width={48}
            height={48}
            className="mx-auto mb-3 rounded-xl object-cover"
          />
          <h3 className="text-base font-medium text-foreground">
            {alreadyConnected ? 'WhatsApp Connected' : 'Connect WhatsApp'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {alreadyConnected ? 'Connected and receiving messages' : 'Link WhatsApp to start receiving messages'}
          </p>

          {error && (
            <Alert variant="destructive" className="mt-4 text-left">
              <AlertDescription>
                {error}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => window.location.reload()}
                >
                  Try Again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {alreadyConnected && (
            <div className="flex justify-center pt-4 pb-2">
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
                <IconCheck className="size-5 text-emerald-500" />
              </div>
            </div>
          )}

          {starting && !error && !alreadyConnected && (
            <div className="flex justify-center py-8">
              <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {sessionId && !error && !alreadyConnected && (
            <QrAuthConnect
              sessionId={sessionId}
              serviceName="WhatsApp"
              onConnected={() => onConnected()}
              onError={(err) => setError(err)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Save Indicator ----

function SaveIndicator({ visible }: { visible: boolean }) {
  return (
    <div
      className={cn(
        'fixed right-6 top-20 z-50 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-500 transition-all duration-300 pointer-events-none',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      )}
    >
      <IconCheck className="size-3.5" />
      Saved
    </div>
  );
}

// ---- Connections Tab ----

export function SettingsConnectionsTab() {
  const [integrations, setIntegrations] = useState<OrgIntegration[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);

  const fetchIntegrations = useCallback(async () => {
    try {
      setIntegrationsLoading(true);
      const response = await fetch('/api/settings/integrations');
      if (!response.ok) throw new Error('Failed to fetch integrations');
      const data = await response.json() as { integrations: OrgIntegration[] };
      setIntegrations(data.integrations);
    } catch (err) {
      logger.error('Error fetching integrations:', err);
    } finally {
      setIntegrationsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto p-6">
      {/* RAG Stats Widget */}
      <div>
        <h3 className="text-base font-medium text-foreground">Data & Synchronization</h3>
        <p className="mt-1 text-sm text-muted-foreground">Vector index and channel sync status</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
        <RagStatsWidget showDetails={true} />
      </div>

      {/* Connections Grid */}
      <div>
        <h3 className="text-base font-medium text-foreground">Integrations</h3>
        <p className="mt-1 text-sm text-muted-foreground">Connect communication channels</p>
      </div>
      <div>
        <ConnectionsGrid showHeader={false} />
      </div>

      {whatsappModalOpen && (
        <WhatsAppWizardModal
          onClose={() => setWhatsappModalOpen(false)}
          onConnected={() => {
            setWhatsappModalOpen(false);
            fetchIntegrations();
          }}
        />
      )}
    </div>
  );
}

// ---- Plugins Tab ----

export function SettingsAutomationsTab() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [settings, setSettings] = useState<OrgSettings>({
    enabled_agents: AUTOMATION_TYPES.map(a => a.id),
  });
  const [orgId, setOrgId] = useState<string | null>(null);
  const [saveIndicatorVisible, setSaveIndicatorVisible] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const client = createClient();
    if (client) setSupabase(client);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
      if (!profile?.org_id) return;
      setOrgId(profile.org_id);

      const { data: orgSettings } = await supabase.from('org_settings').select('*').eq('org_id', profile.org_id).single();
      if (orgSettings?.enabled_agents) {
        setSettings(prev => ({
          ...prev,
          enabled_agents: orgSettings.enabled_agents,
        }));
      }
    })();
  }, [supabase]);

  const autoSave = useCallback((newSettings: OrgSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!supabase || !orgId) return;
      try {
        await supabase.from('org_settings').upsert({
          org_id: orgId,
          enabled_agents: newSettings.enabled_agents,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' });
        setSaveIndicatorVisible(true);
        setTimeout(() => setSaveIndicatorVisible(false), 1500);
      } catch (err) {
        logger.error('Auto-save failed:', err);
      }
    }, 600);
  }, [supabase, orgId]);

  const handleToggle = (automationId: string) => {
    const newSettings: OrgSettings = {
      ...settings,
      enabled_agents: settings.enabled_agents.includes(automationId)
        ? settings.enabled_agents.filter(a => a !== automationId)
        : [...settings.enabled_agents, automationId],
    };
    setSettings(newSettings);
    autoSave(newSettings);
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto p-6">
      <SaveIndicator visible={saveIndicatorVisible} />
      <div>
        <h3 className="text-base font-medium text-foreground">Plugins</h3>
        <p className="mt-1 text-sm text-muted-foreground">Choose what BitBit handles for you.</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2">
        {AUTOMATION_TYPES.map(a => {
          const isEnabled = settings.enabled_agents.includes(a.id);
          return (
            <Card key={a.id} className="py-0">
              <CardContent className="flex items-center justify-between gap-3 py-3.5 px-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{a.label}</p>
                  <p className="text-sm text-muted-foreground">{a.description}</p>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={() => handleToggle(a.id)}
                  aria-label={a.label}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---- Appearance Tab ----

export function SettingsAppearanceTab() {
  const { theme: currentPalette, setTheme: setPalette } = useTheme();

  const isDev = process.env.NODE_ENV === 'development';
  const themes = [
    { id: 'midnight' as ThemeName, label: 'Midnight', desc: 'Deep dark', bg: 'bg-gradient-to-br from-[#0a0f1a] to-[#141b2d]', icon: <IconMoon className="size-5" /> },
    ...(isDev ? [{ id: 'aurora' as ThemeName, label: 'Aurora', desc: 'Glassmorphic', bg: 'bg-gradient-to-br from-[#F5E6D8] to-[#AFCADF]', icon: <IconSun className="size-5" /> }] : []),
    { id: 'light' as ThemeName, label: 'Light', desc: 'Clean & minimal', bg: 'bg-gradient-to-br from-[#FAFAF9] to-[#F0F0EE]', icon: <IconDeviceDesktop className="size-5" /> },
  ];

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto p-6">
      <div>
        <h3 className="text-base font-medium text-foreground">Theme</h3>
        <p className="mt-1 text-sm text-muted-foreground">Choose a visual style.</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {themes.map(t => {
          const active = currentPalette === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setPalette(t.id)}
              className={cn(
                'relative flex flex-col items-center gap-3 overflow-hidden rounded-xl p-4 transition-all',
                'border bg-card hover:bg-accent/50',
                active ? 'border-2 border-emerald-500' : 'border-border'
              )}
            >
              <div className={cn(
                'flex h-[72px] w-full items-center justify-center rounded-xl text-muted-foreground',
                t.bg,
              )}>
                {t.icon}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{t.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{t.desc}</p>
              </div>
              {active && (
                <div className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-emerald-500">
                  <IconCheck className="size-3 text-white" strokeWidth={2.5} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsBillingTab() {
  return (
    <div className="h-full overflow-auto p-6">
      <BillingSettings />
    </div>
  );
}
