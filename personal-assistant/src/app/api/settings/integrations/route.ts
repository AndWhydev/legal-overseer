import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getOrgIntegrations,
  storeOrgCredential,
  deleteOrgCredential,
} from '@/lib/integrations/credentials'

/**
 * GET /api/settings/integrations
 * List all org integrations for the current user's organization
 */
export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 503 }
      )
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      )
    }

    const integrations = await getOrgIntegrations(supabase, profile.org_id)

    return NextResponse.json({ integrations })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred'
    logger.error('GET integrations error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/settings/integrations
 * Store API key credentials for an integration
 * Body: { provider: string, credentials: Record<string, unknown> }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 503 }
      )
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      )
    }

    const body = (await request.json()) as {
      provider: string
      credentials: Record<string, unknown>
    }

    if (!body.provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      )
    }

    if (!body.credentials) {
      return NextResponse.json(
        { error: 'Credentials are required' },
        { status: 400 }
      )
    }

    // Validate credentials based on provider
    validateCredentials(body.provider, body.credentials)

    // Store the credentials
    await storeOrgCredential(
      supabase,
      profile.org_id,
      body.provider,
      body.credentials,
      user.id
    )

    return NextResponse.json(
      {
        success: true,
        message: `${body.provider} integration connected`,
      },
      { status: 201 }
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred'
    logger.error('POST integrations error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/settings/integrations
 * Disconnect an integration
 * Body: { provider: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 503 }
      )
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      )
    }

    const body = (await request.json()) as {
      provider: string
    }

    if (!body.provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      )
    }

    await deleteOrgCredential(supabase, profile.org_id, body.provider)

    return NextResponse.json({
      success: true,
      message: `${body.provider} integration disconnected`,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred'
    logger.error('DELETE integrations error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Validate credentials based on provider type
 */
function validateCredentials(
  provider: string,
  credentials: Record<string, unknown>
): void {
  // API key providers
  if (['stripe', 'resend'].includes(provider)) {
    if (!credentials.api_key) {
      throw new Error(`${provider} requires an api_key`)
    }
    if (typeof credentials.api_key !== 'string') {
      throw new Error(`${provider} api_key must be a string`)
    }
    if (credentials.api_key.length < 10) {
      throw new Error(`${provider} api_key appears to be invalid`)
    }
  }
}
