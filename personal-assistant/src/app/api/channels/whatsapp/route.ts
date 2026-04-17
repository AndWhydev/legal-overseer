import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { transcribeVoiceNote, downloadWhatsAppMedia } from '@/lib/channels/whatsapp-voice'
import { verifyHmacSignature } from '@/lib/security/webhook-verification'
import { resolveChannelIdentity } from '@/lib/conversation/identity-resolver'
import { handleGatewayMessage } from '@/lib/channels/gateway-handler'
import { sendMessage as sendWhatsAppMessage } from '@/lib/channels/whatsapp'
import { logger } from '@/lib/core/logger'

// Allow up to 60s for agent engine response
export const maxDuration = 60

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN
const APP_SECRET = process.env.WHATSAPP_APP_SECRET
const FALLBACK_ORG_ID = process.env.DEFAULT_ORG_ID

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return new NextResponse(challenge, { status: 200 })
    }
    return new NextResponse('Forbidden', { status: 403 })
}

/**
 * Resolve org_id from the phone_number_id in the webhook payload
 * by looking up channel_configs. Falls back to env DEFAULT_ORG_ID.
 */
 
async function resolveOrgId(
    supabase: any,
    phoneNumberId: string | undefined
): Promise<string | null> {
    if (phoneNumberId) {
        const { data } = await supabase
            .from('channel_configs' as any)
            .select('org_id')
            .eq('channel', 'whatsapp')
            .eq('external_id', phoneNumberId)
            .single() as { data: { org_id?: string } | null }

        if (data?.org_id) {
            return data.org_id
        }

        logger.warn(
            `WhatsApp webhook: no channel_config found for phone_number_id=${phoneNumberId}, falling back to DEFAULT_ORG_ID`
        )
    }

    if (FALLBACK_ORG_ID) {
        return FALLBACK_ORG_ID
    }

    logger.error('WhatsApp webhook: no org_id resolved and no DEFAULT_ORG_ID set')
    return null
}

export async function POST(request: Request) {
    const webhookStartMs = Date.now()
    const bodyText = await request.text()

    // Verify Webhook Signature if secret exists (timing-safe comparison)
    if (APP_SECRET) {
        const signature = request.headers.get('x-hub-signature-256')
        if (signature) {
            const isValid = verifyHmacSignature(bodyText, signature, APP_SECRET, 'sha256=')
            if (!isValid) {
                logger.warn('WhatsApp webhook signature mismatch')
                return new NextResponse('Invalid signature', { status: 401 })
            }
        }
    }

    let payload
    try {
        payload = JSON.parse(bodyText)
    } catch {
        return new NextResponse('Invalid JSON', { status: 400 })
    }

    if (payload.object !== 'whatsapp_business_account') {
        return new NextResponse('Not a WhatsApp payload', { status: 404 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Collect all messages to process in after()
    const messagesToProcess: Array<{
        phone: string
        name: string
        text: string
        orgId: string
        identity: { userId: string; orgId: string; displayName?: string } | null
    }> = []

    for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
            const value = change.value
            if (value?.messages && value.messages.length > 0) {
                const phoneNumberId: string | undefined = value.metadata?.phone_number_id

                const orgId = await resolveOrgId(supabase, phoneNumberId)
                if (!orgId) {
                    logger.error('WhatsApp webhook: skipping messages — could not resolve org_id')
                    continue
                }

                const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || ''

                // Look up our own phone number to filter outbound echo messages
                let ownNumber: string | null = null
                if (phoneNumberId) {
                    const { data: config } = await supabase
                        .from('channel_configs' as any)
                        .select('external_id, metadata')
                        .eq('org_id', orgId)
                        .eq('channel', 'whatsapp')
                        .maybeSingle() as { data: { external_id?: string; metadata?: Record<string, unknown> } | null }

                    ownNumber = (config?.metadata as any)?.display_phone_number?.replace(/\D/g, '') ?? null
                }

                for (const msg of value.messages) {
                    // Only handle text and audio message types
                    if (msg.type !== 'text' && msg.type !== 'audio') continue

                    // Skip outbound echo messages
                    if (ownNumber && msg.from === ownNumber) {
                        logger.info(JSON.stringify({
                            event: 'whatsapp_outbound_skipped',
                            orgId,
                            from: msg.from,
                            ownNumber,
                            source: 'cloud_api',
                        }))
                        continue
                    }

                    const phone = value.contacts?.[0]?.wa_id || msg.from
                    const name = value.contacts?.[0]?.profile?.name || phone

                    let text: string

                    if (msg.type === 'text') {
                        text = msg.text.body
                    } else if (msg.type === 'audio') {
                        // Download audio from Meta Cloud API and transcribe via Whisper
                        const mediaId = msg.audio?.id as string | undefined
                        const mimeType = (msg.audio?.mime_type as string) || 'audio/ogg'

                        if (!mediaId) {
                            logger.warn('WhatsApp webhook: audio message missing media ID')
                            continue
                        }

                        const audioBuffer = await downloadWhatsAppMedia(mediaId, accessToken)
                        if (audioBuffer) {
                            const transcription = await transcribeVoiceNote(audioBuffer, mimeType)
                            if (transcription) {
                                text = transcription
                            } else {
                                logger.warn('WhatsApp webhook: voice note transcription failed')
                                continue
                            }
                        } else {
                            logger.warn('WhatsApp webhook: voice note download failed')
                            continue
                        }
                    } else {
                        continue
                    }

                    // Resolve identity from sender phone
                    let identity: { userId: string; orgId: string; displayName?: string } | null = null
                    try {
                        const resolved = await resolveChannelIdentity(supabase, {
                            channelType: 'whatsapp',
                            channelIdentifier: phone,
                        })
                        if (resolved) {
                            identity = {
                                userId: resolved.userId,
                                orgId: resolved.orgId,
                                displayName: resolved.displayName,
                            }
                        }
                    } catch {
                        // Non-fatal — will use fallback org below
                    }

                    messagesToProcess.push({
                        phone,
                        name,
                        text,
                        orgId,
                        identity,
                    })
                }
            }
        }
    }

    // Use after() to process messages after returning 200 to Meta
    if (messagesToProcess.length > 0) {
        after(async () => {
            for (const { phone, name, text, orgId, identity } of messagesToProcess) {
                if (!identity) {
                    logger.warn(`[webhook/whatsapp] No identity resolved for phone=${phone}`)
                    await sendWhatsAppMessage(
                        phone,
                        "I don't recognize this number yet — link your WhatsApp in BitBit settings to get started",
                    ).catch(() => {})
                    continue
                }

                try {
                    await handleGatewayMessage({
                        channel: 'whatsapp',
                        text,
                        identity: {
                            userId: identity.userId,
                            orgId: identity.orgId,
                            displayName: identity.displayName ?? name,
                        },
                        replyTo: phone,
                    })
                } catch (err) {
                    logger.error('[webhook/whatsapp] Gateway handler background error', {
                        error: err instanceof Error ? err.message : String(err),
                    })
                }

                logger.info(JSON.stringify({
                    event: 'whatsapp_webhook_processed',
                    orgId: identity.orgId,
                    totalMs: Date.now() - webhookStartMs,
                    source: 'cloud_api',
                }))
            }
        })
    }

    return NextResponse.json({ status: 'success' }, {
        headers: { 'X-WhatsApp-Process-Ms': String(Date.now() - webhookStartMs) },
    })
}
