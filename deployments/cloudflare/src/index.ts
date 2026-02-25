/**
 * BitBit Edge Cron — Cloudflare Worker
 *
 * Polls Supabase for pending agent work on a 5-minute schedule
 * and dispatches tasks to the VPS/Fly.io worker fleet.
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
      return new Response(
        JSON.stringify({ status: "ok", environment: env.ENVIRONMENT }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Manual trigger endpoint (POST /trigger)
    if (url.pathname === "/trigger" && request.method === "POST") {
      ctx.waitUntil(pollAndDispatch(env));
      return new Response(
        JSON.stringify({ dispatched: true }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function pollAndDispatch(env: Env): Promise<void> {
  const pendingTasks = await fetchPendingTasks(env);

  if (pendingTasks.length === 0) {
    return;
  }

  const dispatched = await Promise.allSettled(
    pendingTasks.map((task) => dispatchToWorker(env, task))
  );

  const succeeded = dispatched.filter((r) => r.status === "fulfilled").length;
  const failed = dispatched.filter((r) => r.status === "rejected").length;

  console.log(
    `[bitbit-edge-cron] Dispatched ${succeeded} tasks, ${failed} failures`
  );
}

async function fetchPendingTasks(env: Env): Promise<PendingTask[]> {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/agent_task_queue?status=eq.pending&order=created_at.asc&limit=20`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    console.error(
      `[bitbit-edge-cron] Supabase query failed: ${response.status}`
    );
    return [];
  }

  return (await response.json()) as PendingTask[];
}

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

  // Send to worker fleet
  const response = await fetch(`${env.WORKER_CALLBACK_URL}/api/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task_id: task.id,
      agent_type: task.agent_type,
      payload: task.payload,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Worker dispatch failed for task ${task.id}: ${response.status}`
    );
  }
}
