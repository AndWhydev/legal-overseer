import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type PreferencesPayload = {
  autonomyLevel?: 'low' | 'medium' | 'high'
  communicationStyle?: 'concise' | 'balanced' | 'detailed'
  defaultEmailAction?: 'draft' | 'send' | 'review'
}

function normalizePreferences(input: unknown) {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const autonomy = source.autonomyLevel
  const communication = source.communicationStyle
  const emailAction = source.defaultEmailAction

  return {
    autonomyLevel: autonomy === 'low' || autonomy === 'medium' || autonomy === 'high' ? autonomy : 'medium',
    communicationStyle:
      communication === 'concise' || communication === 'balanced' || communication === 'detailed'
        ? communication
        : 'concise',
    defaultEmailAction:
      emailAction === 'draft' || emailAction === 'send' || emailAction === 'review' ? emailAction : 'draft',
  }
}

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, preferences')
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    profile: {
      displayName: profile?.display_name ?? '',
      email: user.email ?? '',
      preferences: normalizePreferences(profile?.preferences),
    },
  })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as { displayName?: string; preferences?: PreferencesPayload }

  const updates: Record<string, unknown> = {}

  if (typeof body.displayName === 'string') {
    updates.display_name = body.displayName.trim()
  }

  if (body.preferences) {
    updates.preferences = normalizePreferences(body.preferences)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('display_name, preferences')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    profile: {
      displayName: data.display_name ?? '',
      email: user.email ?? '',
      preferences: normalizePreferences(data.preferences),
    },
  })
}
