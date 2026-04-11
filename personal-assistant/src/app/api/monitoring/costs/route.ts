import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCostSummary, checkBudgetAlerts } from '@/lib/monitoring/cost-tracker';

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const period = (url.searchParams.get('period') || '30d') as 'today' | '7d' | '30d' | 'month';

  try {
    const [summary, alerts] = await Promise.all([
      getCostSummary(supabase, period),
      checkBudgetAlerts(supabase),
    ]);

    // Strip per-model breakdown to prevent model fingerprinting
    const { by_model, ...sanitizedSummary } = summary as unknown as Record<string, unknown>;
    return NextResponse.json({ summary: sanitizedSummary, alerts });
  } catch (err) {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
