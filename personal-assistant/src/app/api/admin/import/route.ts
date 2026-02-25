import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { importContacts, importProjects, importInvoices } from '@/lib/admin/data-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey || !token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Validate user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get org
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 });
  }

  const body = await request.json();
  const { entity_type, data } = body;

  if (!entity_type || !Array.isArray(data)) {
    return NextResponse.json({ error: 'Invalid body: need entity_type and data[]' }, { status: 400 });
  }

  const importers: Record<string, typeof importContacts> = {
    contacts: importContacts,
    projects: importProjects,
    invoices: importInvoices,
  };

  const importer = importers[entity_type];
  if (!importer) {
    return NextResponse.json({ error: `Unsupported entity_type: ${entity_type}` }, { status: 400 });
  }

  const result = await importer(supabase, profile.org_id, data);
  return NextResponse.json(result);
}
