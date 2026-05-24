/**
 * 9.8 — Uptime monitoring & alerting.
 *
 * Periodic health checks: DB connectivity (every minute), disk space
 * (hourly), memory usage (every 5 min), backup status (daily).
 * Alerts to admin email on threshold breach, /admin/monitoring shows
 * the log, /status surface for lawyers to check current health.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { sendNotification } from '../email/notifier.js';
import { verifyAuditChain } from '../compliance/audit.js';
import cron from 'node-cron';

const logger = createSafeLogger('Monitoring');

export type Severity = 'info' | 'warn' | 'error' | 'critical';

export interface MonitoringEvent {
  id: string;
  kind: string;
  severity: Severity;
  message: string;
  details_json: string | null;
  alerted_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface MonitoringMetric {
  id: string;
  metric: string;
  value: number;
  unit: string | null;
  captured_at: string;
}

export function recordEvent(kind: string, severity: Severity, message: string, details?: Record<string, unknown>): MonitoringEvent {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO monitoring_events (id, kind, severity, message, details_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, kind, severity, message, details ? JSON.stringify(details) : null);
  if (severity === 'error' || severity === 'critical') {
    const admin = process.env.ADMIN_EMAIL;
    if (admin) {
      sendNotification(
        `[${severity.toUpperCase()}] ${kind}: ${message}`,
        `<p>${message}</p>${details ? `<pre>${JSON.stringify(details, null, 2)}</pre>` : ''}`,
        admin,
      )
        .then(() => {
          db.prepare(`UPDATE monitoring_events SET alerted_at = ? WHERE id = ?`).run(
            new Date().toISOString(),
            id,
          );
        })
        .catch(() => undefined);
    }
    appendLegalAudit({
      matterId: null,
      actorId: 'monitoring',
      action: `monitoring.${severity}`,
      detail: `${kind}: ${message}`,
      refTable: 'monitoring_events',
      refId: id,
    });
  }
  return getEvent(id) as MonitoringEvent;
}

export function recordMetric(metric: string, value: number, unit?: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO monitoring_metrics (id, metric, value, unit) VALUES (?, ?, ?, ?)`,
  ).run(randomUUID(), metric, value, unit ?? null);
}

export function getEvent(id: string): MonitoringEvent | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM monitoring_events WHERE id = ?').get(id) as MonitoringEvent | undefined) ?? null;
}

export function listRecentEvents(limit = 100): MonitoringEvent[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM monitoring_events ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as MonitoringEvent[];
}

export function listRecentMetrics(metric: string, limit = 100): MonitoringMetric[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM monitoring_metrics WHERE metric = ? ORDER BY captured_at DESC LIMIT ?`)
    .all(metric, limit) as MonitoringMetric[];
}

// ---- checks ----

function checkDatabase(): void {
  try {
    const db = getDatabase();
    db.prepare('SELECT 1').get();
    recordMetric('db.ok', 1);
  } catch (err) {
    recordEvent('db.connectivity', 'critical', err instanceof Error ? err.message : String(err));
  }
}

function checkDiskSpace(): void {
  try {
    const path = process.env.DATABASE_PATH ?? './data/bitbit.db';
    const dir = path.substring(0, path.lastIndexOf('/')) || '.';
    if (!existsSync(dir)) return;
    const stat = statSync(dir);
    // We can't get free disk space without OS calls; record file count + path size as a proxy.
    recordMetric('db.dir.size_bytes', stat.size);
    // Use statvfs via child_process df.
    import('node:child_process').then(({ spawnSync }) => {
      const res = spawnSync('df', ['-P', dir], { encoding: 'utf8' });
      if (res.status === 0) {
        const line = res.stdout.split('\n')[1];
        if (line) {
          const parts = line.split(/\s+/);
          const usedPct = Number.parseInt((parts[4] ?? '0').replace('%', ''), 10);
          recordMetric('disk.used_pct', usedPct, '%');
          if (usedPct >= 80) {
            recordEvent('disk.usage', usedPct >= 90 ? 'error' : 'warn', `disk ${usedPct}% used on ${dir}`);
          }
        }
      }
    }).catch(() => undefined);
  } catch (err) {
    recordEvent('disk.check', 'warn', err instanceof Error ? err.message : String(err));
  }
}

function checkMemory(): void {
  const usage = process.memoryUsage();
  recordMetric('memory.rss_mb', Math.round(usage.rss / 1024 / 1024), 'MB');
  recordMetric('memory.heap_used_mb', Math.round(usage.heapUsed / 1024 / 1024), 'MB');
  const heapPct = (usage.heapUsed / usage.heapTotal) * 100;
  if (heapPct > 85) {
    recordEvent('memory.usage', heapPct > 95 ? 'error' : 'warn', `heap ${heapPct.toFixed(0)}% used`);
  }
}

function checkBackup(): void {
  const db = getDatabase();
  const recent = db
    .prepare(`SELECT MAX(started_at) AS last FROM backup_runs WHERE status IN ('completed', 'verified')`)
    .get() as { last: string | null };
  if (!recent.last) return; // No backups configured yet.
  const ageHrs = (Date.now() - new Date(recent.last).getTime()) / (3600 * 1000);
  recordMetric('backup.age_hours', ageHrs, 'h');
  if (ageHrs > 36) {
    recordEvent('backup.stale', 'error', `last backup ${ageHrs.toFixed(0)} hours ago`);
  }
}

function checkAuditChain(): void {
  try {
    const result = verifyAuditChain();
    if (!result.ok) {
      recordEvent('audit.chain', 'critical', 'audit chain integrity break detected', { firstBreak: result.firstBreak });
    } else {
      recordMetric('audit.chain.ok', 1);
    }
  } catch (err) {
    recordEvent('audit.chain', 'warn', err instanceof Error ? err.message : String(err));
  }
}

export interface HealthStatus {
  ok: boolean;
  components: { name: string; status: 'ok' | 'warn' | 'error'; message?: string }[];
  metrics: Record<string, number>;
}

export function currentHealthStatus(): HealthStatus {
  const db = getDatabase();
  const components: HealthStatus['components'] = [];
  // DB
  try { db.prepare('SELECT 1').get(); components.push({ name: 'database', status: 'ok' }); }
  catch (err) { components.push({ name: 'database', status: 'error', message: err instanceof Error ? err.message : String(err) }); }
  // Audit
  const audit = verifyAuditChain();
  components.push({ name: 'audit_chain', status: audit.ok ? 'ok' : 'error', message: audit.ok ? undefined : audit.firstBreak });
  // Recent events
  const recent = listRecentEvents(20);
  const hasError = recent.some((r) => (r.severity === 'error' || r.severity === 'critical') && !r.resolved_at);
  components.push({ name: 'monitoring', status: hasError ? 'warn' : 'ok' });

  const metrics: Record<string, number> = {};
  for (const m of ['db.ok', 'memory.heap_used_mb', 'memory.rss_mb', 'disk.used_pct', 'backup.age_hours']) {
    const row = db
      .prepare(`SELECT value FROM monitoring_metrics WHERE metric = ? ORDER BY captured_at DESC LIMIT 1`)
      .get(m) as { value: number } | undefined;
    if (row) metrics[m] = row.value;
  }
  return {
    ok: components.every((c) => c.status === 'ok'),
    components,
    metrics,
  };
}

let dbTask: ReturnType<typeof cron.schedule> | null = null;
let diskTask: ReturnType<typeof cron.schedule> | null = null;
let memTask: ReturnType<typeof cron.schedule> | null = null;
let backupTask: ReturnType<typeof cron.schedule> | null = null;
let auditTask: ReturnType<typeof cron.schedule> | null = null;

export function startMonitoringScheduler(): void {
  if (dbTask) return;
  dbTask = cron.schedule('* * * * *', checkDatabase);
  diskTask = cron.schedule('0 * * * *', checkDiskSpace);
  memTask = cron.schedule('*/5 * * * *', checkMemory);
  backupTask = cron.schedule('0 6 * * *', checkBackup);
  auditTask = cron.schedule('0 */6 * * *', checkAuditChain);
  logger.info('monitoring scheduler started');
}

export function stopMonitoringScheduler(): void {
  dbTask?.stop();
  diskTask?.stop();
  memTask?.stop();
  backupTask?.stop();
  auditTask?.stop();
  dbTask = diskTask = memTask = backupTask = auditTask = null;
}
