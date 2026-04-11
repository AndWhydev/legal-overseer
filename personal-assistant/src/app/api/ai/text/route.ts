import { NextResponse } from 'next/server'
import { streamText } from 'ai'
import { models } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'
import { assembleContext } from '@/lib/context/assembler'
import { getPack, resolveIndustry } from '@/lib/industry/registry'
import { checkUserEndpointLimit } from '@/lib/api-rate-limiter'
import { detectInjection, neutralizeInjection } from '@/lib/agent/injection-guard'
import { logger } from '@/lib/core/logger';

const MAX_QUERY_LENGTH = 10_000
const MAX_CONTEXT_LENGTH = 20_000

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rateLimited = checkUserEndpointLimit(user.id, '/api/ai/text')
  if (rateLimited) return rateLimited

  const { query, context: extraContext } = await request.json() as { query: string; context?: string }

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: 'query too long' }, { status: 400 })
  }

  if (extraContext && extraContext.length > MAX_CONTEXT_LENGTH) {
    return NextResponse.json({ error: 'context too long' }, { status: 400 })
  }

  // Injection detection on both query and context
  const queryInjection = detectInjection(query)
  const contextInjection = extraContext ? detectInjection(extraContext) : { detected: false, patterns: [] }

  if (queryInjection.detected) {
    logger.warn('injection_detected_query', { userId: user.id, patterns: queryInjection.patterns })
  }
  if (contextInjection.detected) {
    logger.warn('injection_detected_context', { userId: user.id, patterns: contextInjection.patterns })
  }

  const processedQuery = queryInjection.detected ? neutralizeInjection(query) : query
  const processedContext = extraContext
    ? (contextInjection.detected ? neutralizeInjection(extraContext) : extraContext)
    : undefined

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  // Resolve org_id and industry from user metadata / org record
  const orgId = (user.user_metadata?.org_id as string) ?? user.id

  let industry: string | undefined
  try {
    const { data: org } = await supabase
      .from('organisations')
      .select('industry')
      .eq('id', orgId)
      .single()
    industry = (org?.industry as string) ?? undefined
  } catch { /* use default */ }

  const pack = getPack(resolveIndustry(industry))

  // Assemble context from the knowledge graph
  let contextSummary = ''
  try {
    const briefing = await assembleContext(supabase, orgId, processedQuery)
    contextSummary = briefing.summary
  } catch (err) {
    logger.warn('[ai/text] Context assembly failed, proceeding without context:', err)
  }

  const systemParts: string[] = [
    `You are ${pack.persona.name}, an AI operations assistant for ${pack.persona.context}. ${pack.persona.systemPromptSuffix} Be concise, helpful, and action-oriented.`,
  ]
  if (contextSummary) {
    systemParts.push(`\nRelevant context from the knowledge graph:\n${contextSummary}`)
  }

  try {
    const userMessage = processedContext
      ? `${processedQuery}\n\nAdditional context:\n${processedContext}`
      : processedQuery

    const result = streamText({
      model: models.balanced,
      maxOutputTokens: 1024,
      system: systemParts.join('\n'),
      prompt: userMessage,
    })

    return result.toTextStreamResponse()
  } catch (err) {
    logger.error('[ai/text] AI SDK error:', err)
    return NextResponse.json({ error: 'Something went wrong. Try again in a moment.' }, { status: 502 })
  }
}