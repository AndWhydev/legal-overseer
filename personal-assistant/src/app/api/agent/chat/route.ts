import { NextRequest } from 'next/server'
import { runAgentChat } from '@/lib/agent/engine'
import { loadAllAgents } from '@/lib/agent/registry-loader'
import { createClient } from '@/lib/supabase/server'

let registryInitialized = false

export async function POST(request: NextRequest) {
  const { message } = await request.json()
  if (!message) {
    return new Response('Message required', { status: 400 })
  }

  if (!registryInitialized) {
    loadAllAgents()
    registryInitialized = true
  }

  // Authenticate and get org_id
  const supabase = await createClient()
  if (!supabase) {
    return new Response('Supabase not configured', { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return new Response('No profile found', { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const events = runAgentChat(message, { orgId: profile.org_id, supabase })
        for await (const event of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          )
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', data: String(error) })}\n\n`
          )
        )
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
