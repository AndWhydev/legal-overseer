/**
 * Agent Executor — Fly.io Worker
 *
 * Standalone agent execution logic using raw Supabase REST API
 * and Anthropic API (no @supabase/supabase-js or Next.js dependencies).
 *
 * Dispatches to lightweight handlers for known agent types.
 * Unknown agent types return a graceful no-op.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// ─── Supabase REST helper ────────────────────────────────────────

async function supabaseRest(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: method === "GET" ? "return=representation" : "return=minimal",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase REST ${method} ${path} failed (${response.status}): ${text}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return null;
}

// ─── Anthropic API helper ────────────────────────────────────────

async function callAnthropic(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content?.[0]?.text || "";
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Agent result type ───────────────────────────────────────────

export interface AgentResult {
  success: boolean;
  error?: string;
  result?: unknown;
}

// ─── Agent handlers ──────────────────────────────────────────────

async function handleChannelTriage(
  taskId: string,
  payload: Record<string, unknown>
): Promise<AgentResult> {
  // Query unprocessed channel messages
  const messages = (await supabaseRest(
    "GET",
    "channel_messages?classification=is.null&order=created_at.asc&limit=20"
  )) as Array<Record<string, unknown>>;

  if (!messages || messages.length === 0) {
    return { success: true, result: { processed: 0 } };
  }

  let processed = 0;
  for (const msg of messages) {
    try {
      const classification = await callAnthropic(
        "You are a message classifier for a digital agency. Classify the message and respond with ONLY valid JSON: {\"significance\": <1-10>, \"time_sensitivity\": \"urgent\"|\"today\"|\"this_week\"|\"low\", \"recommended_actions\": [\"<action>\"]}",
        `Channel: ${msg.channel || "unknown"}\nFrom: ${msg.sender_name || msg.sender_id || "unknown"}\nMessage: ${msg.content || msg.body || ""}`
      );

      const parsed = JSON.parse(classification);
      await supabaseRest("PATCH", `channel_messages?id=eq.${msg.id}`, {
        classification: parsed,
      });
      processed++;
    } catch (err) {
      console.error(`[agent-executor] Failed to classify message ${msg.id}: ${err}`);
    }
  }

  return { success: true, result: { processed, total: messages.length } };
}

async function handleLeadSwarm(
  taskId: string,
  payload: Record<string, unknown>
): Promise<AgentResult> {
  // Query new leads
  const leads = (await supabaseRest(
    "GET",
    "leads?status=eq.new&order=created_at.asc&limit=10"
  )) as Array<Record<string, unknown>>;

  if (!leads || leads.length === 0) {
    return { success: true, result: { processed: 0 } };
  }

  let qualified = 0;
  for (const lead of leads) {
    try {
      const result = await callAnthropic(
        "You qualify leads for a digital agency. Respond with ONLY valid JSON: {\"temperature\": \"hot\"|\"warm\"|\"cold\", \"confidence\": <0.0-1.0>, \"reason\": \"<brief reason>\"}",
        `Lead: ${lead.name || "unknown"}\nSource: ${lead.source || "unknown"}\nNotes: ${lead.notes || lead.description || "none"}`
      );

      const parsed = JSON.parse(result);
      await supabaseRest("PATCH", `leads?id=eq.${lead.id}`, {
        status: parsed.temperature === "hot" ? "qualified" : "nurturing",
        qualification: parsed,
      });
      qualified++;
    } catch (err) {
      console.error(`[agent-executor] Failed to qualify lead ${lead.id}: ${err}`);
    }
  }

  return { success: true, result: { processed: leads.length, qualified } };
}

async function handleInvoiceFlow(
  taskId: string,
  payload: Record<string, unknown>
): Promise<AgentResult> {
  // Extract invoice details from task payload
  const contact = payload.contact_name || payload.contact || "unknown";
  const project = payload.project_name || payload.project || "unknown";
  const amount = payload.amount || 0;

  return {
    success: true,
    result: {
      task_id: taskId,
      contact,
      project,
      amount,
      status: "extracted",
    },
  };
}

async function handleSentry(
  taskId: string,
  payload: Record<string, unknown>
): Promise<AgentResult> {
  // Query recent activity for anomaly detection
  const recentRuns = (await supabaseRest(
    "GET",
    "agent_runs?order=created_at.desc&limit=50&status=eq.failed"
  )) as Array<Record<string, unknown>>;

  const failedCount = recentRuns?.length || 0;
  if (failedCount > 10) {
    console.warn(`[agent-executor] Sentry alert: ${failedCount} recent failures detected`);
  }

  return {
    success: true,
    result: { recentFailures: failedCount, alertTriggered: failedCount > 10 },
  };
}

// ─── Dispatch map ────────────────────────────────────────────────

type AgentHandler = (
  taskId: string,
  payload: Record<string, unknown>
) => Promise<AgentResult>;

const handlers: Record<string, AgentHandler> = {
  "channel-triage": handleChannelTriage,
  "lead-swarm": handleLeadSwarm,
  "invoice-flow": handleInvoiceFlow,
  sentry: handleSentry,
};

// ─── Main executor ───────────────────────────────────────────────

export async function executeAgentTask(
  taskId: string,
  agentType: string,
  payload: Record<string, unknown>
): Promise<AgentResult> {
  const handler = handlers[agentType];

  if (!handler) {
    console.log(`[agent-executor] No handler for agent type '${agentType}', returning no-op`);
    return { success: true, result: `no-op for agent type: ${agentType}` };
  }

  try {
    console.log(`[agent-executor] Executing ${agentType} for task ${taskId}`);
    const result = await handler(taskId, payload);
    console.log(`[agent-executor] ${agentType} completed for task ${taskId}:`, result.result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent-executor] ${agentType} failed for task ${taskId}: ${message}`);
    return { success: false, error: message };
  }
}
