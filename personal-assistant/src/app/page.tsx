import Link from 'next/link'
import {
  Zap,
  MessageSquare,
  BarChart3,
  Shield,
  Clock,
  Users,
  ArrowRight,
} from 'lucide-react'

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Channel Triage',
    description: 'AI classifies and routes messages from email, WhatsApp, Asana, and Slack in real time.',
  },
  {
    icon: Zap,
    title: 'Client Comms',
    description: 'Draft responses in your voice with sentiment analysis and contact enrichment.',
  },
  {
    icon: BarChart3,
    title: 'Revenue Agents',
    description: 'Auto-generate proposals, track invoices, and onboard new clients hands-free.',
  },
  {
    icon: Shield,
    title: 'Approval Flow',
    description: 'High-confidence actions auto-execute. Everything else queues for your review.',
  },
  {
    icon: Clock,
    title: 'Growth Automation',
    description: 'Ad scripts, AI search optimisation, and tender hunting run on autopilot.',
  },
  {
    icon: Users,
    title: 'Multi-Tenant',
    description: 'Isolated organisations with role-based access and per-org billing.',
  },
]

const TESTIMONIALS = [
  {
    quote: 'BitBit cut our email response time from 4 hours to 12 minutes.',
    author: 'Andy W.',
    role: 'Agency Owner',
  },
  {
    quote: 'The proposal generator alone paid for the subscription in week one.',
    author: 'Beta Tester',
    role: 'Digital Consultant',
  },
]

export default function MarketingHomePage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="flex items-center justify-between max-w-6xl mx-auto px-6 py-5">
        <span className="text-xl font-bold tracking-tight">BitBit</span>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/pricing" className="hover:text-gray-600">Pricing</Link>
          <Link href="/demo" className="hover:text-gray-600">Demo</Link>
          <Link
            href="/login"
            className="bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-bold leading-tight tracking-tight">
          AI Operations for
          <br />
          Digital Agencies
        </h1>
        <p className="mt-5 text-lg text-gray-500 max-w-2xl mx-auto">
          Automate client comms, triage channels, generate proposals, and grow revenue
          with autonomous AI agents that work in your voice.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/pricing"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition inline-flex items-center gap-2"
          >
            Start Free Trial <ArrowRight size={16} />
          </Link>
          <Link
            href="/demo"
            className="border border-gray-300 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition"
          >
            See Demo
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-semibold text-center mb-10">
          Everything your agency needs
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title} className="border border-gray-200 rounded-xl p-6">
                <Icon size={24} className="text-blue-600 mb-3" />
                <h3 className="font-semibold mb-1">{f.title}</h3>
                <p className="text-sm text-gray-500">{f.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-semibold text-center mb-10">What people are saying</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {TESTIMONIALS.map((t) => (
              <blockquote key={t.author} className="bg-white rounded-xl p-6 border border-gray-200">
                <p className="text-gray-700 italic">&quot;{t.quote}&quot;</p>
                <footer className="mt-3 text-sm text-gray-500">
                  {t.author} &mdash; {t.role}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to automate your agency?</h2>
        <p className="text-gray-500 mb-8">14-day free trial. No credit card required.</p>
        <Link
          href="/pricing"
          className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition inline-flex items-center gap-2"
        >
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <span>BitBit Pty Ltd</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-gray-700">Terms</Link>
            <Link href="/privacy" className="hover:text-gray-700">Privacy</Link>
            <Link href="/pricing" className="hover:text-gray-700">Pricing</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
