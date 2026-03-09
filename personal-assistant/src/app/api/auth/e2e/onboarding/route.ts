import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service-client'

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { email } = await request.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const normalizedEmail = email.trim().toLowerCase()

  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) {
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', user.id)
    .maybeSingle<{ preferences?: Record<string, unknown> | null }>()

  if (profileError) {
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }

  const mergedPreferences = {
    ...(profile?.preferences ?? {}),
    onboarding_completed: false,
    workspace_setup_completed: false,
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      preferences: mergedPreferences,
    })
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: 'Failed to reset onboarding state' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email: normalizedEmail })
}
