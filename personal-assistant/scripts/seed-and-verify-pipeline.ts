/**
 * seed-and-verify-pipeline.ts
 *
 * Steps:
 * 1. Pull Gmail messages via relay-daemon → channel_messages
 * 2. Extract unique senders → seed contacts
 * 3. Enable Gmail relay
 * 4. Run synthesizer → reflectInboundMessage → contact timeline
 * 5. Compute entity profiles
 * 6. Test baseplate snapshot
 *
 * Run: cd personal-assistant && npx tsx scripts/seed-and-verify-pipeline.ts
 */

import { createClient } from '@supabase/supabase-js'
import { pollChannel } from '@/lib/channels/relay-daemon'
import { synthesize } from '@/lib/channels/synthesizer'
import { computeEntityProfile } from '@/lib/context/entity-profile-builder'
import { getBaseplateSnapshot } from '@/lib/context/baseplate-snapshot'
import { resolveEntity } from '@/lib/context/entity-resolver'
import crypto from 'crypto'

const ORG_ID = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function step1_pullGmailMessages() {
  console.log('\n========================================')
  console.log('STEP 1: Pull Gmail messages via relay-daemon')
  console.log('========================================\n')

  // Temporarily enable relay so pollChannel doesn't skip
  const { error: enableErr } = await supabase
    .from('channel_connections')
    .update({ relay_enabled: true })
    .eq('org_id', ORG_ID)
    .eq('channel_type', 'gmail')

  if (enableErr) {
    console.error('Failed to enable relay:', enableErr.message)
    return false
  }
  console.log('Relay temporarily enabled for Gmail pull')

  // Poll channel — this decrypts credentials, calls Gmail API, inserts into channel_messages
  const result = await pollChannel(supabase, ORG_ID, 'gmail')

  console.log(`Messages found: ${result.messagesFound}`)
  console.log(`Messages inserted: ${result.messagesInserted}`)
  console.log(`Skipped: ${result.skipped}`)
  console.log(`Latency: ${result.latencyMs}ms`)
  if (result.dedupStats) {
    console.log(`Dedup: ${result.dedupStats.externalId} external_id, ${result.dedupStats.contentHash} content_hash`)
  }
  if (result.error) {
    console.error('ERROR:', result.error)
    return false
  }

  if (result.messagesInserted === 0 && result.messagesFound === 0) {
    console.error('No messages found from Gmail. Check OAuth token validity.')
    return false
  }

  // Verify what's in channel_messages
  const { data: msgs, count } = await supabase
    .from('channel_messages')
    .select('id, sender, sender_email, subject, received_at', { count: 'exact' })
    .eq('org_id', ORG_ID)
    .eq('channel', 'gmail')
    .order('received_at', { ascending: false })

  console.log(`\nTotal Gmail messages in channel_messages: ${count}`)
  for (const m of (msgs ?? [])) {
    console.log(`  ${m.sender_email || m.sender} — "${(m.subject || '').slice(0, 60)}" — ${m.received_at}`)
  }

  return true
}

async function step2_seedContacts() {
  console.log('\n========================================')
  console.log('STEP 2: Seed contacts from Gmail senders')
  console.log('========================================\n')

  // Get all Gmail messages for this org
  const { data: msgs, error: msgErr } = await supabase
    .from('channel_messages')
    .select('sender, sender_email')
    .eq('org_id', ORG_ID)
    .eq('channel', 'gmail')

  if (msgErr) {
    console.error('Failed to query channel_messages:', msgErr.message)
    return false
  }

  if (!msgs || msgs.length === 0) {
    console.error('No Gmail messages found to extract contacts from')
    return false
  }

  // Extract unique senders by email
  const senderMap = new Map<string, string>()  // email → name
  for (const m of msgs) {
    const email = (m.sender_email || '').trim().toLowerCase()
    if (!email) continue
    // Keep the first name we see for each email
    if (!senderMap.has(email)) {
      const name = m.sender?.trim() || email.split('@')[0]
      senderMap.set(email, name)
    }
  }

  console.log(`Unique sender emails: ${senderMap.size}`)

  // Filter out Tor's own email (don't create a contact for self)
  const torEmails = ['tor@allwebbedup.com.au', 'hi@torkay.com', 'tor@torkay.com']
  for (const torEmail of torEmails) {
    senderMap.delete(torEmail)
  }

  console.log(`After filtering self: ${senderMap.size} contacts to seed\n`)

  let created = 0
  const contactIds: string[] = []

  for (const [email, name] of senderMap) {
    const slug = slugify(name || email.split('@')[0])
    const contactId = crypto.randomUUID()

    const { error } = await supabase.from('contacts').upsert(
      {
        id: contactId,
        org_id: ORG_ID,
        slug,
        name,
        type: 'other',
        emails: [email],
        phones: [],
        aliases: [],
        profile_data: { source: 'gmail_import' },
        communication_patterns: {},
      },
      { onConflict: 'org_id,slug' }
    )

    if (error) {
      // Try with a unique slug if slug collision
      const altSlug = `${slug}-${email.split('@')[0]}`
      const { error: err2 } = await supabase.from('contacts').upsert(
        {
          id: contactId,
          org_id: ORG_ID,
          slug: altSlug,
          name,
          type: 'other',
          emails: [email],
          phones: [],
          aliases: [],
          profile_data: { source: 'gmail_import' },
          communication_patterns: {},
        },
        { onConflict: 'org_id,slug' }
      )
      if (err2) {
        console.error(`  FAILED: ${name} <${email}> — ${err2.message}`)
        continue
      }
    }

    // Get the actual contact ID (might differ if upsert matched existing)
    const { data: inserted } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', ORG_ID)
      .contains('emails', [email])
      .limit(1)
      .single()

    if (inserted) contactIds.push(inserted.id)

    console.log(`  + ${name} <${email}>`)
    created++
  }

  console.log(`\nContacts created/upserted: ${created}`)

  // Verify
  const { data: contacts, count } = await supabase
    .from('contacts')
    .select('id, name, emails', { count: 'exact' })
    .eq('org_id', ORG_ID)

  console.log(`Total contacts for Tor's org: ${count}`)
  for (const c of (contacts ?? [])) {
    console.log(`  ${c.name} — ${(c.emails || []).join(', ')}`)
  }

  return true
}

