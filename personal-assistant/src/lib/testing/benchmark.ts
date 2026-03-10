import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyInboundLead, qualifyLead, runLeadSwarmTick } from '../agent/lead-swarm'
import { runInvoiceFlowTick } from '../agent/invoice-flow'
import { runSentryTick } from '../agent/sentry'

export interface AgentBenchmark {
  agent: string
  durationMs: number
  itemsProcessed: number
  results: Record<string, unknown>
  accuracy?: number
}

export interface BenchmarkReport {
  runId: string
  orgId: string
  startedAt: string
  completedAt: string
  totalDurationMs: number
  agents: AgentBenchmark[]
  seedSummary: {
    contacts: number
    messages: number
    invoices: number
    proposals: number
    watches: number
  }
}

interface SeedIds {
  orgId: string
  agentConfigId: string
  contactIds: string[]
  messageIds: string[]
  invoiceIds: string[]
  proposalIds: string[]
  watchIds: string[]
}

const SEED_MESSAGES = [
  // Leads (8)
  { sender: 'lead-1@example.com', subject: 'Website quote', body: 'Hi, I need a new website for my business. Budget around $5k, need it in 2 weeks.', expectedLabel: 'lead' },
  { sender: 'lead-2@example.com', subject: 'SEO services', body: 'Looking for SEO help. Our organic traffic has dropped. Can you help with keyword ranking?', expectedLabel: 'lead' },
  { sender: 'lead-3@example.com', subject: 'Google Ads campaign', body: 'We want to run Google Ads for our startup. Budget $10k/month, starting ASAP.', expectedLabel: 'lead' },
  { sender: 'lead-4@example.com', subject: 'Branding project', body: 'Need a full brand identity package — logo, positioning, guidelines. Timeline 1 month.', expectedLabel: 'lead' },
  { sender: 'lead-5@example.com', subject: 'Web app development', body: 'Building a SaaS product, need frontend and backend development. $20k budget, 3 months.', expectedLabel: 'lead' },
  { sender: 'lead-6@example.com', subject: 'Landing page', body: 'Need a landing page for our new product launch next week. Simple one-pager.', expectedLabel: 'lead' },
  { sender: 'lead-7@example.com', subject: 'CRM automation', body: 'Want to set up Zapier automation for our CRM workflow. Budget $3k.', expectedLabel: 'lead' },
  { sender: 'lead-8@example.com', subject: 'PPC management', body: 'Need someone to manage our Meta ads campaign. Monthly retainer.', expectedLabel: 'lead' },
  // Spam (6)
  { sender: 'spam-1@example.com', subject: 'FREE OFFER!!!', body: 'Congratulations! You have won a free iPhone. Click here now!', expectedLabel: 'spam' },
  { sender: 'newsletter@example.com', subject: 'Weekly digest', body: 'Here is your weekly newsletter roundup of industry news.', expectedLabel: 'spam' },
  { sender: 'spam-2@example.com', subject: 'Buy followers', body: 'Get 10000 Instagram followers for just $9.99! Limited time offer!', expectedLabel: 'spam' },
  { sender: 'promo@example.com', subject: 'Black Friday Sale', body: 'Massive discounts on all software tools. Subscribe now!', expectedLabel: 'spam' },
  { sender: 'spam-3@example.com', subject: 'Partnership opportunity', body: 'Dear sir/madam, I am a prince from Nigeria...', expectedLabel: 'spam' },
  { sender: 'spam-4@example.com', subject: 'Urgent: verify your account', body: 'Your account has been compromised. Click to verify immediately.', expectedLabel: 'spam' },
  // Client (4)
  { sender: 'client-1@example.com', subject: 'Project update', body: 'Hey, just checking in on the project progress. Can we schedule a call?', expectedLabel: 'client' },
  { sender: 'client-2@example.com', subject: 'Invoice received', body: 'Thanks for the invoice. Payment will be processed this week.', expectedLabel: 'client' },
  { sender: 'client-3@example.com', subject: 'Feedback on designs', body: 'Love the new mockups! A few minor tweaks needed on the homepage hero.', expectedLabel: 'client' },
  { sender: 'client-4@example.com', subject: 'Scope change', body: 'We want to add a blog section to the website. Can you quote for that?', expectedLabel: 'client' },
  // Personal (2)
  { sender: 'friend@example.com', subject: 'Lunch tomorrow?', body: 'Hey, want to grab lunch tomorrow at noon?', expectedLabel: 'personal' },
  { sender: 'family@example.com', subject: 'Birthday party', body: 'Reminder: Mom birthday party this Saturday at 3pm.', expectedLabel: 'personal' },
]

