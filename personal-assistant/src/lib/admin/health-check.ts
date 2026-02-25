import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  latency_ms: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkSupabase(supabase: SupabaseClient): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const { error } = await supabase.from('organizations').select('id').limit(1);
    const latency_ms = Date.now() - start;
    if (error) {
      return { service: 'supabase', status: 'degraded', latency_ms, error: error.message };
    }
    return { service: 'supabase', status: 'healthy', latency_ms };
  } catch (err) {
    return { service: 'supabase', status: 'down', latency_ms: Date.now() - start, error: String(err) };
  }
}

async function checkAnthropic(): Promise<ServiceHealth> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { service: 'anthropic', status: 'down', latency_ms: 0, error: 'ANTHROPIC_API_KEY not set' };
  }

  const start = Date.now();
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const latency_ms = Date.now() - start;
    if (res.ok || res.status === 400) {
      // 400 is fine — means API is reachable, might just be a param issue
      return { service: 'anthropic', status: 'healthy', latency_ms };
    }
    return { service: 'anthropic', status: 'degraded', latency_ms, error: `HTTP ${res.status}` };
  } catch (err) {
    return { service: 'anthropic', status: 'down', latency_ms: Date.now() - start, error: String(err) };
  }
}

async function checkResend(): Promise<ServiceHealth> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { service: 'resend', status: 'down', latency_ms: 0, error: 'RESEND_API_KEY not set' };
  }

  const start = Date.now();
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    const latency_ms = Date.now() - start;
    return {
      service: 'resend',
      status: res.ok ? 'healthy' : 'degraded',
      latency_ms,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { service: 'resend', status: 'down', latency_ms: Date.now() - start, error: String(err) };
  }
}

async function checkWhatsApp(): Promise<ServiceHealth> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return { service: 'whatsapp', status: 'down', latency_ms: 0, error: 'WhatsApp env vars not set' };
  }

  const start = Date.now();
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${phoneId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    const latency_ms = Date.now() - start;
    return {
      service: 'whatsapp',
      status: res.ok ? 'healthy' : 'degraded',
      latency_ms,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { service: 'whatsapp', status: 'down', latency_ms: Date.now() - start, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runHealthChecks(supabase: SupabaseClient): Promise<ServiceHealth[]> {
  const results = await Promise.all([
    checkSupabase(supabase),
    checkAnthropic(),
    checkResend(),
    checkWhatsApp(),
  ]);
  return results;
}
