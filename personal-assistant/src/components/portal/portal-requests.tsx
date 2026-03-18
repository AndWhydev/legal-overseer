'use client'

<<<<<<< HEAD
import { useState } from 'react'
import type { PortalRequest, PortalProject } from '@/lib/portal/types'

interface PortalRequestsProps {
  requests: PortalRequest[]
  projects: PortalProject[]
  orgSlug: string
  primary: string
}

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  submitted: { bg: '#eff6ff', color: '#2563eb', label: 'Submitted' },
  acknowledged: { bg: '#fef3c7', color: '#d97706', label: 'Acknowledged' },
  in_progress: { bg: '#f0f9ff', color: '#0284c7', label: 'In Progress' },
  completed: { bg: '#ecfdf5', color: '#059669', label: 'Completed' },
  closed: { bg: '#f3f4f6', color: '#6b7280', label: 'Closed' },
}

const TYPE_LABELS: Record<string, string> = {
  change_request: 'Change Request',
  bug_report: 'Bug Report',
  question: 'Question',
  feedback: 'Feedback',
}

export function PortalRequests({ requests, projects, orgSlug, primary }: PortalRequestsProps) {
  const [showForm, setShowForm] = useState(false)
  const [localRequests, setLocalRequests] = useState(requests)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'change_request' as const,
    priority: 'medium' as const,
    project_id: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const res = await fetch(`/api/portal/requests?slug=${orgSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          project_id: form.project_id || undefined,
        }),
      })

      if (!res.ok) throw new Error('Failed to submit')

      const { request } = await res.json()
      setLocalRequests(prev => [request, ...prev])
      setShowForm(false)
      setForm({ title: '', description: '', type: 'change_request', priority: 'medium', project_id: '' })
    } catch {
      // Error handled silently
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    color: '#1a1a2e',
    backgroundColor: '#ffffff',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 4,
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#1a1a2e', margin: 0 }}>Requests</h2>
=======
import { useState, useCallback } from 'react'
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
  { value: 'low', label: 'Low', color: '#6B7280' },
  { value: 'medium', label: 'Medium', color: '#D97706' },
  { value: 'high', label: 'High', color: '#DC2626' },
  { value: 'urgent', label: 'Urgent', color: '#7C3AED' },
]

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  submitted: { bg: '#EFF6FF', text: '#2563EB', label: 'Submitted' },
  reviewed: { bg: '#FEF3C7', text: '#D97706', label: 'Reviewed' },
  in_progress: { bg: '#F0FDF4', text: '#16A34A', label: 'In Progress' },
  completed: { bg: '#ECFDF5', text: '#059669', label: 'Completed' },
  closed: { bg: '#F3F4F6', text: '#6B7280', label: 'Closed' },
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
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
          Requests
        </h1>
>>>>>>> v1.5-marketing-launch
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '10px 20px',
<<<<<<< HEAD
            backgroundColor: showForm ? '#f3f4f6' : primary,
            color: showForm ? '#374151' : '#ffffff',
            borderRadius: 8,
=======
            borderRadius: 8,
            background: showForm ? '#F3F4F6' : primaryColor,
            color: showForm ? '#374151' : '#FFFFFF',
>>>>>>> v1.5-marketing-launch
            fontSize: 14,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
<<<<<<< HEAD
            transition: 'all 0.15s',
=======
            transition: 'all 150ms',
>>>>>>> v1.5-marketing-launch
          }}
        >
          {showForm ? 'Cancel' : 'New Request'}
        </button>
      </div>

      {/* New Request Form */}
      {showForm && (
<<<<<<< HEAD
        <form
          onSubmit={handleSubmit}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 12,
            border: '1px solid #e5e7eb',
            padding: 24,
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={labelStyle}>Title *</label>
              <input
                style={inputStyle}
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Brief summary of your request"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Type</label>
                <select
                  style={inputStyle}
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as typeof form.type }))}
                >
                  <option value="change_request">Change Request</option>
                  <option value="bug_report">Bug Report</option>
                  <option value="question">Question</option>
                  <option value="feedback">Feedback</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Priority</label>
                <select
                  style={inputStyle}
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value as typeof form.priority }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              {projects.length > 0 && (
                <div>
                  <label style={labelStyle}>Project</label>
                  <select
                    style={inputStyle}
                    value={form.project_id}
                    onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                  >
                    <option value="">None</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe your request in detail..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={submitting || !form.title}
                style={{
                  padding: '10px 24px',
                  backgroundColor: primary,
                  color: '#ffffff',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  border: 'none',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Request List */}
      {localRequests.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', color: '#9ca3af' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128172;</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>No requests yet</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>Submit a request to get in touch with your team.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {localRequests.map(req => {
            const statusInfo = STATUS_CONFIG[req.status] || STATUS_CONFIG.submitted
=======
        <form onSubmit={handleSubmit} style={{ ...cardStyle, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: '0 0 20px' }}>
            Submit a Request
          </h2>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Brief summary of your request"
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Provide details about what you need..."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select
                value={formData.request_type}
                onChange={e => setFormData(prev => ({ ...prev, request_type: e.target.value }))}
                style={inputStyle}
              >
                {REQUEST_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select
                value={formData.priority}
                onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                style={inputStyle}
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !formData.title.trim()}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              background: primaryColor,
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 500,
              border: 'none',
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting || !formData.title.trim() ? 0.6 : 1,
              transition: 'opacity 150ms',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      )}

      {/* Requests List */}
      {requests.length === 0 ? (
        <div style={{ ...cardStyle, padding: 64, textAlign: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p style={{ fontSize: 16, color: '#6B7280' }}>No requests yet</p>
          <p style={{ fontSize: 14, color: '#9CA3AF', marginTop: 4 }}>
            Submit a request to get help from your team.
          </p>
        </div>
      ) : (
        <div style={cardStyle}>
          {requests.map((req, i) => {
            const sc = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.submitted
            const priority = PRIORITY_OPTIONS.find(p => p.value === req.priority)
            const typeLabel = REQUEST_TYPES.find(t => t.value === req.request_type)?.label ?? req.request_type

>>>>>>> v1.5-marketing-launch
            return (
              <div
                key={req.id}
                style={{
<<<<<<< HEAD
                  backgroundColor: '#ffffff',
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', margin: 0 }}>{req.title}</h3>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>{TYPE_LABELS[req.type] || req.type}</span>
                      <span style={{ fontSize: 12, color: '#d1d5db' }}>&middot;</span>
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>
                        {new Date(req.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 12,
                    padding: '3px 10px',
                    borderRadius: 6,
                    backgroundColor: statusInfo.bg,
                    color: statusInfo.color,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}>
                    {statusInfo.label}
                  </span>
                </div>
                {req.description && (
                  <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
                    {req.description}
                  </p>
                )}
=======
                  padding: '18px 20px',
                  borderBottom: i < requests.length - 1 ? '1px solid #F3F4F6' : 'none',
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 500, color: '#111827', margin: 0 }}>
                        {req.title}
                      </h3>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: sc.bg,
                          color: sc.text,
                        }}
                      >
                        {sc.label}
                      </span>
                    </div>
                    {req.description && (
                      <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 8px', lineHeight: 1.5 }}>
                        {req.description.length > 200 ? `${req.description.slice(0, 200)}...` : req.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>{typeLabel}</span>
                      <span style={{ fontSize: 12, color: priority?.color ?? '#6B7280', fontWeight: 500 }}>
                        {priority?.label ?? req.priority}
                      </span>
                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                        {new Date(req.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>
>>>>>>> v1.5-marketing-launch
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
<<<<<<< HEAD
=======

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 12,
  border: '1px solid #E5E7EB',
  overflow: 'hidden',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#374151',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #D1D5DB',
  fontSize: 14,
  color: '#111827',
  background: '#FFFFFF',
  outline: 'none',
  transition: 'border-color 150ms',
  fontFamily: 'inherit',
}
>>>>>>> v1.5-marketing-launch
