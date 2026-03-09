import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service-client'

const MIN_PASSWORD_LENGTH = 6

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { email, password } = await request.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: 'Password is too short' }, { status: 400 })
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

  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password,
  })

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email: normalizedEmail })
}