async function seedBenchmarkData(supabase: SupabaseClient): Promise<SeedIds> {
  const orgId = crypto.randomUUID()
  const agentConfigId = crypto.randomUUID()

  // Create org
  await supabase.from('organisations').insert({
    id: orgId,
    name: 'Benchmark Test Org',
    slug: 'benchmark-test',
    owner_id: crypto.randomUUID(),
  })

  // Create agent config
  await supabase.from('agent_configs').insert({
    id: agentConfigId,
    org_id: orgId,
    agent_type: 'lead-swarm',
    display_name: 'Benchmark Lead Swarm',
    enabled: true,
  })

  // Seed 10 contacts
  const contactIds: string[] = []
  for (let i = 0; i < 10; i++) {
    const id = crypto.randomUUID()
    contactIds.push(id)
    await supabase.from('contacts').insert({
      id,
      org_id: orgId,
      name: `Benchmark Contact ${i + 1}`,
      email: `contact-${i + 1}@benchmark.test`,
      source: 'benchmark',
    })
  }

  // Seed 20 channel messages
  const messageIds: string[] = []
  for (const msg of SEED_MESSAGES) {
    const id = crypto.randomUUID()
    messageIds.push(id)
    await supabase.from('channel_messages').insert({
      id,
      org_id: orgId,
      channel: 'email',
      sender: msg.sender.split('@')[0],
      sender_email: msg.sender,
      subject: msg.subject,
      body: msg.body,
      received_at: new Date().toISOString(),
      processed: false,
      is_actionable: true,
      priority: 'medium',
      metadata: { expectedLabel: msg.expectedLabel },
    })
  }

  // Seed 5 invoices (as approved in approval_queue for invoice-flow to process)
  const invoiceIds: string[] = []
  for (let i = 0; i < 5; i++) {
    const id = crypto.randomUUID()
    invoiceIds.push(id)
    await supabase.from('approval_queue').insert({
      id,
      org_id: orgId,
      agent_config_id: agentConfigId,
      action_type: 'invoice_create',
      status: 'approved',
      action_payload: {
        source_intent: `Benchmark invoice ${i + 1}`,
        contact_name: `Benchmark Contact ${i + 1}`,
        project_reference: `Project ${i + 1}`,
        amount: (i + 1) * 1000,
        currency: 'AUD',
        terms_days: 14,
      },
      action_summary: `Create invoice for Benchmark Contact ${i + 1}`,
      confidence_score: 0.9,
      routing_decision: 'auto',
      priority: 'normal',
      context_snapshot: {},
    })
  }

  // Seed 3 proposals
  const proposalIds: string[] = []
  for (let i = 0; i < 3; i++) {
    const id = crypto.randomUUID()
    proposalIds.push(id)
    await supabase.from('proposals').insert({
      id,
      org_id: orgId,
      client_contact_id: contactIds[i],
      title: `Benchmark Proposal ${i + 1}`,
      status: 'draft',
      total: (i + 1) * 5000,
    })
  }

  // Seed 2 watches for sentry
  const watchIds: string[] = []
  for (const watchType of ['error_keyword', 'negative_sentiment']) {
    const id = crypto.randomUUID()
    watchIds.push(id)
    await supabase.from('watches').insert({
      id,
      org_id: orgId,
      watch_type: watchType,
      description: `Benchmark ${watchType} watch`,
      conditions: watchType === 'error_keyword'
        ? { keywords: ['error', 'failed', 'exception'] }
        : { patterns: ['refund', 'cancel', 'angry'] },
      interval_seconds: 60,
      status: 'active',
      last_checked_at: null,
      next_check_at: null,
    })
  }

  return { orgId, agentConfigId, contactIds, messageIds, invoiceIds, proposalIds, watchIds }
}

