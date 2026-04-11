import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { globalSearch, type SearchEntityType } from '@/lib/search/global-search';

const VALID_TYPES = new Set(['contact', 'lead', 'invoice', 'proposal', 'tender']);

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) return NextResponse.json({ error: 'No org found' }, { status: 400 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const typesParam = url.searchParams.get('types');
  const types = typesParam
    ? (typesParam.split(',').filter((t) => VALID_TYPES.has(t)) as SearchEntityType[])
    : undefined;

  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50) : 20;

  const results = await globalSearch(supabase, profile.org_id, q, { types, limit });

  return NextResponse.json({ results });
}
