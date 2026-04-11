import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'
import crypto from 'crypto'

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, userId: user.id, orgId: profile.org_id }
}

function generateApiKey(): string {
  return `sk_${crypto.randomBytes(32).toString('hex')}`
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export async function GET(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data, error } = await ctx.supabase
      .from('api_keys')
      .select('id, name, last_4, scopes, last_used_at, created_at, revoked_at')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('[api-keys] Failed to list keys:', error)
      return NextResponse.json(
        { error: 'Failed to fetch API keys' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      keys: (data || []).map((key) => ({
        id: key.id,
        name: key.name,
        displayKey: `****${key.last_4}`,
        scopes: key.scopes,
        lastUsedAt: key.last_used_at,
        createdAt: key.created_at,
        isRevoked: key.revoked_at !== null,
      })),
    })
  } catch (err) {
    logger.error('[api-keys] List failed:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Try again in a moment.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()

    if (!body.name) {
      return NextResponse.json(
        { error: 'Key name is required' },
        { status: 400 }
      )
    }

    const scopes = body.scopes || ['read']
    const apiKey = generateApiKey()
    const keyHash = hashKey(apiKey)
    const last4 = apiKey.slice(-4)

    const { data, error } = await ctx.supabase
      .from('api_keys')
      .insert({
        org_id: ctx.orgId,
        name: body.name,
        key_hash: keyHash,
        last_4: last4,
        scopes,
      })
      .select()
      .single()

    if (error) {
      logger.error('[api-keys] Failed to create key:', error)
      return NextResponse.json(
        { error: 'Failed to create API key' },
        { status: 500 }
      )
    }

    logger.info('[api-keys] New API key created', {
      keyId: data.id,
      keyName: data.name,
    })

    return NextResponse.json(
      {
        id: data.id,
        name: data.name,
        key: apiKey,
        displayKey: `****${last4}`,
        scopes: data.scopes,
        createdAt: data.created_at,
        warning: 'Store this key safely. You will not be able to see it again.',
      },
      { status: 201 }
    )
  } catch (err) {
    logger.error('[api-keys] Create failed:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Try again in a moment.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()

    if (!body.keyId) {
      return NextResponse.json(
        { error: 'Key ID is required' },
        { status: 400 }
      )
    }

    // Verify key belongs to this org
    const { data: key } = await ctx.supabase
      .from('api_keys')
      .select('id, org_id')
      .eq('id', body.keyId)
      .single()

    if (!key || key.org_id !== ctx.orgId) {
      return NextResponse.json(
        { error: 'Key not found' },
        { status: 404 }
      )
    }

    // Soft delete by setting revoked_at
    const { error } = await ctx.supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', body.keyId)

    if (error) {
      logger.error('[api-keys] Failed to revoke key:', error)
      return NextResponse.json(
        { error: 'Failed to revoke API key' },
        { status: 500 }
      )
    }

    logger.info('[api-keys] API key revoked', { keyId: body.keyId })

    return NextResponse.json({
      success: true,
      message: 'API key revoked successfully',
    })
  } catch (err) {
    logger.error('[api-keys] Delete failed:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Try again in a moment.' },
      { status: 500 }
    )
  }
}
