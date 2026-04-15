/**
 * Sendblue Contact Card — vCard on First Touch
 *
 * Sends a BitBit vCard (.vcf) to newly verified users so the contact
 * saves natively in their phone. Sendblue renders .vcf files as
 * tappable contact cards in iMessage.
 *
 * Sent once per user, tracked via channel_identities metadata.
 */

import { sendSendblueMessage } from './sendblue'
import { uploadMediaToSendblue } from './sendblue-media'
import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Generate a VCF (vCard 3.0) string for BitBit's contact card.
 */
function generateBitBitVCard(): string {
  const fromNumber = process.env.SENDBLUE_FROM_NUMBER || ''
  // Strip + for TEL format
  const telNumber = fromNumber.replace(/[^\d+]/g, '')

  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:BitBit',
    'N:;BitBit;;;',
    'ORG:BitBit',
    `TEL;TYPE=CELL:${telNumber}`,
    'NOTE:Your personal AI assistant — text me anytime',
    'END:VCARD',
  ].join('\r\n')
}

/**
 * Check if we've already sent a contact card to this user.
 */
async function hasReceivedContactCard(
  supabase: SupabaseClient,
  orgId: string,
  phone: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('channel_identities')
    .select('metadata')
    .eq('org_id', orgId)
    .eq('channel_type', 'sms')
    .eq('channel_identifier', phone)
    .single()

  return !!(data?.metadata as Record<string, unknown>)?.contact_card_sent
}

/**
 * Mark that we sent the contact card.
 */
async function markContactCardSent(
  supabase: SupabaseClient,
  orgId: string,
  phone: string,
): Promise<void> {
  // Merge into existing metadata
  const { data: existing } = await supabase
    .from('channel_identities')
    .select('metadata')
    .eq('org_id', orgId)
    .eq('channel_type', 'sms')
    .eq('channel_identifier', phone)
    .single()

  const currentMetadata = (existing?.metadata as Record<string, unknown>) || {}

  await supabase
    .from('channel_identities')
    .update({
      metadata: { ...currentMetadata, contact_card_sent: true, contact_card_sent_at: new Date().toISOString() },
    })
    .eq('org_id', orgId)
    .eq('channel_type', 'sms')
    .eq('channel_identifier', phone)
}

/**
 * Send BitBit's contact card to a user if they haven't received one yet.
 * Called after first successful message exchange with a verified user.
 *
 * Non-blocking, non-fatal — failures are logged but don't affect messaging.
 */
export async function sendContactCardIfNeeded(
  supabase: SupabaseClient,
  orgId: string,
  phone: string,
): Promise<void> {
  try {
    if (await hasReceivedContactCard(supabase, orgId, phone)) return

    const vcfContent = generateBitBitVCard()
    const vcfBuffer = Buffer.from(vcfContent, 'utf-8')

    // Upload VCF to Sendblue CDN
    const mediaUrl = await uploadMediaToSendblue(vcfBuffer, 'bitbit.vcf', 'text/vcard')
    if (!mediaUrl) {
      logger.warn('[sendblue-contact-card] Failed to upload VCF')
      return
    }

    // Send as media message — renders as tappable contact card in iMessage
    const result = await sendSendblueMessage(phone, '', { mediaUrl })
    if (result.success) {
      await markContactCardSent(supabase, orgId, phone)
      logger.info('[sendblue-contact-card] Contact card sent', { phone, orgId })
    } else {
      logger.warn('[sendblue-contact-card] Send failed', { error: result.error })
    }
  } catch (err) {
    logger.error('[sendblue-contact-card] Error (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
