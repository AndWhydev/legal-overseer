'use client'

import Link from 'next/link'
import {
  ArrowRight,
  MessageSquare,
  CheckCircle2,
  Clock,
  TrendingUp,
  Inbox,
  AlertTriangle,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Sample data for read-only dashboard preview
// ---------------------------------------------------------------------------

const SAMPLE_STATS = [
  { label: 'Messages Triaged', value: '1,247', change: '+12%', icon: Inbox },
  { label: 'Avg Response Time', value: '11 min', change: '-38%', icon: Clock },
  { label: 'Proposals Sent', value: '23', change: '+5', icon: TrendingUp },
  { label: 'Pending Approvals', value: '3', change: '', icon: AlertTriangle },
]

const SAMPLE_MESSAGES = [
  {
    id: 1,
    channel: 'Email',
    sender: 'Sarah Chen',
    subject: 'Q2 campaign budget approval',
    priority: 'high' as const,
    time: '9 min ago',
    status: 'AI Draft Ready',
  },
  {
    id: 2,
    channel: 'WhatsApp',
    sender: 'Marcus Webb',
    subject: 'Website launch timeline update',
    priority: 'medium' as const,
    time: '23 min ago',
    status: 'Auto-responded',
  },
  {
    id: 3,
    channel: 'Asana',
    sender: 'System',
    subject: 'Sprint review tasks overdue (2)',
    priority: 'medium' as const,
    time: '1 hr ago',
    status: 'Escalated',
  },
  {
    id: 4,
    channel: 'Stripe',
    sender: 'Stripe',
    subject: 'Invoice #1042 paid — AUD 4,500',
    priority: 'low' as const,
    time: '2 hrs ago',
    status: 'Logged',
  },
]

const SAMPLE_AGENTS = [
  { name: 'Channel Triage', status: 'active', lastRun: '2 min ago', actions: 14 },
  { name: 'Client Comms', status: 'active', lastRun: '9 min ago', actions: 7 },
  { name: 'Proposal Bot', status: 'idle', lastRun: '4 hrs ago', actions: 2 },
  { name: 'Tender Hunter', status: 'active', lastRun: '1 hr ago', actions: 3 },
]

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
}

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="bg-blue-600 text-white py-3 text-center text-sm">
        This is a read-only demo with sample data.{' '}
        <Link href="/pricing" className="underline font-medium">
          Start your free trial
        </Link>{' '}
        to connect your own channels.
      </div>

      <nav className="flex items-center justify-between max-w-6xl mx-auto px-6 py-4">
        <span className="text-xl font-bold tracking-tight">BitBit Demo</span>
        <Link
          href="/pricing"
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 transition inline-flex items-center gap-1"
        >
          Get Started <ArrowRight size={14} />
        </Link>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {SAMPLE_STATS.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                  <Icon size={16} />
                  {s.label}
                </div>
                <div className="text-2xl font-bold">{s.value}</div>
                {s.change && (
                  <div className="text-xs text-green-600 mt-1">{s.change} this week</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Unified Inbox Preview */}
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <MessageSquare size={18} /> Unified Inbox
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {SAMPLE_MESSAGES.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${PRIORITY_COLORS[m.priority]}`}
                  >
                    {m.priority}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      [{m.channel}] {m.subject}
                    </div>
                    <div className="text-xs text-gray-500">
                      {m.sender} &middot; {m.time}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-gray-500 shrink-0 flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-green-500" />
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Agent Status */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Agent Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SAMPLE_AGENTS.map((a) => (
              <div
                key={a.name}
                className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-sm">{a.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Last run: {a.lastRun} &middot; {a.actions} actions
                  </div>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    a.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
