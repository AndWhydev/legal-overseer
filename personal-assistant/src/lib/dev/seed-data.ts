/**
 * DEV-ONLY: Synthetic seed data for visual testing.
 * This file is gitignored and tree-shaken from production builds.
 * Toggle via DevToolbar → "Seed Data" switch.
 */

if (process.env.NODE_ENV !== 'development') {
  throw new Error('seed-data.ts must never be imported in production')
}

export interface GlanceChip {
  icon: 'list-todo' | 'mail' | 'dollar-sign' | 'calendar'
  value: number
  label: string
  accent?: string
}

export interface BriefData {
  summary: string
  glanceChips?: GlanceChip[]
  sections: Array<{ title: string; items: string[] }>
  generatedAt: string
}

interface SeedLineItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

interface SeedInvoice {
  id: string
  invoice_number: string
  client_contact_id: string | null
  client_name: string
  total: number
  currency: string
  status: 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled'
  due_date: string | null
  issued_date: string | null
  paid_date: string | null
  created_at: string
  line_items?: SeedLineItem[]
}

export interface SeedDataSet {
  inboxMessages: SeedInboxMessage[]
  kanbanTasks: SeedKanbanTask[]
  kpiOverrides: SeedKpiOverrides
  kanbanColumns: SeedKanbanColumn[]
  contacts: SeedContact[]
  leads: SeedLead[]
  dailyBrief: BriefData
  invoices: SeedInvoice[]
}

interface SeedInboxMessage {
  id: string
  sender: string
  subject: string
  channel: string
  received_at: string
  significance: number
  processed: boolean
}

interface SeedKanbanTask {
  id: string
  title: string
  description: string
  column_id: string
  position: number
  priority: 'critical' | 'high' | 'medium' | 'low'
  metadata: Record<string, unknown>
  assigned_to: string | null
  created_at: string
  updated_at: string
  status: string
}

interface SeedKanbanColumn {
  id: string
  org_id: string
  title: string
  color: string
  position: number
}

interface SeedKpiOverrides {
  activeProjects: number
  monthlyRevenue: number
  tasksDueThisWeek: number
  agentActionsToday: number
  overdueTaskCount: number
  pendingApprovalCount: number
}

interface SeedContact {
  id: string
  name: string
  email: string
  company: string
}

interface SeedLead {
  id: string
  name: string
  email: string
  status: string
  value: number
  // Enhanced lead fields
  score?: string
  source_channel?: string
  source_detail?: string
  discovery_source?: string
  prospect_name?: string
  prospect_website?: string
  prospect_domain?: string
  prospect_phone?: string
  prospect_address?: string
  prospect_emails?: string[]
  fit_score?: number
  opportunity_score?: number
  priority_score?: number
  fit_breakdown?: { total: number; components: Array<{ factor: string; points: number }> }
  opportunity_breakdown?: { total: number; components: Array<{ factor: string; points: number; note?: string }> }
  opportunity_notes?: string
  outreach_angle?: string
  priority_services?: string[]
  website_signals?: Record<string, unknown>
  serp_presence?: Record<string, unknown>
  last_activity_at?: string
  first_ack_at?: string
  next_action?: string
  next_action_at?: string
  service_interest?: string[]
  timeline_days?: number
  notes?: string
}

const now = new Date()
const ago = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString()
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString()

const COLUMNS: SeedKanbanColumn[] = [
  { id: 'seed-todo', org_id: 'seed', title: 'To Do', color: '#64748b', position: 0 },
  { id: 'seed-progress', org_id: 'seed', title: 'In Progress', color: '#3B82F6', position: 1 },
  { id: 'seed-review', org_id: 'seed', title: 'Review', color: '#F59E0B', position: 2 },
  { id: 'seed-done', org_id: 'seed', title: 'Done', color: '#22C55E', position: 3 },
]

