'use client'

import { useState, useCallback } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { PortalRequest } from '@/lib/portal/types'

interface PortalRequestsViewProps {
  initialRequests: PortalRequest[]
  primaryColor: string
}

const REQUEST_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'change_request', label: 'Change Request' },
  { value: 'bug_report', label: 'Bug Report' },
  { value: 'new_work', label: 'New Work' },
  { value: 'question', label: 'Question' },
  { value: 'feedback', label: 'Feedback' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-muted-foreground' },
  { value: 'medium', label: 'Medium', color: 'text-amber-600' },
  { value: 'high', label: 'High', color: 'text-destructive' },
  { value: 'urgent', label: 'Urgent', color: 'text-violet-600' },
]

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  submitted: 'default',
  reviewed: 'secondary',
  in_progress: 'default',
  completed: 'default',
  closed: 'outline',
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  reviewed: 'Reviewed',
  in_progress: 'In Progress',
  completed: 'Completed',
  closed: 'Closed',
}

export function PortalRequestsView({ initialRequests, primaryColor }: PortalRequestsViewProps) {
  const [requests, setRequests] = useState<PortalRequest[]>(initialRequests)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    request_type: 'general',
    priority: 'medium',
  })

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/portal/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        const data = await res.json()
        setRequests(prev => [data.request, ...prev])
        setFormData({ title: '', description: '', request_type: 'general', priority: 'medium' })
        setShowForm(false)
      }
    } catch {
      // Handle error silently
    } finally {
      setSubmitting(false)
    }
  }, [formData])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-medium text-foreground tracking-tight">
          Requests
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-5 py-3 rounded-lg text-sm font-medium border-none transition-all"
          style={{
            background: showForm ? 'var(--muted)' : primaryColor,
            color: showForm ? 'var(--foreground)' : 'var(--card)',
          }}
        >
          {showForm ? 'Cancel' : 'New Request'}
        </button>
      </div>

      {/* New Request Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-background p-6 mb-6">
          <h2 className="text-base font-medium text-foreground mb-5">
            Submit a Request
          </h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-2">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Brief summary of your request"
              required
              className="w-full px-4 py-3 rounded-lg border border-border text-sm text-foreground bg-background outline-none transition-colors focus:border-primary"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Provide details about what you need..."
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-border text-sm text-foreground bg-background outline-none transition-colors focus:border-primary resize-y min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Type</label>
              <Select value={formData.request_type} onValueChange={v => setFormData(prev => ({ ...prev, request_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Priority</label>
              <Select value={formData.priority} onValueChange={v => setFormData(prev => ({ ...prev, priority: v }))}>
                <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !formData.title.trim()}
            className="px-6 py-3 rounded-lg text-sm text-white font-medium border-none transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: primaryColor }}
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      )}

      {/* Requests List */}
      {requests.length === 0 ? (
        <div className="rounded-xl border border-border bg-background px-16 py-16 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke='var(--border)' strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-base text-muted-foreground">No requests yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Submit a request to get help from your team.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background overflow-hidden">
          {requests.map((req, i) => {
            const priority = PRIORITY_OPTIONS.find(p => p.value === req.priority)
            const typeLabel = REQUEST_TYPES.find(t => t.value === req.request_type)?.label ?? req.request_type

            return (
              <div
                key={req.id}
                className={`px-5 py-5 ${i < requests.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="text-base font-medium text-foreground">
                        {req.title}
                      </h3>
                      <Badge variant={STATUS_VARIANT[req.status] ?? 'secondary'}>
                        {STATUS_LABEL[req.status] ?? req.status}
                      </Badge>
                    </div>
                    {req.description && (
                      <p className="text-sm text-muted-foreground mb-2 leading-relaxed">
                        {req.description.length > 200 ? `${req.description.slice(0, 200)}...` : req.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">{typeLabel}</span>
                      <span className={`text-sm font-medium ${priority?.color ?? 'text-muted-foreground'}`}>
                        {priority?.label ?? req.priority}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
