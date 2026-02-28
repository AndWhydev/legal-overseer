import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { processWhatsAppMessage } from '@/lib/channels/whatsapp-parser'

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
    supabase: ReturnType<typeof createClient>,
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

        console.warn(
            `WhatsApp webhook: no channel_config found for phone_number_id=${phoneNumberId}, falling back to DEFAULT_ORG_ID`
        )
    }

    if (FALLBACK_ORG_ID) {
        return FALLBACK_ORG_ID
    }

    console.error('WhatsApp webhook: no org_id resolved and no DEFAULT_ORG_ID set')
    return null
}

export async function POST(request: Request) {
    const bodyText = await request.text()

    // Verify Webhook Signature if secret exists
    if (APP_SECRET) {
        const signature = request.headers.get('x-hub-signature-256')
        if (signature) {
            const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(bodyText).digest('hex')
            if (signature !== expected) {
                console.warn('WhatsApp webhook signature mismatch')
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
                    console.error('WhatsApp webhook: skipping messages — could not resolve org_id')
                    continue
                }

                for (const msg of value.messages) {
                    if (msg.type !== 'text') continue

                    const phone = value.contacts?.[0]?.wa_id || msg.from
                    const name = value.contacts?.[0]?.profile?.name || phone
                    const text = msg.text.body

                    // Log the raw incoming message
                    const { data: insertedMsg, error } = await supabase
                        .from('channel_messages')
                        .insert({
                            org_id: orgId,
                            channel: 'whatsapp',
                            external_id: msg.id,
                            sender: name,
                            sender_email: phone,
                            subject: 'WhatsApp Message',
                            body: text,
                            received_at: new Date(msg.timestamp * 1000).toISOString(),
                            is_actionable: true,
                            priority: 'medium',
                            metadata: {
                                rawUrl: payload,
                                phoneNumber: phone,
                                phoneNumberId,
                            }
                        })
                        .select('*')
                        .single()

                    if (!error && insertedMsg) {
                        // Background process the message intent
                        // Do not await this, let Meta Webhook receive 200 OK fast
                        processWhatsAppMessage(supabase, orgId, insertedMsg, text).catch(e => {
                            console.error('Failed processing WhatsApp Message:', e)
                        })
                    } else {
                        console.error('Failed to log WhatsApp message to database:', error)
                    }
                }
            }
        }
    }

    return NextResponse.json({ status: 'success' })
}
