/**
 * Inbox folder watcher.
 *
 * Watches ~/inbox (or INBOX_DIR) for new .md / .docx scope docs.
 * Debounces fs.watch events because:
 *   - A drag-drop on macOS/Windows triggers multiple "rename" events
 *     before the file is fully written.
 *   - .docx is a zip; reading it mid-write yields a corrupt extract.
 *
 * Strategy:
 *   1. fs.watch fires → push filename onto a pending set
 *   2. After QUIET_PERIOD_MS of no further events for that file,
 *      verify the size has stabilised (two stats matching), then
 *      hand off to ingestScopeFile.
 *   3. Files currently being processed are tracked in a separate set
 *      so retries / double-events don't double-ingest.
 *   4. Sweep the inbox on startup to catch anything dropped while the
 *      watcher was offline.
 */

import { type FSWatcher, statSync, readdirSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';
import { createSafeLogger } from '../governance/index.js';
import {
  ensureInboxDir,
  ingestScopeFile,
  isScopeDocCandidate,
  type IngestOptions,
} from './ingestor.js';

const logger = createSafeLogger('IntakeWatcher');

/** How long after the last event to wait before considering a file stable. */
const QUIET_PERIOD_MS = 2_000;

/** How long to wait between stability checks. */
const STABILITY_CHECK_MS = 750;

/** Per-file timer set + processing set keep state across rapid events. */
const pendingTimers = new Map<string, NodeJS.Timeout>();
const inFlight = new Set<string>();

export interface WatcherOptions extends IngestOptions {
  /** Directory to watch. Defaults to ~/inbox via ensureInboxDir(). */
  inboxDir?: string;
  /** Quiet-period override (ms). Lower for tests. */
  quietPeriodMs?: number;
  /** If true, skip the startup sweep of pre-existing files. */
  skipInitialSweep?: boolean;
  /** Hook called after each file is processed (success or failure). */
  onProcessed?: (path: string, error?: Error) => void;
}

export interface RunningWatcher {
  inboxDir: string;
  stop: () => void;
}

/**
 * Wait until two consecutive stat() calls report the same size. Returns
 * true when stable, false if the file disappears mid-check.
 */
async function isStable(path: string): Promise<boolean> {
  try {
    const first = statSync(path);
    if (!first.isFile()) return false;
    await new Promise((r) => setTimeout(r, STABILITY_CHECK_MS));
    const second = statSync(path);
    return second.isFile() && first.size === second.size;
  } catch {
    return false;
  }
}

async function processFile(path: string, options: WatcherOptions): Promise<void> {
  if (inFlight.has(path)) return;
  inFlight.add(path);
  try {
    // Final stability gate. Files dropped via WSL drag-drop are
    // sometimes still being written when the timer fires.
    if (!(await isStable(path))) {
      logger.warn(`File never stabilised, parking for next event: ${path}`);
      return;
    }

    logger.info(`Processing scope doc: ${path}`);
    const result = await ingestScopeFile(path, options);
    logger.info(
      `Ingested: ${result.scope.projectName} → ${result.projectPath} (project=${result.projectId})`,
    );
    options.onProcessed?.(path);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`Intake failed for ${path}: ${error.message}`);
    options.onProcessed?.(path, error);
  } finally {
    inFlight.delete(path);
  }
}

function scheduleProcess(path: string, options: WatcherOptions): void {
  const wait = options.quietPeriodMs ?? QUIET_PERIOD_MS;
  const existing = pendingTimers.get(path);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingTimers.delete(path);
    void processFile(path, options);
  }, wait);
  pendingTimers.set(path, timer);
}

/**
 * Sweep the inbox once at startup so anything dropped while the
 * watcher was offline gets processed.
 */
function initialSweep(dir: string, options: WatcherOptions): void {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    logger.warn(`Initial sweep failed to read ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  for (const name of entries) {
    if (!isScopeDocCandidate(name)) continue;
    const full = join(dir, name);
    try {
      const stat = statSync(full);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    logger.info(`Initial sweep queued: ${name}`);
    scheduleProcess(full, options);
  }
}

/**
 * Start the inbox watcher. Returns a handle with stop() so callers
 * (and tests) can tear it down cleanly.
 */
export function startInboxWatcher(options: WatcherOptions = {}): RunningWatcher {
  const inboxDir = options.inboxDir ?? ensureInboxDir();
  logger.info(`Watching inbox: ${inboxDir}`);

  let watcher: FSWatcher;
  try {
    watcher = fsWatch(inboxDir, { persistent: true }, (_event, filename) => {
      if (!filename) return;
      const name = filename.toString();
      if (!isScopeDocCandidate(name)) return;
      const full = join(inboxDir, name);
      // fs.watch fires before we can stat; defer to the debounced timer
      // which itself waits for the file to stabilise.
      scheduleProcess(full, options);
    });
  } catch (err) {
    throw new Error(
      `Failed to watch inbox directory ${inboxDir}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  watcher.on('error', (err) => {
    logger.error(`Watcher error: ${err.message}`);
  });

  if (!options.skipInitialSweep) {
    initialSweep(inboxDir, options);
  }

  return {
    inboxDir,
    stop: () => {
      for (const t of pendingTimers.values()) clearTimeout(t);
      pendingTimers.clear();
      try {
        watcher.close();
      } catch {
        // ignore
      }
      logger.info(`Inbox watcher stopped (${inboxDir})`);
    },
  };
}
