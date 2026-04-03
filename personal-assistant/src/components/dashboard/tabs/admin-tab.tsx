'use client';

import React, { useState, useEffect, useCallback } from 'react';

import { createClient } from '@/lib/supabase/client';
import { TabShell } from '@/components/ui/tab-shell';
import { TabSkeleton } from './tab-skeleton';
import { AlertBanner } from '@/components/ui/alert-banner';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
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
              <h2 className="text-base font-medium mb-1 text-foreground">Access Denied</h2>
              <p className="text-muted-foreground">Admin role required to access this panel.</p>
            </div>
          </AlertBanner>
        </div>
      </TabShell>
    );
  }

  return (
    <TabShell>
      <div className="mx-auto flex max-w-[900px] flex-col gap-6 p-6">

      {/* System Health */}
      <div style={glassCard}>
        <div className="border-b border-white/[0.03] px-5 py-4">
          <div className="flex items-center justify-between text-base font-medium text-foreground">
            <span>System Health</span>
            <button
              onClick={runHealthCheck}
              disabled={healthLoading}
              className="cursor-pointer rounded-lg border border-border bg-muted px-4 py-2 text-sm text-foreground"
            >
              {healthLoading ? 'Checking...' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {health.map(h => (
              <div key={h.service} className="rounded-lg border border-border bg-muted p-4">
                <div className="mb-1 flex items-center gap-2">
                  <div
                    className="size-3 rounded-full"
                    style={{ background: STATUS_COLORS[h.status] || '#888' }}
                  />
                  <span className="text-sm font-medium capitalize text-foreground">
                    {h.service}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {h.status} &middot; {h.latency_ms}ms
                </div>
                {h.error && <div className="mt-1 text-sm text-destructive">{h.error}</div>}
              </div>
            ))}
            {health.length === 0 && !healthLoading && (
              <div className="text-sm text-muted-foreground">No data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Import */}
      <div style={glassCard}>
        <div className="border-b border-white/[0.03] px-5 py-4">
          <div className="text-base font-medium text-foreground">Import Data</div>
        </div>
        <div className="p-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Select value={importEntity} onValueChange={v => setImportEntity(v)}>
              <SelectTrigger className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_ENTITIES.map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="file" accept=".json" onChange={handleFileUpload} className="text-sm" />
          </div>
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder='Paste JSON array, e.g. [{"name":"Acme","email":"a@b.com"}]'
            rows={6}
            className="w-full resize-y rounded-lg border border-border bg-muted p-3 font-mono text-sm text-foreground"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-none bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
            {importResult && (
              <span className="text-sm text-muted-foreground">
                {importResult.imported} imported, {importResult.skipped} skipped, {importResult.errors.length} errors
              </span>
            )}
          </div>
          {importResult && importResult.errors.length > 0 && (
            <div className="mt-2 max-h-[120px] overflow-auto text-sm text-destructive">
              {importResult.errors.map((e, i) => <div key={i}>Row {e.row}: {e.message}</div>)}
            </div>
          )}
        </div>
      </div>

      {/* Export */}
      <div style={glassCard}>
        <div className="border-b border-white/[0.03] px-5 py-4">
          <div className="text-base font-medium text-foreground">Export Data</div>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={exportEntity} onValueChange={v => setExportEntity(v)}>
              <SelectTrigger className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_ENTITIES.map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              {(['csv', 'json'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setExportFormat(f)}
                  className={`cursor-pointer rounded-lg border border-border px-4 py-2 text-sm ${exportFormat === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-none bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
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
