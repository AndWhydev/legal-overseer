import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

/**
 * Initialize Supabase client
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured')
  }

  return createClient(supabaseUrl, supabaseKey)
}

/**
 * Query parameters for filtering
 */
interface QueryParams {
  source?: string
  status?: string
  event_type?: string
  limit?: number
  offset?: number
  start_date?: string
  end_date?: string
}

/**
 * Parse query parameters
 */
function parseQueryParams(request: NextRequest): QueryParams {
  const url = new URL(request.url)
  return {
    source: url.searchParams.get('source') || undefined,
    status: url.searchParams.get('status') || undefined,
    event_type: url.searchParams.get('event_type') || undefined,
    limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 50,
    offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!, 10) : 0,
    start_date: url.searchParams.get('start_date') || undefined,
    end_date: url.searchParams.get('end_date') || undefined,
  }
}

/**
 * GET /api/webhooks/events
 * List recent webhook events with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const params = parseQueryParams(request)

    // Build query
    let query = supabase
      .from('webhook_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Apply filters
    if (params.source) {
      query = query.eq('source', params.source)
    }
    if (params.status) {
      query = query.eq('status', params.status)
    }
    if (params.event_type) {
      query = query.eq('event_type', params.event_type)
    }
    if (params.start_date) {
      query = query.gte('created_at', params.start_date)
    }
    if (params.end_date) {
      query = query.lte('created_at', params.end_date)
    }

    // Apply pagination
    query = query.range(params.offset || 0, (params.offset || 0) + (params.limit || 50) - 1)

    const { data: events, error, count } = await query

    if (error) {
      logger.error('[webhooks/events] Query failed:', error.message)
      return NextResponse.json({ error: 'Failed to fetch webhook events' }, { status: 500 })
    }

    return NextResponse.json({
      events: events || [],
      count: count || 0,
      limit: params.limit || 50,
      offset: params.offset || 0,
    })
  } catch (err) {
    logger.error('[webhooks/events] Error in GET:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/webhooks/events
 * Log a webhook event (internal use by webhook handlers)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()

    const {
      org_id,
      source,
      event_type,
      external_event_id,
      payload,
      status = 'processing',
      response_code,
      error_message,
    } = body

    if (!source || !event_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: event, error } = await supabase.from('webhook_events').insert({
      org_id: org_id || null,
      source,
      event_type,
      external_event_id,
      payload: payload || {},
      status,
      response_code,
      error_message,
      processed_at: status === 'success' || status === 'failed' ? new Date().toISOString() : null,
    })

    if (error) {
      logger.error('[webhooks/events] Insert failed:', error.message)
      return NextResponse.json({ error: 'Failed to log webhook event' }, { status: 500 })
    }

    return NextResponse.json({ event }, { status: 201 })
  } catch (err) {
    logger.error('[webhooks/events] Error in POST:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
