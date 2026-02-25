import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

interface HealthCheck {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  checks: {
    supabase: 'ok' | 'error' | 'unconfigured';
    environment: string;
    uptime_seconds: number;
  };
}

const startTime = Date.now();

export async function GET() {
  const checks: HealthCheck['checks'] = {
    supabase: 'unconfigured',
    environment: process.env.NODE_ENV || 'unknown',
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
  };

  let status: HealthCheck['status'] = 'ok';

  // Check Supabase connectivity
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      if (supabase) {
        const { error } = await supabase.from('profiles').select('id').limit(1);
        checks.supabase = error ? 'error' : 'ok';
        if (error) status = 'degraded';
      }
    } catch {
      checks.supabase = 'error';
      status = 'degraded';
    }
  }

  const health: HealthCheck = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    checks,
  };

  return NextResponse.json(health, {
    status: (status as string) === 'down' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
