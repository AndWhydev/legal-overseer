import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAllAdapters } from '@/lib/channels/synthesizer'

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adapters = getAllAdapters()

  const statuses = await Promise.all(
    adapters.map(async (adapter) => {
      let available = false
      try {
        available = await adapter.isAvailable()
      } catch {
        // Adapter check failed — mark as unavailable
      }

      return {
        type: adapter.type,
        name: adapter.name,
        description: adapter.description,
        icon: adapter.icon,
        available,
        lastSync: null as string | null,
        messageCount: 0,
      }
    })
  )

  return NextResponse.json({ channels: statuses })
}
