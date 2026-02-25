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

    return NextResponse.json({ summary, alerts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
