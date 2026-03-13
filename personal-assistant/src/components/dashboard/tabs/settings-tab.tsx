'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sun, Moon, Monitor, Loader2, Smartphone, Check, X } from 'lucide-react';
import { QrAuthConnect } from '@/components/ui/qr-auth-connect';
import { ConnectionsGrid } from '@/components/integrations/integration-grid';
import { createClient } from '@/lib/supabase/client';
import { TabShell } from '@/components/ui/tab-shell';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/core/logger';
import { useTheme, type ThemeName } from '@/lib/theme/theme-provider';

// ─── Automation types (user-friendly names) ─────────────────────────────────

const AUTOMATION_TYPES = [
  { id: 'lead_swarm', label: 'Lead Generation', description: 'Automatically find and score new leads' },
  { id: 'invoice_flow', label: 'Invoicing', description: 'Create and follow up on invoices' },
  { id: 'sentry', label: 'Monitoring', description: 'Watch for issues and alert you' },
  { id: 'channel_triage', label: 'Message Sorting', description: 'Categorise incoming messages by priority' },
  { id: 'client_comms', label: 'Client Emails', description: 'Draft email responses for your clients' },
  { id: 'proposal_bot', label: 'Proposals', description: 'Generate quotes and scope documents' },
  { id: 'client_onboarding', label: 'Onboarding', description: 'Guide new clients through setup' },
  { id: 'ad_scripts', label: 'Ad Copy', description: 'Write creative ad scripts and copy' },
  { id: 'ai_search', label: 'SEO', description: 'Audit and improve your search visibility' },
  { id: 'tender_hunter', label: 'Tenders', description: 'Find and respond to government tenders' },
] as const;

const SECTIONS = [
  { id: 'connections', label: 'Connections' },
  { id: 'automations', label: 'Automations' },
  { id: 'appearance', label: 'Appearance' },
];

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Inline Styles ───────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  padding: '20px',
  borderRadius: 16,
  background: 'var(--glass-card-bg)',
  backdropFilter: 'var(--glass-card-blur)',
  WebkitBackdropFilter: 'var(--glass-card-blur)',
  border: '1px solid var(--glass-card-border)',
  boxShadow: 'var(--glass-card-inset)',
};

const pillBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 18px',
  borderRadius: 24,
  border: 'none',
  background: 'rgba(10, 14, 23, 0.42)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  color: 'var(--text-secondary)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 150ms ease, color 150ms ease, transform 150ms ease',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const pillBtnActive: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 18px',
  borderRadius: 24,
  border: '1px solid transparent',
  background: 'rgba(255, 255, 255, 0.95)',
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  boxShadow: 'none',
  color: '#0A0A0B',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 150ms ease, color 150ms ease, transform 150ms ease',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const listRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 18px',
  borderRadius: 12,
  background: 'var(--glass-pill-bg)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--glass-card-inset)',
  border: 'none',
  transition: 'background 200ms',
};

const cardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-primary)',
  marginBottom: 4,
};

const cardDescription: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary)',
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
        borderRadius: 12,
        transition: 'background-color 200ms ease',
        border: 'none',
        background: checked ? '#22C55E' : 'rgba(255, 255, 255, 0.1)',
        outline: 'none',
      }}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(34, 197, 94, 0.3)'; }}
      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
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

// ─── Automation Toggles Section ──────────────────────────────────────────────