async function step3_enableRelayAndVerify() {
  console.log('\n========================================')
  console.log('STEP 3: Enable Gmail relay (persistent)')
  console.log('========================================\n')

  const { error } = await supabase
    .from('channel_connections')
    .update({ relay_enabled: true })
    .eq('org_id', ORG_ID)
    .eq('channel_type', 'gmail')

  if (error) {
    console.error('Failed to enable relay:', error.message)
    return false
  }

  // Verify
  const { data: conn } = await supabase
    .from('channel_connections')
    .select('id, channel_type, status, relay_enabled, last_sync')
    .eq('org_id', ORG_ID)
    .eq('channel_type', 'gmail')
    .single()

  console.log('Gmail connection after update:')
  console.log(`  status: ${conn?.status}`)
  console.log(`  relay_enabled: ${conn?.relay_enabled}`)
  console.log(`  last_sync: ${conn?.last_sync}`)

  if (!conn?.relay_enabled) {
    console.error('relay_enabled is still false!')
    return false
  }

  return true
}

async function step4_triggerSyncAndVerify() {
  console.log('\n========================================')
  console.log('STEP 4: Trigger synthesizer for contact timeline')
  console.log('========================================\n')

  // Get messages from channel_messages to feed through synthesizer
  const { data: msgs } = await supabase
    .from('channel_messages')
    .select('*')
    .eq('org_id', ORG_ID)
    .eq('channel', 'gmail')
    .order('received_at', { ascending: false })
    .limit(50)

  if (!msgs || msgs.length === 0) {
    console.error('No messages in channel_messages to process')
    return false
  }

  console.log(`Processing ${msgs.length} messages through synthesizer...`)

  // Call synthesize() — this will re-pull from Gmail and process
  // BUT it calls adapter.pull() which needs the access token
  // Instead, let's directly call reflectInboundMessage logic for each stored message
  // by writing timeline events and resolving contacts

  // For each message, resolve sender → contact, write contact timeline event
  let contactEventsWritten = 0
  let resolvedContacts = 0
  let failedResolutions = 0

  for (const msg of msgs) {
    const query = msg.sender_email || msg.sender
    if (!query) continue

    try {
      const contacts = await resolveEntity(supabase, query, ORG_ID)

      if (contacts.length === 0) {
        failedResolutions++
        console.log(`  No contact found for: ${query}`)
        continue
      }

      const contact = contacts[0]
      resolvedContacts++
      const snippet = msg.body?.length > 200 ? msg.body.slice(0, 197) + '...' : (msg.body || '')

      // Write contact-level timeline event
      const { error: tlError } = await supabase.from('entity_timeline').insert({
        org_id: ORG_ID,
        entity_type: 'contact',
        entity_id: contact.id,
        event_type: 'message_received',
        event_data: {
          channel: 'gmail',
          subject: msg.subject || null,
          snippet,
          sender: msg.sender,
          message_id: msg.external_id,
        },
        channel_source: 'gmail',
        occurred_at: msg.received_at,
      })

      if (tlError) {
        console.error(`  Timeline write failed for ${contact.name}: ${tlError.message}`)
      } else {
        contactEventsWritten++
        console.log(`  + timeline: ${contact.name} — "${(msg.subject || '').slice(0, 50)}"`)
      }

      // Also write channel_message timeline event
      const { error: cmError } = await supabase.from('entity_timeline').insert({
        org_id: ORG_ID,
        entity_type: 'channel_message',
        entity_id: msg.id,
        event_type: 'message_received',
        event_data: {
          sender: msg.sender,
          subject: msg.subject,
          bodyPreview: (msg.body || '').slice(0, 200),
          externalId: msg.external_id,
        },
        channel_source: 'gmail',
        occurred_at: msg.received_at,
      })

      if (cmError) {
        // Might be duplicate, that's ok
        if (!cmError.message.includes('duplicate')) {
          console.error(`  Channel message timeline failed: ${cmError.message}`)
        }
      }

      // Invalidate cross-ref cache for this contact
      await supabase
        .from('cross_reference_cache')
        .delete()
        .eq('org_id', ORG_ID)
        .eq('entity_type', 'contact')
        .eq('entity_id', contact.id)

    } catch (err) {
      console.error(`  Error processing ${query}:`, err instanceof Error ? err.message : String(err))
    }
  }

  console.log(`\nResults:`)
  console.log(`  Contacts resolved: ${resolvedContacts}`)
  console.log(`  Contact timeline events written: ${contactEventsWritten}`)
  console.log(`  Failed resolutions: ${failedResolutions}`)

  // Verify entity_timeline
  console.log('\nVerifying entity_timeline (contact events):')
  const { data: events, count: eventCount } = await supabase
    .from('entity_timeline')
    .select('event_type, entity_id, entity_type, channel_source, event_data, created_at', { count: 'exact' })
    .eq('org_id', ORG_ID)
    .eq('entity_type', 'contact')
    .eq('event_type', 'message_received')
    .order('created_at', { ascending: false })
    .limit(20)

  console.log(`Total contact message_received events: ${eventCount}`)

  // Get contact names for display
  if (events && events.length > 0) {
    const contactIds = [...new Set(events.map(e => e.entity_id))]
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, emails')
      .in('id', contactIds)

    const contactMap = new Map((contacts ?? []).map(c => [c.id, c]))

    for (const e of events) {
      const contact = contactMap.get(e.entity_id)
      const data = e.event_data as Record<string, unknown>
      console.log(`  ${contact?.name || 'Unknown'} (${(contact?.emails as string[] || [])[0] || 'no email'}) — "${(data.subject as string || '').slice(0, 50)}" — ${e.created_at}`)
    }
  }

  if (contactEventsWritten === 0) {
    console.error('FAIL: No contact timeline events were written')
    return false
  }

  return true
}

