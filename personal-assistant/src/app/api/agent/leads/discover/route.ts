import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runDiscovery } from '@/lib/leads/discovery'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'SERPAPI_KEY not configured' }, { status: 503 })
  }

  let body: { businessType?: string; location?: string; limit?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { businessType, location, limit = 20 } = body
  if (!businessType || !location) {
    return NextResponse.json({ error: 'businessType and location are required' }, { status: 400 })
  }

  try {
    const results = await runDiscovery({
      businessType,
      location,
      limit: Math.min(limit, 50),
      apiKey,
      enrichWebsites: true,
    })

    return NextResponse.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discovery failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
