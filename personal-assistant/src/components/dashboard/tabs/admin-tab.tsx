'use client';

import React, { useState, useEffect, useCallback } from 'react';

import { createClient } from '@/lib/supabase/client';
import { TabShell } from '@/components/ui/tab-shell';
import { TabSkeleton } from './tab-skeleton';
import { AlertBanner } from '@/components/ui/alert-banner';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  latency_ms: number;
  error?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

const IMPORT_ENTITIES = ['contacts', 'projects', 'invoices'] as const;
const EXPORT_ENTITIES = ['contacts', 'projects', 'invoices', 'leads', 'agent_runs', 'audit_log'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  healthy: '#22c55e',
  degraded: '#f59e0b',
  down: '#ef4444',
};

const glassCard: React.CSSProperties = {
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
  borderRadius: 16,
};

async function getToken(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminTab() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);

  // Import state
  const [importEntity, setImportEntity] = useState<string>('contacts');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Export state
  const [exportEntity, setExportEntity] = useState<string>('contacts');
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('csv');
  const [exporting, setExporting] = useState(false);

  // Health state
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);

  // Init
  useEffect(() => {
    const c = createClient();
    if (!c) return;
    setClient(c);

    (async () => {
      const { data: { user } } = await c.auth.getUser();
      if (!user) { setIsAdmin(false); return; }
      const { data: profile } = await c.from('profiles').select('role').eq('id', user.id).single();
      setIsAdmin(profile?.role === 'admin');
    })();
  }, []);

  // Import handler
  const handleImport = useCallback(async () => {
    if (!client) return;
    setImporting(true);
    setImportResult(null);
    try {
      const parsed = JSON.parse(importText);
      const data = Array.isArray(parsed) ? parsed : [parsed];
      const token = await getToken(client);
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entity_type: importEntity, data }),
      });
      const result = await res.json();
      setImportResult(result);
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, errors: [{ row: -1, message: String(err) }] });
    } finally {
      setImporting(false);
    }
  }, [client, importEntity, importText]);

  // File upload handler
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(reader.result as string);
    reader.readAsText(file);
  }, []);

  // Export handler
  const handleExport = useCallback(async () => {
    if (!client) return;
    setExporting(true);
    try {
      const token = await getToken(client);
      const res = await fetch(
        `/api/admin/export?entity_type=${exportEntity}&format=${exportFormat}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportEntity}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [client, exportEntity, exportFormat]);

  // Health check
  const runHealthCheck = useCallback(async () => {
    if (!client) return;
    setHealthLoading(true);
    try {
      const token = await getToken(client);
      const res = await fetch('/api/health', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setHealth(await res.json());
      }
    } finally {
      setHealthLoading(false);
    }
  }, [client]);

  useEffect(() => { if (isAdmin) runHealthCheck(); }, [isAdmin, runHealthCheck]);

  // Guard
  if (isAdmin === null) {
    return <TabSkeleton />;
  }
  if (!isAdmin) {
    return (
      <TabShell>
        <div style={{ padding: 32 }}>
          <AlertBanner variant="error">
            <div>
              <h2 style={{ color: 'var(--text-primary)', fontSize: 16, marginBottom: 4, fontWeight: 500 }}>Access Denied</h2>
              <p style={{ color: 'var(--text-secondary)' }}>Admin role required to access this panel.</p>
            </div>
          </AlertBanner>
        </div>
      </TabShell>
    );
  }

  return (
    <TabShell>
      <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* System Health */}
      <div style={glassCard}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>System Health</span>
            <button
              onClick={runHealthCheck}
              disabled={healthLoading}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 14,
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              {healthLoading ? 'Checking...' : 'Refresh'}
            </button>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {health.map(h => (
              <div key={h.service} style={{
                padding: 16, borderRadius: 8, background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 9999,
                    background: STATUS_COLORS[h.status] || '#888',
                  }} />
                  <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {h.service}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  {h.status} &middot; {h.latency_ms}ms
                </div>
                {h.error && <div style={{ fontSize: 14, color: 'var(--bb-red)', marginTop: 4 }}>{h.error}</div>}
              </div>
            ))}
            {health.length === 0 && !healthLoading && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Import */}
      <div style={glassCard}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>Import Data</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={importEntity}
              onChange={e => setImportEntity(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {IMPORT_ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <input type="file" accept=".json" onChange={handleFileUpload} style={{ fontSize: 14 }} />
          </div>
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder='Paste JSON array, e.g. [{"name":"Acme","email":"a@b.com"}]'
            rows={6}
            style={{
              width: '100%', padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 14,
              background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
              resize: 'vertical',
            }}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              style={{
                padding: '8px 20px', borderRadius: 8, fontWeight: 500, fontSize: 14,
                background: 'var(--btn-primary-bg, #F1F5F9)', color: 'var(--btn-primary-fg, #0a0f1a)', border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                opacity: importing || !importText.trim() ? 0.5 : 1,
              }}
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
            {importResult && (
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {importResult.imported} imported, {importResult.skipped} skipped, {importResult.errors.length} errors
              </span>
            )}
          </div>
          {importResult && importResult.errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 14, color: 'var(--bb-red)', maxHeight: 120, overflow: 'auto' }}>
              {importResult.errors.map((e, i) => <div key={i}>Row {e.row}: {e.message}</div>)}
            </div>
          )}
        </div>
      </div>

      {/* Export */}
      <div style={glassCard}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>Export Data</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={exportEntity}
              onChange={e => setExportEntity(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {EXPORT_ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['csv', 'json'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setExportFormat(f)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
                    background: exportFormat === f ? 'var(--btn-primary-bg, #F1F5F9)' : 'var(--bg-elevated)',
                    color: exportFormat === f ? 'var(--btn-primary-fg, #0a0f1a)' : 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                padding: '8px 20px', borderRadius: 8, fontWeight: 500, fontSize: 14,
                background: 'var(--btn-primary-bg, #F1F5F9)', color: 'var(--btn-primary-fg, #0a0f1a)', border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                opacity: exporting ? 0.5 : 1,
              }}
            >
              {exporting ? 'Exporting...' : 'Download'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </TabShell>
  );
}