function AutomationTogglesSection({ enabledAutomations, onToggle }: { enabledAutomations: string[]; onToggle: (id: string) => void }) {
  return (
    <div style={glassCard}>
      <h3 style={cardTitle}>Automations</h3>
      <p style={cardDescription}>Choose what BitBit handles for you.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {AUTOMATION_TYPES.map(a => (
          <div key={a.id} style={{ ...listRow, justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>{a.label}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{a.description}</p>
            </div>
            <Toggle checked={enabledAutomations.includes(a.id)} onChange={() => onToggle(a.id)} label={a.label} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── WhatsApp Wizard Modal ───────────────────────────────────────────────────

function WhatsAppWizardModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const startPairing = async () => {
      setStarting(true);
      setError(null);
      try {
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

    startPairing();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />
      <div style={{
        position: 'relative',
        ...glassCard,
        maxWidth: 420,
        width: '90%',
        padding: 32,
        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
      }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
        >
          <X size={18} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(37, 211, 102, 0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <Smartphone size={24} style={{ color: '#25D366' }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Connect WhatsApp</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Link your WhatsApp account to BitBit</p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444',
            fontSize: 13, marginBottom: 16, textAlign: 'center',
          }}>
            {error}
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'block', margin: '8px auto 0', padding: '6px 14px', borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.08)', border: '1px solid var(--glass-interactive-border)',
                color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {starting && !error && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Loader2 size={24} style={{ animation: 'bb-spin 1s linear infinite', color: 'var(--text-secondary)' }} />
          </div>
        )}

        {sessionId && !error && (
          <QrAuthConnect
            sessionId={sessionId}
            serviceName="WhatsApp"
            onConnected={() => onConnected()}
            onError={(err) => setError(err)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Save Indicator ──────────────────────────────────────────────────────────

function SaveIndicator({ visible }: { visible: boolean }) {
  return (
    <div style={{
      position: 'fixed',
      top: 80,
      right: 24,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 14px',
      borderRadius: 8,
      background: 'rgba(34, 197, 94, 0.12)',
      color: '#22C55E',
      fontSize: 12,
      fontWeight: 500,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(-8px)',
      transition: 'opacity 300ms, transform 300ms',
      pointerEvents: 'none',
      zIndex: 50,
    }}>
      <Check size={14} />
      Saved
    </div>
  );
}

// ─── Main Settings Tab ───────────────────────────────────────────────────────

function SettingsTab() {
  const { theme: currentPalette, setTheme: setPalette } = useTheme();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [activeSection, setActiveSection] = useState<string>('connections');
  const [settings, setSettings] = useState<OrgSettings>({
    enabled_agents: AUTOMATION_TYPES.map(a => a.id),
  });
  const [orgId, setOrgId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<OrgIntegration[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [saveIndicatorVisible, setSaveIndicatorVisible] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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

  // Fetch integrations once (lifted from IntegrationGrid to prevent reload on tab switch)
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

  // Auto-save with debounce for automation toggles
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

  const handleAutomationToggle = (automationId: string) => {
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
    <TabShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
        <SaveIndicator visible={saveIndicatorVisible} />

        {/* Tab Switcher — inbox-style pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={activeSection === s.id ? pillBtnActive : pillBtn}
              onMouseEnter={e => {
                if (activeSection !== s.id) {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1)';
                if (activeSection !== s.id) {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ maxWidth: activeSection === 'connections' ? '900px' : '640px' }}>
          {activeSection === 'connections' && (
            <ConnectionsGrid
              integrations={integrations}
              isLoading={integrationsLoading}
              onStatusChange={fetchIntegrations}
              onWhatsAppConnect={() => setWhatsappModalOpen(true)}
            />
          )}

          {activeSection === 'automations' && (
            <AutomationTogglesSection
              enabledAutomations={settings.enabled_agents}
              onToggle={handleAutomationToggle}
            />
          )}

          {activeSection === 'appearance' && (
            <div style={glassCard}>
              <h3 style={cardTitle}>Theme</h3>
              <p style={cardDescription}>Choose your visual style.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {([
                  { id: 'midnight' as ThemeName, label: 'Midnight', desc: 'Deep dark', bg: 'linear-gradient(135deg, #0a0f1a 0%, #141b2d 100%)', border: 'rgba(255,255,255,0.08)', icon: <Moon size={18} />, previewText: 'rgba(255,255,255,0.6)' },
                  { id: 'aurora' as ThemeName, label: 'Aurora', desc: 'Glassmorphic', bg: 'linear-gradient(135deg, #F5E6D8 0%, #AFCADF 100%)', border: 'rgba(0,0,0,0.08)', icon: <Sun size={18} />, previewText: 'rgba(0,0,0,0.5)' },
                  { id: 'light' as ThemeName, label: 'Light', desc: 'Clean & minimal', bg: 'linear-gradient(135deg, #FAFAF9 0%, #F0F0EE 100%)', border: 'rgba(0,0,0,0.08)', icon: <Monitor size={18} />, previewText: 'rgba(0,0,0,0.5)' },
                ]).map(t => {
                  const active = currentPalette === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setPalette(t.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 10,
                        padding: 16,
                        borderRadius: 14,
                        border: active ? '2px solid var(--accent)' : `1px solid ${t.border}`,
                        background: 'var(--bg-card)',
                        cursor: 'pointer',
                        transition: 'all 200ms',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{
                        width: '100%', height: 60, borderRadius: 8, background: t.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.previewText,
                      }}>
                        {t.icon}
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{t.label}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{t.desc}</p>
                      </div>
                      {active && (
                        <div style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* WhatsApp Wizard Modal */}
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
    </TabShell>
  );
}

export default React.memo(SettingsTab);
