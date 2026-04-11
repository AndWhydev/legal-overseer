/**
 * Run the onboarding intelligence pipeline for Tor's account.
 * Self-contained — no @/ imports, all inline.
 */
import { config } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { createDecipheriv, scryptSync } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'

const __dir = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dir, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ORG = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'
const USER = '02ce2616-c01b-45a5-a2ad-16ebe936a6b2'

function decrypt(encrypted: string): string {
  const key = scryptSync(process.env.CREDENTIALS_KEY!, 'bitbit-integration-salt', 32)
  const [ivB64, authTagB64, ciphertext] = encrypted.split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  return decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8')
}

interface EmailMsg { id: string; from: string; to: string; subject: string; date: string; snippet: string; direction: string; channel: string }

async function getGmailToken(): Promise<string> {
  const { data } = await supabase.from('org_integrations').select('credentials_encrypted').eq('org_id', ORG).eq('provider', 'gmail').single()
  if (!data?.credentials_encrypted) throw new Error('No Gmail credentials in org_integrations')
  const creds = JSON.parse(decrypt(data.credentials_encrypted))
  let token = creds.access_token
  const refresh = creds.refresh_token
  if (!token || (creds.token_expires_at && new Date(creds.token_expires_at).getTime() - 60000 <= Date.now())) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.client_id || process.env.GOOGLE_CLIENT_ID!, client_secret: creds.client_secret || process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refresh, grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
    const d = await res.json() as { access_token: string }
    token = d.access_token
    console.log('  Token refreshed')
  }
  return token
}

async function fetchGmail(token: string, query: string, max: number, dir: string): Promise<EmailMsg[]> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return []
  const list = await res.json() as { messages?: { id: string }[] }
  if (!list.messages?.length) return []
  const msgs: EmailMsg[] = []
  for (let i = 0; i < list.messages.length; i += 10) {
    const batch = list.messages.slice(i, i + 10)
    const results = await Promise.allSettled(batch.map(item =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null)
    ))
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue
      const m = r.value as { id: string; snippet: string; payload: { headers: { name: string; value: string }[] } }
      const h = (n: string) => m.payload?.headers?.find((hdr: { name: string }) => hdr.name === n)?.value ?? ''
      msgs.push({ id: m.id, channel: 'gmail', from: h('From'), to: h('To'), subject: h('Subject'), date: h('Date'), snippet: m.snippet, direction: dir })
    }
  }
  return msgs
}

async function fetchStoredMessages(): Promise<EmailMsg[]> {
  const since = new Date(); since.setMonth(since.getMonth() - 6)
  const { data } = await supabase.from('channel_messages').select('id,channel,sender,subject,body,received_at').eq('org_id', ORG).in('channel', ['whatsapp', 'sms']).gte('received_at', since.toISOString()).order('received_at', { ascending: false }).limit(100)
  return (data ?? []).map(m => ({ id: m.id, channel: m.channel, from: m.sender ?? '', to: 'user', subject: m.subject ?? '', date: m.received_at ?? '', snippet: (m.body ?? '').slice(0, 200), direction: 'received' }))
}

