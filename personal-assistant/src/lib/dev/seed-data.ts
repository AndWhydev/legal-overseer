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
  client_email?: string | null
  total: number
  subtotal?: number
  tax?: number
  currency: string
  status: 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled'
  due_date: string | null
  issued_date: string | null
  paid_date: string | null
  created_at: string
  line_items?: SeedLineItem[]
  project_reference?: string | null
  payment_method?: string | null
}

interface SeedTender {
  id: string
  title: string
  source: string
  tender_number: string | null
  url: string
  value: number | null
  deadline: string | null
  status: string
  fit_score: number | null
  category: string
  created_at: string
}

interface SeedCapabilityProfile {
  id: string
  name: string
  service_category: string
  skills: string[]
  certifications: string[]
  location_coverage: string[]
  max_contract_value: number | null
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
  tenders: SeedTender[]
  capabilityProfiles: SeedCapabilityProfile[]
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
  actionsToday: number
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
    { id: 'seed-t1', title: 'Design hero section for Acme rebrand', description: 'Full-width hero with animated gradient', column_id: 'seed-todo', position: 0, priority: 'high', metadata: { tags: ['design', '$acme'], source: 'email', deadline: daysFromNow(3) }, assigned_to: null, created_at: ago(480), updated_at: ago(60), status: 'active' },
    { id: 'seed-t2', title: 'Write copy for Q2 email campaign', description: '3 email sequences targeting re-engagement', column_id: 'seed-todo', position: 1, priority: 'medium', metadata: { tags: ['content'], source: 'slack' }, assigned_to: 'BitBit', created_at: ago(360), updated_at: ago(120), status: 'active' },
    { id: 'seed-t3', title: 'Implement Stripe checkout flow', description: 'Subscription billing with proration', column_id: 'seed-progress', position: 0, priority: 'critical', metadata: { tags: ['dev', '$greenfield'], source: 'bitbit', agentStatus: 'working' }, assigned_to: 'BitBit', created_at: ago(720), updated_at: ago(15), status: 'active' },
    { id: 'seed-t4', title: 'SEO audit for client portal', description: 'Core Web Vitals + schema markup review', column_id: 'seed-progress', position: 1, priority: 'medium', metadata: { tags: ['seo'], source: 'bitbit', agentStatus: 'done' }, assigned_to: 'BitBit', created_at: ago(600), updated_at: ago(180), status: 'active' },
    { id: 'seed-t5', title: 'Review brand guidelines PDF', description: 'Feedback on typography and colour palette', column_id: 'seed-review', position: 0, priority: 'low', metadata: { tags: ['design', 'awaiting'], source: 'whatsapp', deadline: daysAgo(2) }, assigned_to: null, created_at: ago(960), updated_at: ago(30), status: 'active' },
    { id: 'seed-t6', title: 'Deploy analytics dashboard', description: 'Vercel production deploy with env vars', column_id: 'seed-done', position: 0, priority: 'high', metadata: { tags: ['dev', 'credentials'], source: 'bitbit' }, assigned_to: null, created_at: ago(1440), updated_at: ago(240), status: 'active' },
    { id: 'seed-t7', title: 'Client onboarding call — Webb Corp', description: 'Intro call, gather requirements, set timeline', column_id: 'seed-todo', position: 2, priority: 'high', metadata: { tags: ['$webb-corp', 'urgent'], source: 'email', deadline: daysFromNow(1) }, assigned_to: null, created_at: ago(120), updated_at: ago(60), status: 'active' },
  ],

  kpiOverrides: {
    activeProjects: 8,
    monthlyRevenue: 24800,
    tasksDueThisWeek: 14,
    actionsToday: 127,
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
      score: 'hot', source_channel: 'prospect_discovery', source_detail: 'Quick Fix Plumbing',
      discovery_source: 'prospect_discovery',
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
      score: 'hot', source_channel: 'prospect_discovery', source_detail: 'Sunrise Accounting',
      discovery_source: 'prospect_discovery',
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
      id: 'seed-inv-1', invoice_number: 'INV-001', client_contact_id: 'seed-c1', client_name: 'Sarah Chen', client_email: 'sarah@acmecorp.com',
      total: 4950, subtotal: 4500, tax: 450, currency: 'AUD', status: 'overdue', due_date: daysAgo(14),
      issued_date: daysAgo(44), paid_date: null, created_at: daysAgo(45),
      project_reference: 'Acme Corp Rebrand',
      line_items: [
        { description: 'Website Redesign — Phase 1', quantity: 1, unit_price: 2500, total: 2500 },
        { description: 'SEO Audit & Report', quantity: 1, unit_price: 2000, total: 2000 },
      ],
    },
    {
      id: 'seed-inv-2', invoice_number: 'INV-002', client_contact_id: 'seed-c4', client_name: 'James Liu', client_email: 'james@liuventures.com',
      total: 13200, subtotal: 12000, tax: 1200, currency: 'AUD', status: 'overdue', due_date: daysAgo(7),
      issued_date: daysAgo(37), paid_date: null, created_at: daysAgo(38),
      project_reference: 'Liu Ventures Website Launch',
    },
    // 2 due this week
    {
      id: 'seed-inv-3', invoice_number: 'INV-003', client_contact_id: 'seed-c3', client_name: 'Olivia Park', client_email: 'olivia@parkdesign.co',
      total: 2800, currency: 'AUD', status: 'sent', due_date: daysFromNow(3),
      issued_date: daysAgo(27), paid_date: null, created_at: daysAgo(28),
    },
    {
      id: 'seed-inv-4', invoice_number: 'INV-004', client_contact_id: 'seed-c2', client_name: 'Marcus Webb', client_email: 'marcus@webbcorp.com',
      total: 6500, currency: 'AUD', status: 'sent', due_date: daysFromNow(5),
      issued_date: daysAgo(25), paid_date: null, created_at: daysAgo(26),
    },
    // 3 draft
    {
      id: 'seed-inv-5', invoice_number: 'INV-005', client_contact_id: 'seed-c5', client_name: 'Emma Rodriguez', client_email: 'emma@brightside.io',
      total: 3200, currency: 'AUD', status: 'draft', due_date: null,
      issued_date: null, paid_date: null, created_at: daysAgo(2),
    },
    {
      id: 'seed-inv-6', invoice_number: 'INV-006', client_contact_id: null, client_name: 'TechFlow Inc',
      total: 16500, subtotal: 15000, tax: 1500, currency: 'AUD', status: 'draft', due_date: daysFromNow(30),
      issued_date: null, paid_date: null, created_at: daysAgo(1),
      project_reference: 'TechFlow Full Rebrand',
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
      total: 24200, subtotal: 22000, tax: 2200, currency: 'AUD', status: 'sent', due_date: daysFromNow(21),
      issued_date: daysAgo(9), paid_date: null, created_at: daysAgo(10),
      project_reference: 'Summit E-commerce Build',
      line_items: [
        { description: 'E-commerce Platform Build', quantity: 1, unit_price: 15000, total: 15000 },
        { description: 'Payment Integration', quantity: 1, unit_price: 4000, total: 4000 },
        { description: 'Testing & QA', quantity: 1, unit_price: 3000, total: 3000 },
      ],
    },
    {
      id: 'seed-inv-9', invoice_number: 'INV-009', client_contact_id: 'seed-c1', client_name: 'Sarah Chen', client_email: 'sarah@acmecorp.com',
      total: 7200, currency: 'AUD', status: 'sent', due_date: daysFromNow(14),
      issued_date: daysAgo(16), paid_date: null, created_at: daysAgo(17),
    },
    // 3 paid
    {
      id: 'seed-inv-10', invoice_number: 'INV-010', client_contact_id: 'seed-c2', client_name: 'Marcus Webb', client_email: 'marcus@webbcorp.com',
      total: 5500, subtotal: 5000, tax: 500, currency: 'AUD', status: 'paid', due_date: daysAgo(10),
      issued_date: daysAgo(40), paid_date: daysAgo(3), created_at: daysAgo(41),
      project_reference: 'Webb Corp Portal', payment_method: 'bank_transfer',
    },
    {
      id: 'seed-inv-11', invoice_number: 'INV-011', client_contact_id: 'seed-c3', client_name: 'Olivia Park', client_email: 'olivia@parkdesign.co',
      total: 9400, currency: 'AUD', status: 'paid', due_date: daysAgo(20),
      issued_date: daysAgo(50), paid_date: daysAgo(10), created_at: daysAgo(51),
    },
    {
      id: 'seed-inv-12', invoice_number: 'INV-012', client_contact_id: 'seed-c4', client_name: 'James Liu', client_email: 'james@liuventures.com',
      total: 3600, currency: 'AUD', status: 'paid', due_date: daysAgo(30),
      issued_date: daysAgo(60), paid_date: daysAgo(20), created_at: daysAgo(61),
    },
  ],

  tenders: [
    // 5 × found (no fit_score)
    {
      id: 'seed-tend-1', title: 'Digital Transformation Advisory Services — Dept of Finance',
      source: 'austender', tender_number: 'ATM-2026-1234', url: 'https://austender.gov.au/ATM-2026-1234',
      value: 2500000, deadline: daysFromNow(45), status: 'open', fit_score: null,
      category: 'IT Consulting', created_at: daysAgo(2),
    },
    {
      id: 'seed-tend-2', title: 'Cloud Migration & Infrastructure Modernisation — QLD Health',
      source: 'qtenders', tender_number: 'QT-2026-5678', url: 'https://qtenders.qld.gov.au/QT-2026-5678',
      value: 1200000, deadline: daysFromNow(30), status: 'open', fit_score: null,
      category: 'Cloud Services', created_at: daysAgo(3),
    },
    {
      id: 'seed-tend-3', title: 'Cybersecurity Assessment & Remediation — NSW Transport',
      source: 'nsw', tender_number: 'NSW-ET-9012', url: 'https://tenders.nsw.gov.au/NSW-ET-9012',
      value: 480000, deadline: daysFromNow(21), status: 'open', fit_score: null,
      category: 'Cybersecurity', created_at: daysAgo(1),
    },
    {
      id: 'seed-tend-4', title: 'Data Analytics Platform Development — ABS',
      source: 'austender', tender_number: 'ATM-2026-3456', url: 'https://austender.gov.au/ATM-2026-3456',
      value: 850000, deadline: daysFromNow(14), status: 'open', fit_score: null,
      category: 'Data Analytics', created_at: daysAgo(5),
    },
    {
      id: 'seed-tend-5', title: 'Website Redesign & Accessibility Compliance — Dept of Education',
      source: 'austender', tender_number: 'ATM-2026-7890', url: 'https://austender.gov.au/ATM-2026-7890',
      value: 340000, deadline: daysFromNow(10), status: 'open', fit_score: null,
      category: 'Web Development', created_at: daysAgo(4),
    },
    // 3 × evaluating (have fit_score)
    {
      id: 'seed-tend-6', title: 'Enterprise Resource Planning Implementation — Dept of Defence',
      source: 'austender', tender_number: 'ATM-2026-2345', url: 'https://austender.gov.au/ATM-2026-2345',
      value: 1800000, deadline: daysFromNow(35), status: 'open', fit_score: 78,
      category: 'ERP', created_at: daysAgo(8),
    },
    {
      id: 'seed-tend-7', title: 'AI/ML Model Development for Fraud Detection — ASIC',
      source: 'austender', tender_number: 'ATM-2026-6789', url: 'https://austender.gov.au/ATM-2026-6789',
      value: 650000, deadline: daysFromNow(25), status: 'open', fit_score: 62,
      category: 'AI/ML', created_at: daysAgo(6),
    },
    {
      id: 'seed-tend-8', title: 'Managed IT Services — QLD Dept of Communities',
      source: 'qtenders', tender_number: 'QT-2026-1011', url: 'https://qtenders.qld.gov.au/QT-2026-1011',
      value: 420000, deadline: daysFromNow(18), status: 'open', fit_score: 45,
      category: 'IT Services', created_at: daysAgo(7),
    },
    // 2 × drafting (have responses in draft)
    {
      id: 'seed-tend-9', title: 'Software Testing & QA Services — Services Australia',
      source: 'austender', tender_number: 'ATM-2026-4567', url: 'https://austender.gov.au/ATM-2026-4567',
      value: 280000, deadline: daysFromNow(12), status: 'open', fit_score: 72,
      category: 'QA Testing', created_at: daysAgo(12),
    },
    {
      id: 'seed-tend-10', title: 'Network Infrastructure Upgrade — ATO',
      source: 'austender', tender_number: 'ATM-2026-8901', url: 'https://austender.gov.au/ATM-2026-8901',
      value: 560000, deadline: daysFromNow(8), status: 'open', fit_score: 65,
      category: 'Networking', created_at: daysAgo(15),
    },
    // 1 × submitted
    {
      id: 'seed-tend-11', title: 'UX Research & Service Design — DTA',
      source: 'austender', tender_number: 'ATM-2026-5432', url: 'https://austender.gov.au/ATM-2026-5432',
      value: 180000, deadline: daysFromNow(3), status: 'drafted', fit_score: 82,
      category: 'UX Design', created_at: daysAgo(20),
    },
    // 1 × won
    {
      id: 'seed-tend-12', title: 'IT Strategy Consulting — Dept of Home Affairs',
      source: 'austender', tender_number: 'ATM-2026-9876', url: 'https://austender.gov.au/ATM-2026-9876',
      value: 95000, deadline: daysAgo(10), status: 'open', fit_score: 88,
      category: 'IT Consulting', created_at: daysAgo(30),
    },
  ],

  capabilityProfiles: [
    {
      id: 'seed-cap-1',
      name: 'Digital Transformation',
      service_category: 'IT Consulting',
      skills: ['Cloud Architecture', 'Agile Delivery', 'Change Management', 'Enterprise Integration', 'Data Migration'],
      certifications: ['AWS Solutions Architect', 'PRINCE2', 'ITIL v4', 'Certified Scrum Master'],
      location_coverage: ['National', 'QLD', 'NSW', 'VIC'],
      max_contract_value: 3000000,
    },
    {
      id: 'seed-cap-2',
      name: 'IT Consulting & Advisory',
      service_category: 'Technology Advisory',
      skills: ['IT Strategy', 'Cybersecurity', 'Software Development', 'UX Design', 'Data Analytics'],
      certifications: ['CISSP', 'PMP', 'ISO 27001 Lead Auditor'],
      location_coverage: ['National', 'ACT'],
      max_contract_value: 2000000,
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
