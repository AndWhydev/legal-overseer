import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { assembleContext } from '@/lib/context/assembler'

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { query, context: extraContext } = await request.json() as { query: string; context?: string }

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  // Resolve org_id from user metadata
  const orgId = (user.user_metadata?.org_id as string) ?? user.id

  // Assemble context from the knowledge graph
  let contextSummary = ''
  try {
    const briefing = await assembleContext(supabase, orgId, query)
    contextSummary = briefing.summary
  } catch (err) {
    console.warn('[ai/text] Context assembly failed, proceeding without context:', err)
  }

  const systemParts: string[] = [
    'You are BitBit, an AI operations assistant for a digital agency. Be concise, helpful, and action-oriented.',
  ]
  if (contextSummary) {
    systemParts.push(`\nRelevant context from the knowledge graph:\n${contextSummary}`)
  }
  if (extraContext) {
    systemParts.push(`\nAdditional context:\n${extraContext}`)
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemParts.join('\n'),
      messages: [{ role: 'user', content: query }],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    return NextResponse.json({
      response: text,
      tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    })
  } catch (err) {
    console.error('[ai/text] Anthropic API error:', err)
    const message = err instanceof Error ? err.message : 'AI request failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