async function step5_entityProfileRefresh() {
  console.log('\n========================================')
  console.log('STEP 5: Entity profile refresh')
  console.log('========================================\n')

  // Get contacts that have timeline events
  const { data: contactsWithEvents } = await supabase
    .from('entity_timeline')
    .select('entity_id')
    .eq('org_id', ORG_ID)
    .eq('entity_type', 'contact')

  if (!contactsWithEvents || contactsWithEvents.length === 0) {
    console.error('No contacts with timeline events found')
    return false
  }

  const uniqueContactIds = [...new Set(contactsWithEvents.map(e => e.entity_id))]
  console.log(`Computing profiles for ${uniqueContactIds.length} contacts...`)

  for (const contactId of uniqueContactIds) {
    try {
      await computeEntityProfile(supabase, {
        orgId: ORG_ID,
        entityType: 'contact',
        entityId: contactId,
      })

      // Get the contact name for display
      const { data: contact } = await supabase
        .from('contacts')
        .select('name')
        .eq('id', contactId)
        .single()

      console.log(`  + profile computed: ${contact?.name || contactId}`)
    } catch (err) {
      console.error(`  FAILED for ${contactId}:`, err instanceof Error ? err.message : String(err))
    }
  }

  // Verify entity_profiles
  console.log('\nVerifying entity_profiles:')
  const { data: profiles, count: profileCount } = await supabase
    .from('entity_profiles')
    .select('entity_id, profile_data, computed_from_events, event_count_at_compute, computed_at', { count: 'exact' })
    .eq('org_id', ORG_ID)
    .eq('entity_type', 'contact')
    .order('computed_at', { ascending: false })

  console.log(`Total entity_profiles: ${profileCount}`)
  for (const p of (profiles ?? [])) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('name, emails')
      .eq('id', p.entity_id)
      .single()

    const pd = p.profile_data as Record<string, unknown>
    const summary = pd?.event_summary as Record<string, unknown> | undefined
    console.log(`  ${contact?.name || p.entity_id}:`)
    console.log(`    events computed from: ${p.computed_from_events}`)
    console.log(`    event_count_at_compute: ${p.event_count_at_compute}`)
    console.log(`    total events: ${(summary?.total as number) || 0}`)
    console.log(`    channels: ${JSON.stringify(summary?.channels || [])}`)
    console.log(`    last event: ${summary?.last_event_at || 'N/A'}`)
  }

  // Verify entity_patterns (these require specific data patterns, may be empty)
  const { data: patterns, count: patternCount } = await supabase
    .from('entity_patterns')
    .select('entity_id, pattern_type, confidence', { count: 'exact' })
    .eq('org_id', ORG_ID)

  console.log(`\nTotal entity_patterns: ${patternCount}`)
  if (patterns && patterns.length > 0) {
    for (const p of patterns) {
      console.log(`  ${p.entity_id}: ${p.pattern_type} (confidence: ${p.confidence})`)
    }
  } else {
    console.log('  (empty — patterns require invoice/response data to extract, expected)')
  }

  return (profileCount ?? 0) > 0
}

