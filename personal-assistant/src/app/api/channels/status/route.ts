import { NextResponse } from 'next/server'
import { getAllAdapters } from '@/lib/channels/synthesizer'

export async function GET() {
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
