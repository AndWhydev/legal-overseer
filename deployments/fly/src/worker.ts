/**
 * BitBit Fly.io Worker — HTTP Server
 *
 * Plain Node.js HTTP server for agent task execution.
 * Handles health checks and agent task dispatch from Cloudflare edge cron.
 *
 * Routes:
 *   GET  /api/monitoring/health — Health check (used by fly.toml checks)
 *   POST /api/agent/run         — Accept and execute agent tasks
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { healthCheck } from "./health.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// ─── Request body parser ──────────────────────────────────────────

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// ─── JSON response helper ─────────────────────────────────────────

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// ─── Update task status in Supabase ───────────────────────────────

async function updateTaskStatus(
  taskId: string,
  status: string
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[worker] Supabase credentials not configured, skipping status update"
    );
    return;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_task_queue?id=eq.${taskId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ status }),
      }
    );

    if (!response.ok) {
      console.error(
        `[worker] Failed to update task ${taskId} status to ${status}: ${response.status}`
      );
    }
  } catch (err) {
    console.error(`[worker] Error updating task status: ${err}`);
  }
}

// ─── Route handlers ───────────────────────────────────────────────

async function handleHealthCheck(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  json(res, 200, healthCheck());
}

async function handleAgentRun(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  let body: Record<string, unknown>;

  try {
    body = await parseBody(req);
  } catch {
    json(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { task_id, agent_type, payload } = body;

  // Validate required fields
  if (!task_id || typeof task_id !== "string") {
    json(res, 400, { error: "Missing or invalid task_id" });
    return;
  }

  if (!agent_type || typeof agent_type !== "string") {
    json(res, 400, { error: "Missing or invalid agent_type" });
    return;
  }

  console.log(
    `[worker] Received task ${task_id} for agent ${agent_type}`,
    payload ? `with payload keys: ${Object.keys(payload as object).join(", ")}` : ""
  );

  // Update task status to "processing" in Supabase
  await updateTaskStatus(task_id, "processing");

  // TODO: Wire actual agent execution here (Puppeteer/Playwright for browser-based tasks)
  // For now, accept the task and return immediately.
  // Agent execution will be implemented when specific agents need browser automation.

  json(res, 202, { accepted: true, task_id });
}

// ─── HTTP Server ──────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const method = req.method || "GET";

  try {
    if (method === "GET" && url.pathname === "/api/monitoring/health") {
      await handleHealthCheck(req, res);
    } else if (method === "POST" && url.pathname === "/api/agent/run") {
      await handleAgentRun(req, res);
    } else {
      json(res, 404, { error: "Not found" });
    }
  } catch (err) {
    console.error(`[worker] Unhandled error: ${err}`);
    json(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`[worker] BitBit Fly.io worker listening on port ${PORT}`);
  console.log(`[worker] Health: http://localhost:${PORT}/api/monitoring/health`);
  console.log(`[worker] Agent:  http://localhost:${PORT}/api/agent/run`);
});

// ─── Graceful shutdown ────────────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`[worker] Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    console.log("[worker] Server closed, exiting.");
    process.exit(0);
  });

  // Force exit after 10 seconds if server won't close
  setTimeout(() => {
    console.error("[worker] Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
