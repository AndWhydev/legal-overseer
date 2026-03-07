'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      const res = await fetch('/api/admin/health', {
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
              <h2 style={{ color: 'var(--text-primary)', fontSize: 16, marginBottom: 4, fontWeight: 600 }}>Access Denied</h2>
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
      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>System Health</span>
            <button
              onClick={runHealthCheck}
              disabled={healthLoading}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 13,
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              {healthLoading ? 'Checking...' : 'Refresh'}
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {health.map(h => (
              <div key={h.service} style={{
                padding: 14, borderRadius: 8, background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: STATUS_COLORS[h.status] || '#888',
                  }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {h.service}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {h.status} &middot; {h.latency_ms}ms
                </div>
                {h.error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{h.error}</div>}
              </div>
            ))}
            {health.length === 0 && !healthLoading && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No data yet</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Import */}
      <Card>
        <CardHeader><CardTitle>Import Data</CardTitle></CardHeader>
        <CardContent>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={importEntity}
              onChange={e => setImportEntity(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {IMPORT_ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <input type="file" accept=".json" onChange={handleFileUpload} style={{ fontSize: 13 }} />
          </div>
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder='Paste JSON array, e.g. [{"name":"Acme","email":"a@b.com"}]'
            rows={6}
            style={{
              width: '100%', padding: 10, borderRadius: 6, fontFamily: 'monospace', fontSize: 13,
              background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
              resize: 'vertical',
            }}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              style={{
                padding: '8px 20px', borderRadius: 6, fontWeight: 600, fontSize: 14,
                background: 'var(--bb-orange, #f97316)', color: '#fff', border: 'none', cursor: 'pointer',
                opacity: importing || !importText.trim() ? 0.5 : 1,
              }}
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
            {importResult && (
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {importResult.imported} imported, {importResult.skipped} skipped, {importResult.errors.length} errors
              </span>
            )}
          </div>
          {importResult && importResult.errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444', maxHeight: 120, overflow: 'auto' }}>
              {importResult.errors.map((e, i) => <div key={i}>Row {e.row}: {e.message}</div>)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader><CardTitle>Export Data</CardTitle></CardHeader>
        <CardContent>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={exportEntity}
              onChange={e => setExportEntity(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {EXPORT_ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['csv', 'json'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setExportFormat(f)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                    background: exportFormat === f ? 'var(--bb-orange, #f97316)' : 'var(--bg-elevated)',
                    color: exportFormat === f ? '#fff' : 'var(--text-primary)',
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
                padding: '8px 20px', borderRadius: 6, fontWeight: 600, fontSize: 14,
                background: 'var(--bb-orange, #f97316)', color: '#fff', border: 'none', cursor: 'pointer',
                opacity: exporting ? 0.5 : 1,
              }}
            >
              {exporting ? 'Exporting...' : 'Download'}
            </button>
          </div>
        </CardContent>
      </Card>
      </div>
    </TabShell>
  );
}