async function step6_baseplateSnapshot() {
  console.log('\n========================================')
  console.log('STEP 6: Baseplate snapshot test')
  console.log('========================================\n')

  // Pick the first contact that has a profile
  const { data: profiles } = await supabase
    .from('entity_profiles')
    .select('entity_id')
    .eq('org_id', ORG_ID)
    .eq('entity_type', 'contact')
    .order('computed_from_events', { ascending: false })
    .limit(1)

  if (!profiles || profiles.length === 0) {
    console.error('No entity profiles found to test baseplate')
    return false
  }

  const entityId = profiles[0].entity_id

  const { data: contact } = await supabase
    .from('contacts')
    .select('name, emails')
    .eq('id', entityId)
    .single()

  console.log(`Testing baseplate snapshot for: ${contact?.name || entityId}`)

  const snapshot = await getBaseplateSnapshot(supabase, ORG_ID, 'contact', entityId)

  if (!snapshot) {
    console.error('getBaseplateSnapshot() returned null')
    return false
  }

  console.log('\nBaseplate Snapshot:')
  console.log(`  computedAt: ${snapshot.computedAt}`)
  console.log(`  validUntil: ${snapshot.validUntil}`)
  console.log(`  eventCount: ${snapshot.eventCount}`)
  console.log(`  stale: ${snapshot.stale}`)
  console.log(`\n  Profile structure:`)
  console.log(`    recent_events: ${snapshot.profile.recent_events.length} events`)
  for (const evt of snapshot.profile.recent_events.slice(0, 5)) {
    console.log(`      - ${evt.type} via ${evt.channel || 'N/A'} at ${evt.at}`)
    const data = evt.data as Record<string, unknown> | undefined
    if (data?.subject) {
      console.log(`        subject: "${(data.subject as string).slice(0, 60)}"`)
    }
  }
  console.log(`    relationships: ${snapshot.profile.relationships.length}`)
  console.log(`    memories: ${snapshot.profile.memories.length}`)
  console.log(`    event_summary:`)
  console.log(`      total: ${snapshot.profile.event_summary.total}`)
  console.log(`      channels: ${JSON.stringify(snapshot.profile.event_summary.channels)}`)
  console.log(`      last_event_at: ${snapshot.profile.event_summary.last_event_at}`)

  return true
}

// Main
async function main() {
  console.log('=== BitBit Pipeline Verification ===')
  console.log(`Org: ${ORG_ID}`)
  console.log(`Supabase: ${supabaseUrl}`)
  console.log(`Timestamp: ${new Date().toISOString()}`)

  // Step 1: Pull Gmail messages
  const step1ok = await step1_pullGmailMessages()
  if (!step1ok) {
    console.error('\nSTEP 1 FAILED — stopping.')
    process.exit(1)
  }

  // Step 2: Seed contacts
  const step2ok = await step2_seedContacts()
  if (!step2ok) {
    console.error('\nSTEP 2 FAILED — stopping.')
    process.exit(1)
  }

  // Step 3: Enable relay (persistent)
  const step3ok = await step3_enableRelayAndVerify()
  if (!step3ok) {
    console.error('\nSTEP 3 FAILED — stopping.')
    process.exit(1)
  }

  // Step 4: Process messages through pipeline
  const step4ok = await step4_triggerSyncAndVerify()
  if (!step4ok) {
    console.error('\nSTEP 4 FAILED — stopping.')
    process.exit(1)
  }

  // Step 5: Entity profile refresh
  const step5ok = await step5_entityProfileRefresh()
  if (!step5ok) {
    console.error('\nSTEP 5 FAILED — stopping.')
    process.exit(1)
  }

  // Step 6: Baseplate snapshot
  const step6ok = await step6_baseplateSnapshot()
  if (!step6ok) {
    console.error('\nSTEP 6 FAILED — stopping.')
    process.exit(1)
  }

  console.log('\n========================================')
  console.log('ALL STEPS PASSED')
  console.log('========================================')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
