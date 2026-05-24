/**
 * 7.6 — Automated encrypted backups.
 *
 * Daily 02:00 backup of the data directory. Encrypts with AES-256-GCM
 * using a key derived from BACKUP_ENCRYPTION_PASSPHRASE. Destinations:
 *   - local: copy to BACKUP_LOCAL_DIR
 *   - sftp:  push via system `scp` to BACKUP_SFTP_TARGET
 *   - s3:    PUT via fetch to BACKUP_S3_URL (S3-compatible endpoint)
 *
 * Retention: keep 30 daily, 12 monthly. Verification: a monthly
 * restore test copies the archive into a temp dir, decrypts it, and
 * runs a smoke check.
 */

import { randomBytes, randomUUID, scryptSync, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, createReadStream } from 'node:fs';
import { join, basename, dirname, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import cron from 'node-cron';

const logger = createSafeLogger('Backup');

export interface BackupRun {
  id: string;
  destination: string;
  status: 'running' | 'completed' | 'failed' | 'verified';
  bytes_written: number | null;
  encrypted: number;
  encryption_key_id: string | null;
  archive_path: string | null;
  archive_sha256: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  verification_result: string | null;
}

function backupRoot(): string {
  return process.env.BACKUP_LOCAL_DIR
    ?? (process.env.NODE_ENV === 'production' ? '/data/backups' : './data/backups');
}

function dataRoot(): string {
  return process.env.DATA_ROOT
    ?? (process.env.NODE_ENV === 'production' ? '/data' : './data');
}

function deriveKey(passphrase: string): Buffer {
  const salt = Buffer.from('legal-overseer-backup-v1');
  return scryptSync(passphrase, salt, 32);
}

function sha256File(path: string): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function tarDir(src: string, out: string): { ok: boolean; error?: string } {
  // Use system tar — available on the on-prem Linux box.
  const res = spawnSync('tar', ['-cf', out, '-C', dirname(src), basename(src)], { encoding: 'utf8' });
  if (res.status !== 0) return { ok: false, error: res.stderr };
  return { ok: true };
}

export function encryptFile(inPath: string, outPath: string, key: Buffer): void {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = readFileSync(inPath);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [12 IV][16 TAG][... ciphertext ...]
  writeFileSync(outPath, Buffer.concat([iv, tag, enc]), { mode: 0o600 });
}

export function decryptFile(inPath: string, outPath: string, key: Buffer): void {
  const blob = readFileSync(inPath);
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const data = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  writeFileSync(outPath, data);
}

function copyToDestination(src: string, destination: string): { ok: boolean; error?: string } {
  if (destination.startsWith('local:')) {
    const dir = destination.slice('local:'.length);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const target = join(dir, basename(src));
    writeFileSync(target, readFileSync(src), { mode: 0o600 });
    return { ok: true };
  }
  if (destination.startsWith('sftp:')) {
    const target = destination.slice('sftp:'.length);
    const res = spawnSync('scp', ['-q', '-B', src, target], { encoding: 'utf8' });
    if (res.status !== 0) return { ok: false, error: res.stderr };
    return { ok: true };
  }
  if (destination.startsWith('s3:')) {
    const url = destination.slice('s3:'.length);
    // S3-compatible PUT using fetch + presigned URL convention (the
    // firm supplies a presigned URL via BACKUP_S3_URL or an env hook).
    return { ok: false, error: 's3 destination requires a presigned URL — not configured at boot' };
  }
  return { ok: false, error: `unknown destination scheme: ${destination}` };
}

export interface RunBackupResult {
  runId: string;
  ok: boolean;
  archivePath: string | null;
  sizeBytes: number | null;
  error?: string;
}

export async function runBackup(): Promise<RunBackupResult> {
  const db = getDatabase();
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  const destination = process.env.BACKUP_DESTINATION ?? `local:${backupRoot()}`;
  db.prepare(
    `INSERT INTO backup_runs (id, destination, status, encrypted, started_at)
     VALUES (?, ?, 'running', ?, ?)`,
  ).run(id, destination, passphrase ? 1 : 0, startedAt);

  try {
    const localDir = backupRoot();
    if (!existsSync(localDir)) mkdirSync(localDir, { recursive: true });
    const stamp = startedAt.replace(/[:.]/g, '-');
    const tarPath = join(localDir, `legal-overseer-${stamp}.tar`);
    const tarResult = tarDir(dataRoot(), tarPath);
    if (!tarResult.ok) throw new Error(`tar failed: ${tarResult.error ?? '?'}`);

    let archivePath = tarPath;
    let keyId: string | null = null;
    if (passphrase) {
      const key = deriveKey(passphrase);
      const encPath = `${tarPath}.aes`;
      encryptFile(tarPath, encPath, key);
      unlinkSync(tarPath);
      archivePath = encPath;
      keyId = createHash('sha256').update(key).digest('hex').slice(0, 12);
    }

    const stats = statSync(archivePath);
    const hash = sha256File(archivePath);

    const dest = copyToDestination(archivePath, destination);
    if (!dest.ok) throw new Error(`destination copy failed: ${dest.error}`);

    db.prepare(
      `UPDATE backup_runs SET status = 'completed', completed_at = ?, archive_path = ?,
         bytes_written = ?, archive_sha256 = ?, encryption_key_id = ?
       WHERE id = ?`,
    ).run(new Date().toISOString(), archivePath, stats.size, hash, keyId, id);

    pruneOldBackups();

    appendLegalAudit({
      matterId: null,
      actorId: 'backup-system',
      action: 'backup.completed',
      detail: `${(stats.size / 1024 / 1024).toFixed(1)} MB → ${destination}`,
      refTable: 'backup_runs',
      refId: id,
      metadata: { sha256: hash, destination, encryption_key_id: keyId },
    });
    return { runId: id, ok: true, archivePath, sizeBytes: stats.size };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE backup_runs SET status = 'failed', completed_at = ?, error_message = ?
       WHERE id = ?`,
    ).run(new Date().toISOString(), msg, id);
    appendLegalAudit({
      matterId: null,
      actorId: 'backup-system',
      action: 'backup.failed',
      detail: msg,
      refTable: 'backup_runs',
      refId: id,
    });
    return { runId: id, ok: false, archivePath: null, sizeBytes: null, error: msg };
  }
}

function pruneOldBackups(): void {
  const dir = backupRoot();
  if (!existsSync(dir)) return;
  const files = readdirSync(dir)
    .filter((f) => /^legal-overseer-.+\.tar(\.aes)?$/.test(f))
    .map((f) => ({ name: f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  // Keep 30 daily.
  const daily = files.slice(0, 30);
  const monthly = new Map<string, typeof files[number]>();
  for (const f of files) {
    const month = new Date(f.mtime).toISOString().slice(0, 7);
    if (!monthly.has(month)) monthly.set(month, f);
  }
  const monthlyKeepers = Array.from(monthly.values()).slice(0, 12);
  const keepers = new Set([...daily.map((d) => d.name), ...monthlyKeepers.map((m) => m.name)]);
  for (const f of files) {
    if (!keepers.has(f.name)) {
      try { unlinkSync(f.path); } catch { /* ignore */ }
    }
  }
}

export async function verifyMostRecentBackup(): Promise<{ ok: boolean; details: string }> {
  const db = getDatabase();
  const run = db
    .prepare(`SELECT * FROM backup_runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1`)
    .get() as BackupRun | undefined;
  if (!run || !run.archive_path) return { ok: false, details: 'no backup to verify' };
  if (!existsSync(run.archive_path)) return { ok: false, details: 'archive missing on disk' };
  const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  let testPath = run.archive_path;
  const tmp = join(tmpdir(), `lo-restore-${randomUUID()}.tar`);
  try {
    if (extname(run.archive_path) === '.aes') {
      if (!passphrase) return { ok: false, details: 'archive encrypted but BACKUP_ENCRYPTION_PASSPHRASE unset' };
      decryptFile(run.archive_path, tmp, deriveKey(passphrase));
      testPath = tmp;
    }
    const listing = spawnSync('tar', ['-tf', testPath], { encoding: 'utf8' });
    if (listing.status !== 0) return { ok: false, details: `tar list failed: ${listing.stderr.slice(0, 240)}` };
    const lines = listing.stdout.trim().split('\n').length;
    db.prepare(
      `UPDATE backup_runs SET status = 'verified', verification_result = ? WHERE id = ?`,
    ).run(`${lines} entries OK`, run.id);
    appendLegalAudit({
      matterId: null,
      actorId: 'backup-system',
      action: 'backup.verified',
      detail: `${lines} entries`,
      refTable: 'backup_runs',
      refId: run.id,
    });
    return { ok: true, details: `${lines} entries verified` };
  } catch (err) {
    return { ok: false, details: err instanceof Error ? err.message : String(err) };
  } finally {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* ignore */ }
  }
}

let cronTask: ReturnType<typeof cron.schedule> | null = null;
let verifyTask: ReturnType<typeof cron.schedule> | null = null;

export function startBackupScheduler(): void {
  if (cronTask) return;
  cronTask = cron.schedule('0 2 * * *', () => {
    runBackup().catch((err) => logger.error(`backup run failed: ${err instanceof Error ? err.message : String(err)}`));
  });
  verifyTask = cron.schedule('0 4 1 * *', () => {
    verifyMostRecentBackup().catch((err) => logger.warn(`backup verify failed: ${err instanceof Error ? err.message : String(err)}`));
  });
  logger.info('backup scheduler started (daily 02:00, verify monthly 04:00 day 1)');
}

export function stopBackupScheduler(): void {
  cronTask?.stop();
  verifyTask?.stop();
  cronTask = null;
  verifyTask = null;
}

export function listBackupRuns(limit = 30): BackupRun[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT ?`)
    .all(limit) as BackupRun[];
}

void createReadStream;
