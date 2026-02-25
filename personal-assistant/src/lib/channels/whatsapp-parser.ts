import type { SupabaseClient } from '@supabase/supabase-js'
import { assembleContext } from '@/lib/context/assembler'
import { classifyMessage } from '@/lib/agent/classifier'
import { sendMessage, parseApprovalReply } from './whatsapp'

export async function processWhatsAppMessage(
    supabase: SupabaseClient,
    orgId: string,
    messageRow: any,
    text: string
) {
    const phoneNumber = messageRow.sender_email // Reusing sender_email for phone in DB

    // 1. Check if it's an Approval workflow (Y/N/1Y/2N)
    const approval = parseApprovalReply(text)
    if (approval) {
        // In a full implementation, this triggers a queue unblock
        const responseText = approval.type === 'indexed'
            ? `Received decision '${approval.decision}' for item ${approval.index}`
            : `Received decision '${approval.decision}'`

        await sendMessage(phoneNumber, `[BitBit] ${responseText}`)
        return
    }

    // 2. Generic Natural Language Parser - Entity Resolution
    const context = await assembleContext(supabase, orgId, text)

    // 3. Command Intent Classification
    const classification = await classifyMessage(supabase, {
        id: messageRow.id,
        channel: 'whatsapp',
        externalId: messageRow.external_id,
        sender: messageRow.sender,
        senderEmail: phoneNumber,
        body: text,
        receivedAt: new Date(messageRow.received_at),
        isActionable: true,
        priority: 'medium',
        metadata: {}
    }, orgId)

    // 4. Draft a context-aware response testing the linkage
    const entitiesFound = context.resolvedEntities.length > 0
        ? `Identified: ${context.resolvedEntities.map(e => e.name).join(', ')}`
        : `No specific contacts identified in my database.`

    const replyText =
        `[BitBit] Context Engine active.\n` +
        `${entitiesFound}\n` +
        `Intent Class: ${classification.category} (Priority: ${classification.significance}/10)`

    await sendMessage(phoneNumber, replyText)
}
