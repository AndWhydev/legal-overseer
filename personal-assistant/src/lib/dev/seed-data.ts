/**
 * DEV-ONLY: Synthetic seed data for visual testing.
 * This file is gitignored and tree-shaken from production builds.
 * Toggle via DevToolbar → "Seed Data" switch.
 */

if (process.env.NODE_ENV !== 'development') {
  throw new Error('seed-data.ts must never be imported in production')
}

export interface SeedDataSet {
  inboxMessages: SeedInboxMessage[]
  kanbanTasks: SeedKanbanTask[]
  kpiOverrides: SeedKpiOverrides
  kanbanColumns: SeedKanbanColumn[]
  contacts: SeedContact[]
  leads: SeedLead[]
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
}

const now = new Date()
const ago = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString()

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
    { id: 'seed-l1', name: 'TechFlow Inc', email: 'hello@techflow.io', status: 'qualified', value: 15000 },
    { id: 'seed-l2', name: 'GreenLeaf Co', email: 'info@greenleaf.com', status: 'proposal', value: 8500 },
    { id: 'seed-l3', name: 'Summit Digital', email: 'ops@summit.digital', status: 'new', value: 22000 },
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
