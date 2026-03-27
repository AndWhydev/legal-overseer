import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processWhatsAppMessage } from '@/lib/channels/whatsapp-parser'
import { transcribeVoiceNote, downloadWhatsAppMedia } from '@/lib/channels/whatsapp-voice'
import { verifyHmacSignature } from '@/lib/security/webhook-verification'
import { resolveChannelIdentity } from '@/lib/conversation/identity-resolver'
import { enrichInboundMessage } from '@/lib/conversation/inbound-enrichment'
import { logger } from '@/lib/core/logger';

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
            const value = change.value
            if (value?.messages && value.messages.length > 0) {
                // Extract phone_number_id from the webhook metadata
                const phoneNumberId: string | undefined = value.metadata?.phone_number_id

                const orgId = await resolveOrgId(supabase, phoneNumberId)
                if (!orgId) {
                    logger.error('WhatsApp webhook: skipping messages — could not resolve org_id')
                    continue
                }

                const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || ''

                for (const msg of value.messages) {
                    // Only handle text and audio message types
                    if (msg.type !== 'text' && msg.type !== 'audio') continue

                    const phone = value.contacts?.[0]?.wa_id || msg.from
                    const name = value.contacts?.[0]?.profile?.name || phone

                    let text: string
                    let isActionable = true
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const metadata: Record<string, any> = {
                        rawUrl: payload,
                        phoneNumber: phone,
                        phoneNumberId,
                    }

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
                                metadata.voice_note = true
                                metadata.original_media_id = mediaId
                            } else {
                                text = '[Voice note - transcription unavailable]'
                                metadata.voice_note = true
                                metadata.original_media_id = mediaId
                                metadata.transcription_failed = true
                                isActionable = false
                            }
                        } else {
                            text = '[Voice note - transcription unavailable]'
                            metadata.voice_note = true
                            metadata.original_media_id = mediaId
                            metadata.download_failed = true
                            isActionable = false
                        }
                    } else {
                        continue
                    }

                    // Resolve org from sender phone → contact mapping
                    let targetOrgId = orgId
                    try {
                        const resolved = await resolveChannelIdentity(supabase, {
                            channelType: 'whatsapp',
                            channelIdentifier: phone,
                        })
                        if (resolved?.orgId) {
                            targetOrgId = resolved.orgId
                        }
                    } catch {
                        // Non-fatal — fall back to config-resolved org
                    }

                    // Log the incoming message to channel_messages
                    const { data: insertedMsg, error } = await supabase
                        .from('channel_messages')
                        .insert({
                            org_id: targetOrgId,
                            channel: 'whatsapp',
                            external_id: msg.id,
                            sender: name,
                            sender_email: phone,
                            subject: 'WhatsApp Message',
                            body: text,
                            received_at: new Date(msg.timestamp * 1000).toISOString(),
                            is_actionable: isActionable,
                            priority: 'medium',
                            metadata,
                        })
                        .select('*')
                        .single()

                    if (!error && insertedMsg) {
                        const processStartMs = Date.now()

                        // Fire-and-forget: enrich with entity resolution, timeline,
                        // relationship linking (unified pipeline intelligence layer)
                        enrichInboundMessage(supabase, {
                            messageId: insertedMsg.id as string,
                            orgId: targetOrgId,
                            channel: 'whatsapp',
                            senderIdentifier: phone,
                            senderName: name,
                            subject: null,
                            body: text,
                            priority: 'medium',
                        }).catch(e => {
                            logger.error('WhatsApp enrichment failed (non-fatal):', e)
                        })

                        // Background process the message intent (existing flow:
                        // command parser -> conversation manager -> agent dispatch)
                        processWhatsAppMessage(supabase, targetOrgId, insertedMsg, text)
                            .catch(e => {
                                logger.error('Failed processing WhatsApp Message:', e)
                            })
                            .finally(() => {
                                logger.info(JSON.stringify({
                                    event: 'whatsapp_webhook_latency',
                                    orgId: targetOrgId,
                                    messageType: msg.type,
                                    insertMs: processStartMs - webhookStartMs,
                                    processMs: Date.now() - processStartMs,
                                    totalMs: Date.now() - webhookStartMs,
                                    source: 'cloud_api',
                                }))
                            })
                    } else {
                        logger.error('Failed to log WhatsApp message to database:', error)
                    }
                }
            }
        }
    }

    const webhookMs = Date.now() - webhookStartMs
    return NextResponse.json({ status: 'success' }, {
        headers: { 'X-WhatsApp-Process-Ms': String(webhookMs) },
    })
}
