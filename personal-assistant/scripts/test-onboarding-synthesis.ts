/**
 * Onboarding Synthesis Proof-of-Concept
 *
 * Tests the "holy shit" moment: pull 6 months of real email,
 * feed to Opus, produce a world model.
 *
 * Usage: npx tsx scripts/test-onboarding-synthesis.ts
 */

import { config } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
const __dir = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dir, '../.env.local') })

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createDecipheriv, scryptSync } from 'crypto'

function decryptCredential(encrypted: string): string {
  const key = scryptSync(process.env.CREDENTIALS_KEY!, 'bitbit-integration-salt', 32)
  const [ivB64, authTagB64, ciphertext] = encrypted.split(':')
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ORG = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'

interface GmailMessage {
  id: string
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  body?: string
}

async function getGmailToken(): Promise<string | null> {
  // Get encrypted credentials from channel_connections
  const { data } = await supabase
    .from('channel_connections')
    .select('config')
    .eq('org_id', ORG)
    .eq('channel_type', 'gmail')
    .single()

  if (!data?.config?.credentials_encrypted) {
    // Try org_credentials table
    const { data: orgCred } = await supabase
      .from('org_credentials')
      .select('credentials_encrypted')
      .eq('org_id', ORG)
      .eq('provider', 'gmail')
      .single()

    if (!orgCred?.credentials_encrypted) {
      console.error('No Gmail credentials found')
      return null
    }

    const creds = JSON.parse(decryptCredential(orgCred.credentials_encrypted))
    return await resolveToken(creds)
  }

  const creds = JSON.parse(decryptCredential(data.config.credentials_encrypted))
  return await resolveToken(creds)
}

async function resolveToken(creds: Record<string, unknown>): Promise<string | null> {
  const clientId = (creds.client_id as string) || process.env.GOOGLE_CLIENT_ID || ''
  const clientSecret = (creds.client_secret as string) || process.env.GOOGLE_CLIENT_SECRET || ''
  let accessToken = creds.access_token as string | undefined
  const refreshToken = creds.refresh_token as string | undefined
  const tokenExpiresAt = creds.token_expires_at as string | undefined

  if (!accessToken && !refreshToken) { console.error('No tokens'); return null }

  if (!accessToken || (tokenExpiresAt && new Date(tokenExpiresAt).getTime() - 60000 <= Date.now())) {
    if (!refreshToken) { console.error('No refresh token'); return null }
    console.log('Refreshing Gmail token...')
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) { console.error('Token refresh failed:', await res.text()); return null }
    const data = await res.json() as { access_token: string; expires_in: number }
    accessToken = data.access_token
    console.log('Token refreshed')
  }

  return accessToken || null
}

async function fetchEmails(token: string, query: string, maxResults: number): Promise<GmailMessage[]> {
  const q = encodeURIComponent(query)
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${q}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!listRes.ok) throw new Error(`List failed: ${listRes.status}`)
  const list = await listRes.json() as { messages?: { id: string }[] }
  if (!list.messages?.length) return []

  console.log(`  Found ${list.messages.length} messages for query: ${query}`)

  // Fetch metadata + snippet for each
  const messages: GmailMessage[] = []
  for (const item of list.messages.slice(0, maxResults)) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!msgRes.ok) continue
      const msg = await msgRes.json() as {
        id: string
        snippet: string
        payload: { headers: { name: string; value: string }[] }
      }

      const h = (name: string) => msg.payload.headers.find(h => h.name === name)?.value ?? ''
      messages.push({
        id: msg.id,
        from: h('From'),
        to: h('To'),
        subject: h('Subject'),
        date: h('Date'),
        snippet: msg.snippet,
      })
    } catch { /* skip individual failures */ }
  }

  return messages
}

