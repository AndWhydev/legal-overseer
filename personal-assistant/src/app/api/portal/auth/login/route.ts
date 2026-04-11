import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const body = await request.json()
  const email = body.email?.trim()?.toLowerCase()
  const next = body.next ?? '/portal'

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  // Verify this email has portal access
  const { data: access } = await supabase
    .from('portal_access')
    .select('id, status')
    .eq('email', email)
    .in('status', ['invited', 'active'])
    .limit(1)
    .single()

  if (!access) {
    return NextResponse.json(
      { error: 'No portal access found for this email. Please contact your agency.' },
      { status: 403 }
    )
  }

  // Send magic link
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bitbit.chat'}/auth/confirm?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  })

  if (otpError) {
    return NextResponse.json({ error: otpError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