async function cleanupBenchmarkData(supabase: SupabaseClient, seed: SeedIds): Promise<void> {
  const { orgId } = seed
  await supabase.from('sentry_alerts').delete().eq('org_id', orgId)
  await supabase.from('watches').delete().eq('org_id', orgId)
  await supabase.from('leads').delete().eq('org_id', orgId)
  await supabase.from('proposals').delete().eq('org_id', orgId)
  await supabase.from('invoices').delete().eq('org_id', orgId)
  await supabase.from('approval_queue').delete().eq('org_id', orgId)
  await supabase.from('channel_messages').delete().eq('org_id', orgId)
  await supabase.from('contacts').delete().eq('org_id', orgId)
  await supabase.from('agent_configs').delete().eq('org_id', orgId)
  await supabase.from('organisations').delete().eq('id', orgId)
}

async function benchmarkLeadSwarm(
  supabase: SupabaseClient,
  seed: SeedIds,
): Promise<AgentBenchmark> {
  const start = performance.now()
  const result = await runLeadSwarmTick(supabase, seed.orgId, seed.agentConfigId)
  const durationMs = Math.round(performance.now() - start)

  // Check accuracy: compare lead classifications against expected labels
  const { data: leads } = await supabase
    .from('leads')
    .select('source_message_id, classification_label')
    .eq('org_id', seed.orgId)

  const { data: messages } = await supabase
    .from('channel_messages')
    .select('id, metadata')
    .eq('org_id', seed.orgId)

  let correct = 0
  let total = 0
  const expectedMap = new Map<string, string>()
  for (const msg of messages ?? []) {
    const meta = msg.metadata as Record<string, unknown> | null
    if (meta?.expectedLabel) {
      expectedMap.set(msg.id, meta.expectedLabel as string)
    }
  }

  // For messages classified as leads, check if expected was 'lead'
  for (const lead of leads ?? []) {
    total++
    const expected = expectedMap.get(lead.source_message_id)
    if (expected === 'lead') correct++
  }

  // For messages NOT classified as leads, check they weren't expected to be leads
  const leadMessageIds = new Set((leads ?? []).map((l) => l.source_message_id))
  for (const [msgId, expected] of expectedMap) {
    if (!leadMessageIds.has(msgId)) {
      total++
      if (expected !== 'lead') correct++
    }
  }

  const accuracy = total > 0 ? Math.round((correct / total) * 1000) / 1000 : undefined

  return {
    agent: 'lead-swarm',
    durationMs,
    itemsProcessed: result.processed,
    results: result as unknown as Record<string, unknown>,
    accuracy,
  }
}

async function benchmarkInvoiceFlow(
  supabase: SupabaseClient,
  seed: SeedIds,
): Promise<AgentBenchmark> {
  const start = performance.now()
  const result = await runInvoiceFlowTick(supabase, seed.orgId, seed.agentConfigId)
  const durationMs = Math.round(performance.now() - start)

  return {
    agent: 'invoice-flow',
    durationMs,
    itemsProcessed: result.processed,
    results: result as unknown as Record<string, unknown>,
  }
}

async function benchmarkSentry(
  supabase: SupabaseClient,
  seed: SeedIds,
): Promise<AgentBenchmark> {
  const start = performance.now()
  const result = await runSentryTick(supabase, seed.orgId, seed.agentConfigId)
  const durationMs = Math.round(performance.now() - start)

  return {
    agent: 'sentry',
    durationMs,
    itemsProcessed: result.processed,
    results: result as unknown as Record<string, unknown>,
  }
}

export async function runBenchmark(supabase: SupabaseClient): Promise<BenchmarkReport> {
  const runId = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  const totalStart = performance.now()

  const seed = await seedBenchmarkData(supabase)

  const agents: AgentBenchmark[] = []

  try {
    agents.push(await benchmarkLeadSwarm(supabase, seed))
    agents.push(await benchmarkInvoiceFlow(supabase, seed))
    agents.push(await benchmarkSentry(supabase, seed))
  } finally {
    await cleanupBenchmarkData(supabase, seed)
  }

  const totalDurationMs = Math.round(performance.now() - totalStart)

  return {
    runId,
    orgId: seed.orgId,
    startedAt,
    completedAt: new Date().toISOString(),
    totalDurationMs,
    agents,
    seedSummary: {
      contacts: seed.contactIds.length,
      messages: seed.messageIds.length,
      invoices: seed.invoiceIds.length,
      proposals: seed.proposalIds.length,
      watches: seed.watchIds.length,
    },
  }
}
