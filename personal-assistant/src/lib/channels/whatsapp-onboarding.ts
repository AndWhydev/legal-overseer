/**
 * WhatsApp Gateway Onboarding — Self-serve phone linking
 *
 * State machine for unknown numbers messaging the BitBit WhatsApp gateway:
 *   1. Unknown number texts → ask for email
 *   2. User replies with email → look up user in auth.users
 *   3. If found → send 6-digit OTP via WhatsApp
 *   4. User texts OTP back → link channel_identity as verified
 *
 * Uses in-memory store with TTL. Pending registrations expire after 10 minutes.
 * Production: migrate to Redis or Supabase table for multi-instance.
 */

import { sendTelnyxWhatsApp, normalizeWhatsAppNumber } from './telnyx-whatsapp'
import { linkChannelIdentity } from '@/lib/conversation/identity-resolver'
import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

const OTP_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 3
const MAX_PENDING_PER_NUMBER = 3
const COOLDOWN_MS = 60 * 60 * 1000

interface PendingRegistration {
  phone: string
  email?: string
  userId?: string
  orgId?: string
  displayName?: string
  otp?: string
  otpAttempts: number
  registrationAttempts: number
  state: 'awaiting_email' | 'awaiting_otp'
  createdAt: number
  cooldownUntil?: number
}

const pendingRegistrations = new Map<string, PendingRegistration>()

// Cleanup expired registrations every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [phone, reg] of pendingRegistrations) {
    if (now - reg.createdAt > OTP_TTL_MS && !reg.cooldownUntil) {
      pendingRegistrations.delete(phone)
    }
    if (reg.cooldownUntil && now > reg.cooldownUntil) {
      pendingRegistrations.delete(phone)
    }
  }
}, 5 * 60 * 1000)

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 255
}

/**
 * Handle an inbound message from an unknown (unlinked) phone number.
 * Returns true if the onboarding flow handled it, false to pass through.
 */
export async function handleUnknownSender(
  supabase: SupabaseClient,
  phone: string,
  content: string,
): Promise<boolean> {
  const normalized = normalizeWhatsAppNumber(phone)
  const existing = pendingRegistrations.get(normalized)

  // Check cooldown
  if (existing?.cooldownUntil && Date.now() < existing.cooldownUntil) {
    logger.info('[whatsapp-onboarding] Number in cooldown, ignoring', { phone: normalized })
    return true
  }

  // State: no pending registration → start one
  if (!existing || (Date.now() - existing.createdAt > OTP_TTL_MS)) {
    const prevAttempts = existing?.registrationAttempts ?? 0
    if (prevAttempts >= MAX_PENDING_PER_NUMBER) {
      pendingRegistrations.set(normalized, {
        phone: normalized,
        otpAttempts: 0,
        registrationAttempts: prevAttempts,
        state: 'awaiting_email',
        createdAt: Date.now(),
        cooldownUntil: Date.now() + COOLDOWN_MS,
      })
      logger.warn('[whatsapp-onboarding] Max registration attempts, cooling down', { phone: normalized })
      return true
    }

    pendingRegistrations.set(normalized, {
      phone: normalized,
      otpAttempts: 0,
      registrationAttempts: prevAttempts + 1,
      state: 'awaiting_email',
      createdAt: Date.now(),
    })

    await sendTelnyxWhatsApp(
      normalized,
      "hey! don't recognize this number yet\n\nwhat's your email so i can link you up?",
    )
    return true
  }

  // State: awaiting_email → user should reply with an email
  if (existing.state === 'awaiting_email') {
    const trimmed = content.trim().toLowerCase()

    if (!isValidEmail(trimmed)) {
      await sendTelnyxWhatsApp(normalized, "that doesn't look like an email — try again?")
      return true
    }

    // Look up user by email (Supabase admin API has no getUserByEmail; filter listUsers)
    const { data: userList, error: listErr } = await supabase.auth.admin.listUsers()
    if (listErr) {
      logger.error('[whatsapp-onboarding] listUsers failed', { err: listErr.message })
      await sendTelnyxWhatsApp(normalized, 'something went wrong — try again in a moment')
      return true
    }
    const user = userList.users.find((u) => u.email?.toLowerCase() === trimmed)

    if (!user) {
      await sendTelnyxWhatsApp(
        normalized,
        "can't find that email in bitbit — sign up at app.bitbit.chat first, then try again",
      )
      return true
    }

    // Find user's org
    const { data: membership } = await supabase
      .from('org_members')
      .select('org_id, orgs(name)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      await sendTelnyxWhatsApp(normalized, "found your account but no org set up yet — finish setup at app.bitbit.chat")
      return true
    }

    // Generate and send OTP
    const otp = generateOtp()
    existing.email = trimmed
    existing.userId = user.id
    existing.orgId = membership.org_id
    existing.displayName = user.user_metadata?.full_name || user.email?.split('@')[0]
    existing.otp = otp
    existing.state = 'awaiting_otp'
    existing.createdAt = Date.now()

    await sendTelnyxWhatsApp(normalized, `your code is ${otp}\n\ntext it back to link this number`)

    logger.info('[whatsapp-onboarding] OTP sent', { phone: normalized, email: trimmed })
    return true
  }

  // State: awaiting_otp → user should reply with the OTP
  if (existing.state === 'awaiting_otp') {
    const trimmed = content.trim().replace(/\s/g, '')

    if (trimmed !== existing.otp) {
      existing.otpAttempts++
      if (existing.otpAttempts >= MAX_ATTEMPTS) {
        pendingRegistrations.delete(normalized)
        await sendTelnyxWhatsApp(normalized, "too many wrong codes — text me again to start over")
        return true
      }
      const remaining = MAX_ATTEMPTS - existing.otpAttempts
      await sendTelnyxWhatsApp(normalized, `wrong code — ${remaining} ${remaining === 1 ? 'try' : 'tries'} left`)
      return true
    }

    // OTP matches — link the identity
    const linked = await linkChannelIdentity(
      supabase,
      existing.userId!,
      existing.orgId!,
      { channelType: 'whatsapp', channelIdentifier: normalized },
      { displayName: existing.displayName, verified: true },
    )

    pendingRegistrations.delete(normalized)

    if (linked) {
      await sendTelnyxWhatsApp(normalized, "linked ✓\n\nyou're all set — message me anytime")
      logger.info('[whatsapp-onboarding] Phone linked successfully', {
        phone: normalized,
        userId: existing.userId,
        orgId: existing.orgId,
      })
    } else {
      await sendTelnyxWhatsApp(normalized, "something went wrong linking — try again in a bit")
      logger.error('[whatsapp-onboarding] linkChannelIdentity failed', { phone: normalized })
    }

    return true
  }

  return false
}

/**
 * Check if a phone number has a pending registration.
 */
export function hasPendingRegistration(phone: string): boolean {
  const normalized = normalizeWhatsAppNumber(phone)
  const reg = pendingRegistrations.get(normalized)
  if (!reg) return false
  if (Date.now() - reg.createdAt > OTP_TTL_MS) {
    pendingRegistrations.delete(normalized)
    return false
  }
  return true
}
