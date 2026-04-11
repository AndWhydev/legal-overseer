import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWhispers } from '@/lib/whispers/generate-whispers'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            // Read-only in route handlers
          },
        },
      },
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ whispers: [] })
    }

    // Get user's active org
    const { data: profile } = await supabase
      .from('profiles')
      .select('active_org_id, personal_org_id')
      .eq('id', user.id)
      .single()

    const orgId = profile?.active_org_id ?? profile?.personal_org_id
    if (!orgId) {
      return NextResponse.json({ whispers: [] })
    }

    // Use service role for cross-table queries
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const whispers = await generateWhispers(serviceSupabase, user.id, orgId)

    return NextResponse.json({ whispers })
  } catch {
    return NextResponse.json({ whispers: [] })
  }
}
