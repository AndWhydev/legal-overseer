import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SSE endpoint for streaming agent activity, approval events, and alerts.
 * GET /api/events
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 * Auth: validates session via Authorization header bearer token.
 */
export async function GET(request: NextRequest) {
  // --- Auth ---
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new Response('Server misconfigured', { status: 500 });
  }

  // Validate the user token
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // --- SSE Stream ---
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Client disconnected
          closed = true;
        }
      }

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          closed = true;
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Subscribe to agent_runs changes
      const agentChannel = supabase
        .channel('sse-agent-runs')
        .on('postgres_changes' as never, {
          event: '*',
          schema: 'public',
          table: 'agent_runs',
        }, (payload: Record<string, unknown>) => {
          send('agent_run', {
            eventType: payload.eventType,
            record: payload.new,
          });
        })
        .subscribe();

      // Subscribe to approval_queue changes
      const approvalChannel = supabase
        .channel('sse-approvals')
        .on('postgres_changes' as never, {
          event: '*',
          schema: 'public',
          table: 'approval_queue',
        }, (payload: Record<string, unknown>) => {
          send('approval', {
            eventType: payload.eventType,
            record: payload.new,
          });
        })
        .subscribe();

      // Subscribe to notifications (alerts)
      const alertChannel = supabase
        .channel('sse-notifications')
        .on('postgres_changes' as never, {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        }, (payload: Record<string, unknown>) => {
          send('alert', {
            record: payload.new,
          });
        })
        .subscribe();

      // Send initial connected event
      send('connected', { userId: user.id, timestamp: new Date().toISOString() });

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        supabase.removeChannel(agentChannel);
        supabase.removeChannel(approvalChannel);
        supabase.removeChannel(alertChannel);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
