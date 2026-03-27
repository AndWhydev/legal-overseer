'use client'

import { useState, useCallback } from 'react'
import { GlassDropdown } from '@/components/ui/glass-dropdown'
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
  { value: 'low', label: 'Low', color: 'text-gray-500' },
  { value: 'medium', label: 'Medium', color: 'text-amber-600' },
  { value: 'high', label: 'High', color: 'text-red-600' },
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
        <h1 className="text-base font-medium text-gray-900 tracking-tight">
          Requests
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-5 py-3 rounded-lg text-sm font-medium border-none transition-all"
          style={{
            background: showForm ? '#F3F4F6' : primaryColor,
            color: showForm ? '#374151' : '#FFFFFF',
          }}
        >
          {showForm ? 'Cancel' : 'New Request'}
        </button>
      </div>

      {/* New Request Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
          <h2 className="text-base font-medium text-gray-900 mb-5">
            Submit a Request
          </h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Brief summary of your request"
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm text-gray-900 bg-white outline-none transition-colors focus:border-blue-500"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Provide details about what you need..."
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm text-gray-900 bg-white outline-none transition-colors focus:border-blue-500 resize-y min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <GlassDropdown
                options={REQUEST_TYPES.map(t => ({ value: t.value, label: t.label }))}
                value={formData.request_type}
                onChange={v => setFormData(prev => ({ ...prev, request_type: v }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <GlassDropdown
                options={PRIORITY_OPTIONS.map(p => ({ value: p.value, label: p.label }))}
                value={formData.priority}
                onChange={v => setFormData(prev => ({ ...prev, priority: v }))}
              />
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
        <div className="rounded-xl border border-gray-200 bg-white px-16 py-16 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-base text-gray-500">No requests yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Submit a request to get help from your team.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {requests.map((req, i) => {
            const priority = PRIORITY_OPTIONS.find(p => p.value === req.priority)
            const typeLabel = REQUEST_TYPES.find(t => t.value === req.request_type)?.label ?? req.request_type

            return (
              <div
                key={req.id}
                className={`px-5 py-5 ${i < requests.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="text-base font-medium text-gray-900">
                        {req.title}
                      </h3>
                      <Badge variant={STATUS_VARIANT[req.status] ?? 'secondary'}>
                        {STATUS_LABEL[req.status] ?? req.status}
                      </Badge>
                    </div>
                    {req.description && (
                      <p className="text-sm text-gray-500 mb-2 leading-relaxed">
                        {req.description.length > 200 ? `${req.description.slice(0, 200)}...` : req.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-400">{typeLabel}</span>
                      <span className={`text-sm font-medium ${priority?.color ?? 'text-gray-500'}`}>
                        {priority?.label ?? req.priority}
                      </span>
                      <span className="text-sm text-gray-400">
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