async function main() {
  const start = Date.now()
  console.log('=== BitBit Onboarding Intelligence Pipeline ===\n')

  // Phase 1: Crawl
  console.log('[1/3] Crawling channels...')
  const token = await getGmailToken()
  const sixAgo = new Date(); sixAgo.setMonth(sixAgo.getMonth() - 6)
  const dateQ = `${sixAgo.getFullYear()}/${String(sixAgo.getMonth() + 1).padStart(2, '0')}/${String(sixAgo.getDate()).padStart(2, '0')}`

  const [sent, received, stored] = await Promise.all([
    fetchGmail(token, `in:sent after:${dateQ}`, 100, 'sent'),
    fetchGmail(token, `in:inbox after:${dateQ}`, 100, 'received'),
    fetchStoredMessages(),
  ])
  console.log(`  Gmail sent: ${sent.length}, received: ${received.length}, WhatsApp/SMS: ${stored.length}`)

  const all = [...sent, ...received, ...stored].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const corpus = all.slice(0, 200)
  console.log(`  Using ${corpus.length} messages for synthesis\n`)

  // Phase 2: Opus synthesis
  console.log('[2/3] Running Opus synthesis...')
  const synthStart = Date.now()
  const client = new Anthropic()
  const corpusText = corpus.map((m, i) =>
    `[${i + 1}] [${m.channel.toUpperCase()}] [${m.direction.toUpperCase()}] From: ${m.from} | To: ${m.to} | Date: ${m.date}\nSubject: ${m.subject}\n${m.snippet}`
  ).join('\n---\n')

  const response = await client.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 8192,
    messages: [{ role: 'user', content: `You are building a comprehensive world model for a new user of an AI personal assistant. Analyze these ${corpus.length} messages and output a JSON object with these fields:

{
  "user": { "name": "", "emails": [], "businessName": "", "role": "", "communicationStyle": "", "technicalSkills": [] },
  "people": [{ "name": "", "emails": [], "phones": [], "company": "", "role": "", "relationship": "client|colleague|vendor|personal|employer", "communicationFrequency": "daily|weekly|monthly|rare", "lastInteraction": "", "outstandingItems": [], "notes": "" }],
  "projects": [{ "name": "", "status": "active|stalled|completed", "people": [], "urls": [], "description": "", "deadlines": [], "blockers": [] }],
  "financials": [{ "type": "receivable|payable|subscription", "entity": "", "amount": "", "currency": "AUD", "dueDate": "", "status": "", "reference": "" }],
  "commitments": [{ "description": "", "owner": "user|name", "deadline": "", "status": "pending|overdue|done" }],
  "websitesAndDomains": [{ "url": "", "owner": "", "purpose": "" }],
  "communicationPatterns": ["pattern description"]
}

Extract EVERY person, URL, domain, dollar amount, project. Be exhaustive. URLs and domains are critical.

After the JSON, write a 2-paragraph narrative briefing summarizing who this person is and what their world looks like.

CORPUS:
${corpusText}` }],
  })

  const rawOutput = response.content.find(b => b.type === 'text')
  const raw = rawOutput?.type === 'text' ? rawOutput.text : ''
  console.log(`  Synthesis: ${((Date.now() - synthStart) / 1000).toFixed(1)}s, ${raw.length} chars`)
  console.log(`  Tokens: ${response.usage?.input_tokens} in / ${response.usage?.output_tokens} out\n`)

  // Parse JSON
  let model: any = {}
  try {
    const fenceMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (fenceMatch) model = JSON.parse(fenceMatch[1])
    else {
      const start = raw.indexOf('{'); let depth = 0, end = start
      for (let i = start; i < raw.length; i++) { if (raw[i] === '{') depth++; if (raw[i] === '}') depth--; if (depth === 0) { end = i + 1; break } }
      model = JSON.parse(raw.slice(start, end))
    }
  } catch (e) { console.error('  JSON parse error:', e); model = { people: [], projects: [], websitesAndDomains: [], financials: [], commitments: [] } }

  console.log(`  People: ${model.people?.length ?? 0}, Projects: ${model.projects?.length ?? 0}, Websites: ${model.websitesAndDomains?.length ?? 0}`)

  // Phase 3: Ingest
  console.log('\n[3/3] Ingesting into BitBit...')
  let contactsCreated = 0, contactsUpdated = 0, memoriesStored = 0, nodesCreated = 0, edgesCreated = 0

  // Contacts
  const contactMap = new Map<string, string>()
  for (const p of (model.people ?? [])) {
    try {
      let existing = null
      if (p.emails?.length > 0) {
        const { data } = await supabase.from('contacts').select('id').eq('org_id', ORG).ilike('name', p.name).limit(1).maybeSingle()
        existing = data
      }
      if (!existing && p.name) {
        const { data } = await supabase.from('contacts').select('id').eq('org_id', ORG).ilike('name', p.name).limit(1).maybeSingle()
        existing = data
      }
      if (existing) {
        contactMap.set(p.name.toLowerCase(), existing.id); contactsUpdated++
      } else {
        const { data, error } = await supabase.from('contacts').insert({
          org_id: ORG, name: p.name, emails: p.emails ?? [], phones: p.phones ?? [],
          type: p.relationship === 'client' ? 'client' : 'business',
          profile_data: { company_name: p.company, role: p.role, relationship: p.relationship, onboarding_synthesized: true },
        }).select('id').single()
        if (data) { contactMap.set(p.name.toLowerCase(), data.id); contactsCreated++ }
      }
    } catch {}
  }
  console.log(`  Contacts: ${contactsCreated} created, ${contactsUpdated} existing`)

  // Knowledge graph nodes
  for (const p of (model.people ?? [])) {
    const cid = contactMap.get(p.name.toLowerCase()) ?? `ext:${p.name}`
    await supabase.from('kg_nodes').upsert({ org_id: ORG, node_type: 'Person', entity_id: cid, name: p.name, metadata: { email: p.emails?.[0], company: p.company } }, { onConflict: 'org_id,node_type,entity_id' })
    nodesCreated++
  }
  for (const proj of (model.projects ?? [])) {
    const pid = `project:${proj.name.toLowerCase().replace(/\s+/g, '-')}`
    await supabase.from('kg_nodes').upsert({ org_id: ORG, node_type: 'Topic', entity_id: pid, name: proj.name, metadata: { status: proj.status, urls: proj.urls } }, { onConflict: 'org_id,node_type,entity_id' })
    nodesCreated++
    for (const pName of (proj.people ?? [])) {
      const cid = contactMap.get(pName.toLowerCase()) ?? `ext:${pName}`
      await supabase.from('kg_edges').upsert({ org_id: ORG, source_id: cid, target_id: pid, edge_type: 'MENTIONED_IN', metadata: {} }, { onConflict: 'org_id,source_id,target_id,edge_type' })
      edgesCreated++
    }
  }
  console.log(`  Graph: ${nodesCreated} nodes, ${edgesCreated} edges`)

  // Semantic memories
  const storeMem = async (content: string, category: string, confidence: number, decay: string = 'normal') => {
    const catMap: Record<string, string> = { financial: 'financial', preference: 'preference', relationship: 'relationship' }
    await supabase.from('semantic_memories').insert({ org_id: ORG, content, category: catMap[category] ?? 'general', confidence, is_active: true, admission_score: confidence, decay_rate: decay })
    memoriesStored++
  }

  if (model.user?.name) await storeMem(`User's name: ${model.user.name}`, 'preference', 0.95, 'never')
  if (model.user?.businessName) await storeMem(`User's business: ${model.user.businessName}`, 'preference', 0.95, 'never')
  if (model.user?.role) await storeMem(`User's role: ${model.user.role}`, 'preference', 0.90, 'never')
  if (model.user?.communicationStyle) await storeMem(`Communication style: ${model.user.communicationStyle}`, 'preference', 0.85, 'never')

  for (const p of (model.people ?? [])) {
    await storeMem(`${p.name} is a ${p.relationship}${p.company ? ` at ${p.company}` : ''}${p.role ? `, ${p.role}` : ''}`, 'relationship', 0.90, 'slow')
    for (const item of (p.outstandingItems ?? [])) await storeMem(`[outstanding] ${p.name}: ${item}`, 'general', 0.80)
    if (p.notes?.length > 10) await storeMem(`[context] ${p.name}: ${p.notes}`, 'general', 0.75)
  }
  for (const w of (model.websitesAndDomains ?? [])) await storeMem(`Website: ${w.url} — ${w.owner}: ${w.purpose}`, 'general', 0.90, 'slow')
  for (const f of (model.financials ?? [])) await storeMem(`[financial] ${f.entity}: ${f.amount} ${f.currency} (${f.type}, ${f.status}) — ${f.reference}`, 'financial', 0.85)
  for (const c of (model.commitments ?? [])) { if (c.status !== 'done') await storeMem(`[commitment] ${c.owner}: ${c.description} (${c.deadline})`, 'general', 0.80) }
  for (const pat of (model.communicationPatterns ?? [])) await storeMem(`[pattern] ${pat}`, 'general', 0.70, 'slow')

  // Store narrative briefing
  const narrativeStart = raw.indexOf('\n\n', raw.lastIndexOf('}'))
  if (narrativeStart > 0) await storeMem(`[onboarding-briefing] ${raw.slice(narrativeStart).trim().slice(0, 2000)}`, 'general', 0.95, 'slow')

  console.log(`  Memories: ${memoriesStored} stored`)

  const total = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\n=== COMPLETE in ${total}s ===`)
  console.log(`User: ${model.user?.name} (${model.user?.role})`)
  console.log(`Business: ${model.user?.businessName}`)
  console.log(`\nPeople:`)
  for (const p of (model.people ?? []).slice(0, 10)) console.log(`  ${p.name} (${p.relationship}) — ${p.company || '?'}`)
  console.log(`\nWebsites:`)
  for (const w of (model.websitesAndDomains ?? [])) console.log(`  ${w.url} — ${w.owner}`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
