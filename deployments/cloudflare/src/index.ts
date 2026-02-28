/**
 * BitBit Edge Cron — Cloudflare Worker
 *
 * Polls Supabase for pending agent work on a 5-minute schedule
 * and dispatches tasks to the Fly.io worker fleet.
 *
 * Hardened with:
 *   - AbortController timeouts on all external requests
 *   - Failed dispatch recovery (revert task status to "pending")
 *   - Execution tracking with timestamps and duration
 *   - Health and status endpoints for observability
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  WORKER_CALLBACK_URL: string;
  ENVIRONMENT: string;
}

interface PendingTask {
  id: string;
  agent_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface HealthResponse {
  status: string;
  environment: string;
  worker_url_configured: boolean;
  last_poll_time: string | null;
}

interface StatusResponse {
  healthy: boolean;
  checks: {
    supabase: boolean;
    worker: boolean;
  };
}

// Module-level state (reset per isolate, useful for debugging)
let lastPollTime: string | null = null;

// ─── JSON response helper ─────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Main export ──────────────────────────────────────────────────

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(pollAndDispatch(env));
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return healthCheck(env);
    }

    if (url.pathname === "/status") {
      return await statusCheck(env);
    }

    // Manual trigger endpoint (POST /trigger)
    if (url.pathname === "/trigger" && request.method === "POST") {
      ctx.waitUntil(pollAndDispatch(env));
      return jsonResponse({ dispatched: true });
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ─── Health check ─────────────────────────────────────────────────

function healthCheck(env: Env): Response {
  const data: HealthResponse = {
    status: "ok",
    environment: env.ENVIRONMENT || "unknown",
    worker_url_configured: !!env.WORKER_CALLBACK_URL,
    last_poll_time: lastPollTime,
  };
  return jsonResponse(data);
}

// ─── Status check (pings Supabase and worker) ─────────────────────

async function statusCheck(env: Env): Promise<Response> {
  const checks = { supabase: false, worker: false };

  // Quick ping to Supabase REST endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
      method: "HEAD",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    checks.supabase = res.ok || res.status === 400; // 400 = no table specified, but server is up
  } catch {
    checks.supabase = false;
  }

  // Quick ping to worker health endpoint
  if (env.WORKER_CALLBACK_URL) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(
        `${env.WORKER_CALLBACK_URL}/api/monitoring/health`,
        {
          method: "GET",
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      checks.worker = res.ok;
    } catch {
      checks.worker = false;
    }
  }

  const data: StatusResponse = {
    healthy: checks.supabase && checks.worker,
    checks,
  };
  return jsonResponse(data, data.healthy ? 200 : 503);
}

// ─── Poll and dispatch ────────────────────────────────────────────

async function pollAndDispatch(env: Env): Promise<void> {
  const startTime = Date.now();
  const startTimestamp = new Date().toISOString();
  console.log(`[bitbit-edge-cron] Poll started at ${startTimestamp}`);

  // Check WORKER_CALLBACK_URL is configured
  if (!env.WORKER_CALLBACK_URL) {
    console.warn(
      "[bitbit-edge-cron] WORKER_CALLBACK_URL not set, skipping dispatch"
    );
    lastPollTime = startTimestamp;
    return;
  }

  const pendingTasks = await fetchPendingTasks(env);

  if (pendingTasks.length === 0) {
    const duration = Date.now() - startTime;
    console.log(
      `[bitbit-edge-cron] No pending tasks (${duration}ms)`
    );
    lastPollTime = startTimestamp;
    return;
  }

  const dispatched = await Promise.allSettled(
    pendingTasks.map((task) => dispatchToWorker(env, task))
  );

  const succeeded = dispatched.filter((r) => r.status === "fulfilled").length;
  const failed = dispatched.filter((r) => r.status === "rejected").length;
  const duration = Date.now() - startTime;

  console.log(
    `[bitbit-edge-cron] Dispatched ${succeeded} tasks, ${failed} failures (${duration}ms)`
  );

  lastPollTime = startTimestamp;
}

// ─── Fetch pending tasks with timeout ─────────────────────────────

async function fetchPendingTasks(env: Env): Promise<PendingTask[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/agent_task_queue?status=eq.pending&order=created_at.asc&limit=20`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "(unreadable)");
      console.error(
        `[bitbit-edge-cron] Supabase query failed: ${response.status} — ${body}`
      );
      return [];
    }

    return (await response.json()) as PendingTask[];
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[bitbit-edge-cron] Supabase request timed out (5s)");
    } else {
      console.error(`[bitbit-edge-cron] Supabase request error: ${err}`);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Dispatch task to worker with timeout and recovery ────────────

async function dispatchToWorker(
  env: Env,
  task: PendingTask
): Promise<void> {
  // Mark task as dispatched
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/agent_task_queue?id=eq.${task.id}`,
    {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ status: "dispatched" }),
    }
  );

  // Send to worker fleet with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${env.WORKER_CALLBACK_URL}/api/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: task.id,
        agent_type: task.agent_type,
        payload: task.payload,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "(unreadable)");
      console.error(
        `[bitbit-edge-cron] Worker dispatch failed for task ${task.id}: ${response.status} — ${body}`
      );
      // Revert task status to pending so it can be retried
      await revertTaskStatus(env, task.id);
      throw new Error(
        `Worker dispatch failed for task ${task.id}: ${response.status}`
      );
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error(
        `[bitbit-edge-cron] Worker dispatch timed out for task ${task.id} (10s)`
      );
      await revertTaskStatus(env, task.id);
      throw new Error(`Worker dispatch timed out for task ${task.id}`);
    }
    // Re-throw if it's our own error (already logged), otherwise log and revert
    if (err instanceof Error && err.message.startsWith("Worker dispatch")) {
      throw err;
    }
    console.error(
      `[bitbit-edge-cron] Unexpected error dispatching task ${task.id}: ${err}`
    );
    await revertTaskStatus(env, task.id);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Revert task status on dispatch failure ───────────────────────

async function revertTaskStatus(env: Env, taskId: string): Promise<void> {
  try {
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/agent_task_queue?id=eq.${taskId}`,
      {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ status: "pending" }),
      }
    );
    console.log(
      `[bitbit-edge-cron] Reverted task ${taskId} status to pending`
    );
  } catch (revertErr) {
    console.error(
      `[bitbit-edge-cron] Failed to revert task ${taskId} status: ${revertErr}`
    );
  }
}
