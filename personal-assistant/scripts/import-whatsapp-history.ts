#!/usr/bin/env npx tsx
/**
 * WhatsApp History Importer
 *
 * Parses WhatsApp chat export .txt files and imports them into channel_messages.
 * Also enqueues messages for RAG embedding.
 *
 * Usage: npx tsx scripts/import-whatsapp-history.ts <chat_file.txt> <org_id> [--contact-name "Name"] [--contact-phone "+61..."]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://johvduasrhmufrfdxjus.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY required. Run with: source .env.local && npx tsx scripts/import-whatsapp-history.ts ...')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// WhatsApp export format: [DD/MM/YYYY, HH:MM:SS am/pm] Sender: Message
// Multi-line messages continue without the timestamp prefix
const MESSAGE_PATTERN = /^\[(\d{1,2}\/\d{1,2}\/\d{4}),\s*(\d{1,2}:\d{2}:\d{2}\s*[ap]m)\]\s*([^:]+):\s*(.*)/i

interface ParsedMessage {
  timestamp: Date
  sender: string
  content: string
  isSystem: boolean
}

function parseWhatsAppExport(filePath: string): ParsedMessage[] {
  const raw = readFileSync(filePath, 'utf-8')
  const lines = raw.split('\n')
  const messages: ParsedMessage[] = []
  let currentMsg: ParsedMessage | null = null

  for (const line of lines) {
    const match = line.match(MESSAGE_PATTERN)
    if (match) {
      // Save previous message
      if (currentMsg) messages.push(currentMsg)

      const [, datePart, timePart, sender, content] = match

      // Parse date: DD/MM/YYYY
      const [day, month, year] = datePart.split('/')
      const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`

      // Parse time: H:MM:SS am/pm
      const timeClean = timePart.trim()
      const timestamp = new Date(`${dateStr} ${timeClean}`)

      // Detect system messages (media, encryption notices, etc.)
      const isSystem = content.startsWith('\u200e') || // Left-to-right mark (WhatsApp system prefix)
        content.includes('Messages and calls are end-to-end encrypted') ||
        content === '<Media omitted>' ||
        content.includes('missed voice call') ||
        content.includes('missed video call') ||
        content.includes('deleted this message') ||
        content.includes('changed the subject') ||
        content.includes('changed this group')

      currentMsg = {
        timestamp,
        sender: sender.trim(),
        content: content.replace(/^\u200e/, '').trim(),
        isSystem,
      }
    } else if (currentMsg && line.trim()) {
      // Continuation of multi-line message
      currentMsg.content += '\n' + line.trim()
    }
  }

  // Don't forget the last message
  if (currentMsg) messages.push(currentMsg)

  return messages
}

function contentHash(content: string, sender: string, timestamp: string): string {
  return createHash('sha256').update(`${sender}:${timestamp}:${content}`).digest('hex').slice(0, 16)
}

async function importMessages(
  filePath: string,
  orgId: string,
  contactName?: string,
  contactPhone?: string,
) {
  console.log(`Parsing ${filePath}...`)
  const messages = parseWhatsAppExport(filePath)

  // Filter out system messages and very short messages
  const meaningful = messages.filter(m => !m.isSystem && m.content.length > 2)
  console.log(`Parsed ${messages.length} total, ${meaningful.length} meaningful messages`)

  if (meaningful.length === 0) {
    console.log('No messages to import')
    return
  }

  // Detect participants
  const senders = new Set(meaningful.map(m => m.sender))
  console.log(`Participants: ${[...senders].join(', ')}`)

  // Determine which sender is the user (Tor) vs the contact
  const torNames = ['Tor', 'You', 'Torrin']
  const userSender = [...senders].find(s => torNames.some(t => s.toLowerCase().includes(t.toLowerCase())))
  const contactSenders = [...senders].filter(s => s !== userSender)

  console.log(`User: ${userSender || 'unknown'}`)
  console.log(`Contact(s): ${contactSenders.join(', ')}`)

  const effectiveContactName = contactName || contactSenders[0] || 'Unknown'

  // Import in batches
  let inserted = 0
  let skipped = 0
  let enqueued = 0
  const BATCH_SIZE = 50

  for (let i = 0; i < meaningful.length; i += BATCH_SIZE) {
    const batch = meaningful.slice(i, i + BATCH_SIZE)
    const rows = batch.map(m => {
      const hash = contentHash(m.content, m.sender, m.timestamp.toISOString())
      const isFromUser = m.sender === userSender
      return {
        org_id: orgId,
        channel: 'whatsapp',
        external_id: `wa-import-${hash}`,
        sender: isFromUser ? 'You' : m.sender,
        sender_email: null,
        subject: null,
        body: m.content.slice(0, 200),
        body_full: m.content,
        received_at: m.timestamp.toISOString(),
        is_actionable: false,
        priority: 'medium',
        processed: false,
        metadata: {
          source: 'whatsapp_import',
          contact_name: effectiveContactName,
          contact_phone: contactPhone || null,
          original_sender: m.sender,
          direction: isFromUser ? 'outbound' : 'inbound',
        },
        content_hash: hash,
      }
    })

    // Check for existing external_ids to avoid duplicates
    const externalIds = rows.map(r => r.external_id)
    const { data: existing } = await supabase
      .from('channel_messages')
      .select('external_id')
      .eq('org_id', orgId)
      .in('external_id', externalIds)
    const existingSet = new Set((existing ?? []).map(e => e.external_id))
    const newRows = rows.filter(r => !existingSet.has(r.external_id))

    if (newRows.length === 0) {
      skipped += batch.length
      process.stdout.write(`\r  Progress: ${Math.min(i + BATCH_SIZE, meaningful.length)}/${meaningful.length} messages`)
      continue
    }

    const { data, error } = await supabase
      .from('channel_messages')
      .insert(newRows)
      .select('id')

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message)
      skipped += batch.length
    } else {
      inserted += data?.length || 0
      skipped += batch.length - (data?.length || 0)

      // Enqueue for RAG embedding
      for (const msg of batch) {
        if (msg.content.length > 20) {
          const hash = contentHash(msg.content, msg.sender, msg.timestamp.toISOString())
          const msgId = `wa-import-${hash}`
          await supabase.from('embedding_jobs').upsert({
            org_id: orgId,
            message_id: msgId,
            content: msg.content,
            metadata: {
              message_id: msgId,
              org_id: orgId,
              channel: 'whatsapp',
              sender: msg.sender === userSender ? 'You' : msg.sender,
              received_at: msg.timestamp.toISOString(),
              chunk_index: 0,
              total_chunks: 1,
              is_full_body: true,
            },
            status: 'pending',
          }, { onConflict: 'org_id,message_id' }).then(({ error: eqErr }) => {
            if (!eqErr) enqueued++
          })
        }
      }
    }

    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH_SIZE, meaningful.length)}/${meaningful.length} messages`)
  }

  console.log(`\n\nImport complete:`)
  console.log(`  Inserted: ${inserted}`)
  console.log(`  Skipped (duplicates): ${skipped}`)
  console.log(`  Enqueued for embedding: ${enqueued}`)
  console.log(`  Contact: ${effectiveContactName}`)
}

// Parse CLI args
const args = process.argv.slice(2)
if (args.length < 2) {
  console.log('Usage: npx tsx scripts/import-whatsapp-history.ts <chat_file.txt> <org_id> [--contact-name "Name"] [--contact-phone "+61..."]')
  process.exit(1)
}

const filePath = args[0]
const orgId = args[1]
const contactNameIdx = args.indexOf('--contact-name')
const contactPhoneIdx = args.indexOf('--contact-phone')
const contactName = contactNameIdx >= 0 ? args[contactNameIdx + 1] : undefined
const contactPhone = contactPhoneIdx >= 0 ? args[contactPhoneIdx + 1] : undefined

importMessages(filePath, orgId, contactName, contactPhone).catch(console.error)
