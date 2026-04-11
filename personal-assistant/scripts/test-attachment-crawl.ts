/**
 * Test: Crawl emails with attachment processing
 * Specifically targets invoice emails to extract bank details and formats.
 */
import { config } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

import { createClient } from '@supabase/supabase-js'
import { getOrgCredential, storeOrgCredential } from '../src/lib/integrations/credentials'
import { fetchFullGmailMessage, processMessageAttachments } from '../src/lib/channels/gmail-attachments'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ORG = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'

async function main() {
  console.log('=== Attachment Processing Test ===\n')

  // Get Gmail token
  const creds = await getOrgCredential(supabase, ORG, 'gmail')
  if (!creds) { console.error('No Gmail creds'); process.exit(1) }

  let token = creds.access_token as string
  const refreshToken = creds.refresh_token as string
  const clientId = (creds.client_id as string) || process.env.GOOGLE_CLIENT_ID!
  const clientSecret = (creds.client_secret as string) || process.env.GOOGLE_CLIENT_SECRET!

  // Refresh token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  if (res.ok) {
    const d = await res.json() as { access_token: string }
    token = d.access_token
    console.log('Token refreshed\n')
  }

  // Search for sent invoice emails
  console.log('Searching for sent invoice emails...')
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent('in:sent invoice has:attachment')}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const list = await listRes.json() as { messages?: { id: string }[] }
  console.log(`Found ${list.messages?.length ?? 0} messages\n`)

  if (!list.messages?.length) {
    console.log('No invoice emails with attachments found')
    process.exit(0)
  }

  // Process each one
  for (const item of list.messages.slice(0, 5)) {
    console.log(`--- Message ${item.id} ---`)

    const full = await fetchFullGmailMessage(token, item.id)
    if (!full) { console.log('  Could not fetch full message'); continue }

    // Extract headers from body
    const subjectLine = full.body.split('\n').find(l => l.includes('Invoice') || l.includes('invoice')) ?? full.body.slice(0, 80)
    console.log(`  Subject/Preview: ${subjectLine.slice(0, 80)}`)
    console.log(`  Has attachments: ${full.hasAttachments}`)
    console.log(`  Body length: ${full.body.length} chars`)

    if (full.hasAttachments) {
      console.log('  Processing attachments...')
      const extracted = await processMessageAttachments(token, item.id, full.parts)
      for (const att of extracted) {
        console.log(`  📎 ${att.filename} (${att.mimeType}, ${att.sizeBytes} bytes)`)
        console.log(`     Extracted text: ${att.extractedText.slice(0, 300)}...`)

        // Store as memory if it contains bank details
        if (att.extractedText.toLowerCase().includes('bsb') || att.extractedText.toLowerCase().includes('account')) {
          console.log('     ⚡ Contains bank details — storing as memory')
          await supabase.from('semantic_memories').insert({
            org_id: ORG,
            content: `[invoice-template] Extracted from ${att.filename}:\n${att.extractedText.slice(0, 2000)}`,
            category: 'financial',
            confidence: 0.95,
            is_active: true,
            decay_rate: 'never',
          })
        }
      }
      if (extracted.length === 0) {
        console.log('  No processable attachments')
      }
    }
    console.log()
  }

  console.log('=== Done ===')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