export const SEED_DATA: SeedDataSet = {
  kanbanColumns: COLUMNS,

  inboxMessages: [
    { id: 'seed-1', sender: 'Sarah Chen', subject: 'Q2 campaign brief ready for review', channel: 'email', received_at: ago(5), significance: 8, processed: false },
    { id: 'seed-2', sender: 'Marcus Webb', subject: 'Invoice #1042 payment confirmation', channel: 'email', received_at: ago(22), significance: 6, processed: false },
    { id: 'seed-3', sender: 'Olivia Park', subject: 'Logo concepts — round 2', channel: 'slack', received_at: ago(45), significance: 7, processed: false },
    { id: 'seed-4', sender: 'James Liu', subject: 'Website launch ETA?', channel: 'whatsapp', received_at: ago(90), significance: 9, processed: false },
    { id: 'seed-5', sender: 'Ava Thompson', subject: 'Social media report attached', channel: 'email', received_at: ago(150), significance: 5, processed: true },
    { id: 'seed-6', sender: 'Noah Patel', subject: 'Need access to staging environment', channel: 'slack', received_at: ago(200), significance: 4, processed: true },
    { id: 'seed-7', sender: 'Emma Rodriguez', subject: 'Contract renewal discussion', channel: 'email', received_at: ago(280), significance: 8, processed: false },
    { id: 'seed-8', sender: 'Liam Foster', subject: 'Bug in checkout flow — urgent', channel: 'slack', received_at: ago(10), significance: 10, processed: false },
  ],

  kanbanTasks: [
    { id: 'seed-t1', title: 'Design hero section for Acme rebrand', description: 'Full-width hero with animated gradient', column_id: 'seed-todo', position: 0, priority: 'high', metadata: { tags: ['design', '$acme'] }, assigned_to: null, created_at: ago(480), updated_at: ago(60), status: 'active' },
    { id: 'seed-t2', title: 'Write copy for Q2 email campaign', description: '3 email sequences targeting re-engagement', column_id: 'seed-todo', position: 1, priority: 'medium', metadata: { tags: ['content'] }, assigned_to: null, created_at: ago(360), updated_at: ago(120), status: 'active' },
    { id: 'seed-t3', title: 'Implement Stripe checkout flow', description: 'Subscription billing with proration', column_id: 'seed-progress', position: 0, priority: 'critical', metadata: { tags: ['dev', '$greenfield'], source: 'bitbit' }, assigned_to: 'dev-agent', created_at: ago(720), updated_at: ago(15), status: 'active' },
    { id: 'seed-t4', title: 'SEO audit for client portal', description: 'Core Web Vitals + schema markup review', column_id: 'seed-progress', position: 1, priority: 'medium', metadata: { tags: ['seo'] }, assigned_to: null, created_at: ago(600), updated_at: ago(180), status: 'active' },
    { id: 'seed-t5', title: 'Review brand guidelines PDF', description: 'Feedback on typography and colour palette', column_id: 'seed-review', position: 0, priority: 'low', metadata: { tags: ['design', 'awaiting'] }, assigned_to: null, created_at: ago(960), updated_at: ago(30), status: 'active' },
    { id: 'seed-t6', title: 'Deploy analytics dashboard', description: 'Vercel production deploy with env vars', column_id: 'seed-done', position: 0, priority: 'high', metadata: { tags: ['dev', 'credentials'] }, assigned_to: null, created_at: ago(1440), updated_at: ago(240), status: 'active' },
    { id: 'seed-t7', title: 'Client onboarding call — Webb Corp', description: 'Intro call, gather requirements, set timeline', column_id: 'seed-todo', position: 2, priority: 'high', metadata: { tags: ['$webb-corp', 'urgent'] }, assigned_to: null, created_at: ago(120), updated_at: ago(60), status: 'active' },
  ],

  kpiOverrides: {
    activeProjects: 8,
    monthlyRevenue: 24800,
    tasksDueThisWeek: 14,
    agentActionsToday: 127,
    overdueTaskCount: 3,
    pendingApprovalCount: 5,
  },

  contacts: [
    { id: 'seed-c1', name: 'Sarah Chen', email: 'sarah@acmecorp.com', company: 'Acme Corp' },
    { id: 'seed-c2', name: 'Marcus Webb', email: 'marcus@webbcorp.com', company: 'Webb Corp' },
    { id: 'seed-c3', name: 'Olivia Park', email: 'olivia@parkdesign.co', company: 'Park Design' },
    { id: 'seed-c4', name: 'James Liu', email: 'james@liuventures.com', company: 'Liu Ventures' },
    { id: 'seed-c5', name: 'Emma Rodriguez', email: 'emma@brightside.io', company: 'Brightside' },
  ],

  leads: [
    // Inbound leads with varying staleness + speed-to-lead
    {
      id: 'seed-l1', name: 'TechFlow Inc', email: 'hello@techflow.io', status: 'qualified', value: 15000,
      score: 'hot', source_channel: 'email', source_detail: 'TechFlow Inc — Website Redesign',
      discovery_source: 'inbound', service_interest: ['Website Redesign', 'SEO'],
      timeline_days: 30, notes: 'CEO reached out directly. Wants a full rebrand.',
      last_activity_at: daysAgo(1), first_ack_at: ago(2),
      next_action: 'Send proposal deck', next_action_at: daysFromNow(2),
    },
    {
      id: 'seed-l2', name: 'GreenLeaf Co', email: 'info@greenleaf.com', status: 'new', value: 8500,
      score: 'warm', source_channel: 'web', source_detail: 'GreenLeaf Co — Google Ads',
      discovery_source: 'inbound', service_interest: ['Google Ads', 'Analytics'],
      timeline_days: 14, last_activity_at: daysAgo(5),
    },
    {
      id: 'seed-l3', name: 'Summit Digital', email: 'ops@summit.digital', status: 'booked', value: 22000,
      score: 'hot', source_channel: 'whatsapp', source_detail: 'Summit Digital — Full Stack Marketing',
      discovery_source: 'inbound', service_interest: ['SEO', 'Google Ads', 'Social Media'],
      timeline_days: 60, notes: 'Booked discovery call for next week.',
      last_activity_at: daysAgo(0), first_ack_at: ago(15),
      next_action: 'Discovery call', next_action_at: daysFromNow(5),
    },
    {
      id: 'seed-l4', name: 'Harbour Plumbing', email: 'admin@harbourplumbing.com.au', status: 'new', value: 4200,
      score: 'warm', source_channel: 'email', source_detail: 'Harbour Plumbing — Local SEO',
      discovery_source: 'inbound', service_interest: ['Local SEO'],
      timeline_days: 21, last_activity_at: daysAgo(12),
    },
    {
      id: 'seed-l5', name: 'Coastal Electrics', email: 'info@coastalelectrics.com.au', status: 'qualified', value: 6800,
      score: 'cold', source_channel: 'slack', source_detail: 'Coastal Electrics — Website',
      discovery_source: 'inbound', last_activity_at: daysAgo(20),
    },
    {
      id: 'seed-l6', name: 'Bright Dental', email: 'hello@brightdental.com.au', status: 'converted', value: 18000,
      score: 'hot', source_channel: 'email', source_detail: 'Bright Dental — Full Rebrand',
      discovery_source: 'inbound', last_activity_at: daysAgo(2), first_ack_at: ago(3),
    },
    // PCC-enriched discovery leads
    {
      id: 'seed-l7', name: 'Quick Fix Plumbing', email: 'contact@quickfixplumbing.com.au', status: 'new', value: 3500,
      score: 'hot', source_channel: 'pcc_discovery', source_detail: 'Quick Fix Plumbing',
      discovery_source: 'pcc_discovery',
      prospect_name: 'Quick Fix Plumbing', prospect_website: 'https://quickfixplumbing.com.au',
      prospect_domain: 'quickfixplumbing.com.au', prospect_phone: '0412 345 678',
      prospect_address: '45 Main St, Brisbane QLD',
      prospect_emails: ['contact@quickfixplumbing.com.au'],
      fit_score: 75, opportunity_score: 70, priority_score: 72,
      fit_breakdown: { total: 75, components: [
        { factor: 'Has website', points: 15 }, { factor: 'Has phone number', points: 15 },
        { factor: 'Has email', points: 10 }, { factor: 'Found in Google Maps', points: 15 },
        { factor: 'Good rating (4.0+)', points: 10 }, { factor: 'Has reviews (10+)', points: 10 },
      ]},
      opportunity_breakdown: { total: 70, components: [
        { factor: 'No Google Analytics', points: 15 }, { factor: 'No Facebook Pixel', points: 10 },
        { factor: 'No booking system', points: 15 }, { factor: 'DIY CMS (Wix)', points: 10 },
        { factor: 'Poor/no organic ranking', points: 20 },
      ]},
      opportunity_notes: 'SEO: not ranking in organic results; Tracking: no Google Analytics; Tracking: no Facebook Pixel; Conversion: no online booking system; Technical: using Wix (DIY platform)',
      outreach_angle: 'Help them get found online',
      priority_services: ['SEO', 'Analytics Setup', 'Booking System', 'Website Redesign'],
      website_signals: { url: 'https://quickfixplumbing.com.au', reachable: true, cms: 'Wix', has_google_analytics: false, has_facebook_pixel: false, has_booking_system: false, load_time_ms: 3200 },
      serp_presence: { found_in_ads: false, found_in_maps: true, maps_position: 4, found_in_organic: false },
      last_activity_at: daysAgo(0),
    },
    {
      id: 'seed-l8', name: 'Sunrise Accounting', email: 'hello@sunriseaccounting.com.au', status: 'new', value: 12000,
      score: 'hot', source_channel: 'pcc_discovery', source_detail: 'Sunrise Accounting',
      discovery_source: 'pcc_discovery',
      prospect_name: 'Sunrise Accounting', prospect_website: 'https://sunriseaccounting.com.au',
      prospect_domain: 'sunriseaccounting.com.au', prospect_phone: '07 3456 7890',
      prospect_address: '120 Eagle St, Brisbane QLD',
      fit_score: 85, opportunity_score: 55, priority_score: 67,
      fit_breakdown: { total: 85, components: [
        { factor: 'Has website', points: 15 }, { factor: 'Has phone number', points: 15 },
        { factor: 'Found in Google Maps', points: 15 }, { factor: 'Good rating (4.0+)', points: 10 },
        { factor: 'Has reviews (10+)', points: 10 }, { factor: 'Running ads', points: 10 },
        { factor: 'Organic top 10', points: 10 },
      ]},
      opportunity_breakdown: { total: 55, components: [
        { factor: 'No Facebook Pixel', points: 10 }, { factor: 'No booking system', points: 15 },
        { factor: 'Poor/no organic ranking', points: 20, note: 'Position 8' },
        { factor: 'Already running ads', points: -10, note: 'Strength' },
      ]},
      opportunity_notes: 'SEO: ranking position 8 — room to improve; Tracking: no Facebook Pixel; Conversion: no online booking system; Note: already running Google Ads',
      outreach_angle: 'Streamline booking with online scheduling',
      priority_services: ['SEO', 'Facebook Ads / Retargeting', 'Booking System'],
      website_signals: { url: 'https://sunriseaccounting.com.au', reachable: true, cms: 'WordPress', has_google_analytics: true, has_facebook_pixel: false, has_booking_system: false, load_time_ms: 1800 },
      serp_presence: { found_in_ads: true, ad_position: 2, found_in_maps: true, maps_position: 3, found_in_organic: true, organic_position: 8 },
      last_activity_at: daysAgo(0),
    },
  ],

  dailyBrief: {
    summary: 'You have 3 tasks due and 2 messages to reply to.',
    glanceChips: [
      { icon: 'list-todo', value: 3, label: 'tasks due', accent: '#3B82F6' },
      { icon: 'mail', value: 2, label: 'to reply', accent: '#F59E0B' },
      { icon: 'dollar-sign', value: 2400, label: 'overdue', accent: '#E5484D' },
      { icon: 'calendar', value: 1, label: 'meeting', accent: '#A78BFA' },
    ],
    sections: [
      { title: 'Focus', items: ['Client onboarding call — Webb Corp', 'Review brand guidelines PDF', 'Stripe checkout flow'] },
      { title: 'Follow-up', items: ['Reply to Sarah Chen re: Q2 campaign', 'Reply to James Liu re: launch ETA'] },
    ],
    generatedAt: new Date().toISOString(),
  },

  invoices: [
    // 2 overdue
    {
      id: 'seed-inv-1', invoice_number: 'INV-001', client_contact_id: 'seed-c1', client_name: 'Sarah Chen',
      total: 4500, currency: 'AUD', status: 'overdue', due_date: daysAgo(14),
      issued_date: daysAgo(44), paid_date: null, created_at: daysAgo(45),
      line_items: [
        { description: 'Website Redesign — Phase 1', quantity: 1, unit_price: 2500, total: 2500 },
        { description: 'SEO Audit & Report', quantity: 1, unit_price: 2000, total: 2000 },
      ],
    },
    {
      id: 'seed-inv-2', invoice_number: 'INV-002', client_contact_id: 'seed-c4', client_name: 'James Liu',
      total: 12000, currency: 'AUD', status: 'overdue', due_date: daysAgo(7),
      issued_date: daysAgo(37), paid_date: null, created_at: daysAgo(38),
    },
    // 2 due this week
    {
      id: 'seed-inv-3', invoice_number: 'INV-003', client_contact_id: 'seed-c3', client_name: 'Olivia Park',
      total: 2800, currency: 'AUD', status: 'sent', due_date: daysFromNow(3),
      issued_date: daysAgo(27), paid_date: null, created_at: daysAgo(28),
    },
    {
      id: 'seed-inv-4', invoice_number: 'INV-004', client_contact_id: 'seed-c2', client_name: 'Marcus Webb',
      total: 6500, currency: 'AUD', status: 'sent', due_date: daysFromNow(5),
      issued_date: daysAgo(25), paid_date: null, created_at: daysAgo(26),
    },
    // 3 draft
    {
      id: 'seed-inv-5', invoice_number: 'INV-005', client_contact_id: 'seed-c5', client_name: 'Emma Rodriguez',
      total: 3200, currency: 'AUD', status: 'draft', due_date: null,
      issued_date: null, paid_date: null, created_at: daysAgo(2),
    },
    {
      id: 'seed-inv-6', invoice_number: 'INV-006', client_contact_id: null, client_name: 'TechFlow Inc',
      total: 15000, currency: 'AUD', status: 'draft', due_date: daysFromNow(30),
      issued_date: null, paid_date: null, created_at: daysAgo(1),
      line_items: [
        { description: 'Brand Strategy Workshop', quantity: 2, unit_price: 3500, total: 7000 },
        { description: 'Logo Design Package', quantity: 1, unit_price: 5000, total: 5000 },
        { description: 'Brand Guidelines Document', quantity: 1, unit_price: 3000, total: 3000 },
      ],
    },
    {
      id: 'seed-inv-7', invoice_number: 'INV-007', client_contact_id: null, client_name: 'GreenLeaf Co',
      total: 1850, currency: 'AUD', status: 'draft', due_date: daysFromNow(14),
      issued_date: null, paid_date: null, created_at: daysAgo(3),
    },
    // 2 sent (future due dates)
    {
      id: 'seed-inv-8', invoice_number: 'INV-008', client_contact_id: null, client_name: 'Summit Digital',
      total: 22000, currency: 'AUD', status: 'sent', due_date: daysFromNow(21),
      issued_date: daysAgo(9), paid_date: null, created_at: daysAgo(10),
      line_items: [
        { description: 'E-commerce Platform Build', quantity: 1, unit_price: 15000, total: 15000 },
        { description: 'Payment Integration', quantity: 1, unit_price: 4000, total: 4000 },
        { description: 'Testing & QA', quantity: 1, unit_price: 3000, total: 3000 },
      ],
    },
    {
      id: 'seed-inv-9', invoice_number: 'INV-009', client_contact_id: 'seed-c1', client_name: 'Sarah Chen',
      total: 7200, currency: 'AUD', status: 'sent', due_date: daysFromNow(14),
      issued_date: daysAgo(16), paid_date: null, created_at: daysAgo(17),
    },
    // 3 paid
    {
      id: 'seed-inv-10', invoice_number: 'INV-010', client_contact_id: 'seed-c2', client_name: 'Marcus Webb',
      total: 5000, currency: 'AUD', status: 'paid', due_date: daysAgo(10),
      issued_date: daysAgo(40), paid_date: daysAgo(3), created_at: daysAgo(41),
    },
    {
      id: 'seed-inv-11', invoice_number: 'INV-011', client_contact_id: 'seed-c3', client_name: 'Olivia Park',
      total: 9400, currency: 'AUD', status: 'paid', due_date: daysAgo(20),
      issued_date: daysAgo(50), paid_date: daysAgo(10), created_at: daysAgo(51),
    },
    {
      id: 'seed-inv-12', invoice_number: 'INV-012', client_contact_id: 'seed-c4', client_name: 'James Liu',
      total: 3600, currency: 'AUD', status: 'paid', due_date: daysAgo(30),
      issued_date: daysAgo(60), paid_date: daysAgo(20), created_at: daysAgo(61),
    },
  ],
}

// ─── Seed data event bus (no page reload needed) ──────────────────────────

const SEED_EVENT = 'bb-seed-data-toggle' as const

export type SeedTogglePayload = { active: boolean; data: SeedDataSet | null }

export function emitSeedToggle(active: boolean) {
  const payload: SeedTogglePayload = {
    active,
    data: active ? SEED_DATA : null,
  }
  window.dispatchEvent(new CustomEvent(SEED_EVENT, { detail: payload }))
}

export function onSeedToggle(handler: (payload: SeedTogglePayload) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<SeedTogglePayload>).detail)
  window.addEventListener(SEED_EVENT, listener)
  return () => window.removeEventListener(SEED_EVENT, listener)
}

/**
 * Check if seed mode is currently active (persisted in sessionStorage).
 * SessionStorage ensures it doesn't leak across tabs or survive restart.
 */
export function isSeedActive(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem('bb-seed-active') === '1'
}

export function setSeedActive(active: boolean) {
  if (active) {
    sessionStorage.setItem('bb-seed-active', '1')
  } else {
    sessionStorage.removeItem('bb-seed-active')
  }
  emitSeedToggle(active)
}