async function runOpusSynthesis(emails: GmailMessage[]): Promise<string> {
  const client = new Anthropic()

  // Format emails as a corpus
  const corpus = emails.map((e, i) =>
    `[Email ${i + 1}] From: ${e.from} | To: ${e.to} | Date: ${e.date}\nSubject: ${e.subject}\n${e.snippet}\n`
  ).join('\n---\n')

  console.log(`\nCorpus: ${corpus.length} chars, ${emails.length} emails`)
  console.log(`Estimated tokens: ~${Math.round(corpus.length / 3.5)}`)

  const response = await client.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are building a comprehensive world model for a new user from their email history. This is for an AI personal assistant that needs to know everything about this person's professional life from day one.

Analyze the following ${emails.length} emails (both sent and received) and extract a structured world model:

## Instructions

1. **PEOPLE** — Every person who appears, their relationship to the user (client, colleague, vendor, personal), their company/role if known, communication frequency, and any outstanding items between them.

2. **PROJECTS** — Active work threads, their status (active/stalled/completed), key milestones, deadlines, blockers. Include any website URLs, domains, or technical details mentioned.

3. **FINANCIAL** — Amounts owed/due, invoice references, payment status, pricing discussed. Include any subscription costs, tool costs, or business expenses.

4. **WEBSITES & DOMAINS** — Any URLs, domain names, hosting references, staging/production sites mentioned in any email. This is critical — the assistant needs to know what websites exist.

5. **THE USER** — Their name, role, business name, communication style, what they do professionally. Infer from their sent emails.

6. **COMMITMENTS & ACTION ITEMS** — Things the user promised to do, things others promised to do for the user. Focus on recent and unresolved.

7. **COMMUNICATION PATTERNS** — Who gets quick replies, who gets delayed, what topics dominate. Time patterns if visible.

Be exhaustive. Extract every name, every URL, every dollar amount, every project reference. This world model will be the foundation of the assistant's intelligence.

---

EMAIL CORPUS:

${corpus}`
    }],
  })

  const text = response.content.find(b => b.type === 'text')
  return text?.type === 'text' ? text.text : ''
}

async function main() {
  console.log('=== Onboarding Synthesis Proof-of-Concept ===\n')

  // Get Gmail token
  const token = await getGmailToken()
  if (!token) { console.error('Cannot get Gmail token'); process.exit(1) }
  console.log('Gmail token acquired\n')

  // Pull emails: SENT (reveals user identity) + RECEIVED (reveals their world)
  console.log('Pulling emails...')
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const dateStr = `${sixMonthsAgo.getFullYear()}/${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}/${String(sixMonthsAgo.getDate()).padStart(2, '0')}`

  const [sent, received] = await Promise.all([
    fetchEmails(token, `in:sent after:${dateStr}`, 100),
    fetchEmails(token, `in:inbox after:${dateStr}`, 100),
  ])

  console.log(`\nTotal: ${sent.length} sent + ${received.length} received = ${sent.length + received.length} emails`)

  // Deduplicate and sort by date (most recent first)
  const allEmails = [...sent, ...received]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Take most recent 150 for synthesis (balancing coverage with token cost)
  const corpus = allEmails.slice(0, 150)
  console.log(`Using ${corpus.length} most recent emails for synthesis`)

  // Run Opus synthesis
  console.log('\nRunning Opus synthesis...')
  const startTime = Date.now()
  const worldModel = await runOpusSynthesis(corpus)
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log(`\nSynthesis complete in ${duration}s`)
  console.log(`Output: ${worldModel.length} chars\n`)
  console.log('='.repeat(60))
  console.log(worldModel)
  console.log('='.repeat(60))

  // Check for the Steve West URL specifically
  const hasSteve = worldModel.toLowerCase().includes('steve')
  const hasPresale = worldModel.toLowerCase().includes('presale')
  const hasURL = /https?:\/\/|\.com\.au|\.com/i.test(worldModel)

  console.log('\n=== Validation ===')
  console.log(`Mentions Steve West: ${hasSteve ? 'YES' : 'NO'}`)
  console.log(`Mentions presale: ${hasPresale ? 'YES' : 'NO'}`)
  console.log(`Contains URLs/domains: ${hasURL ? 'YES' : 'NO'}`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
