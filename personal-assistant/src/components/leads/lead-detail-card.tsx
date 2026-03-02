'use client'

import { X } from 'lucide-react'
import type { LeadCardData } from './leads-kanban'

interface LeadDetailCardProps {
  lead: LeadCardData
  onClose: () => void
}

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  qualified: 'Qualified',
  booked: 'Booked',
  converted: 'Won',
  lost: 'Lost',
}

function formatCurrency(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function LeadDetailCard({ lead, onClose }: LeadDetailCardProps) {
  return (
    <div className="bb-leads-detail-overlay" onClick={onClose}>
      <div className="bb-leads-detail" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bb-leads-detail__header">
          <div>
            <div className="bb-leads-detail__title">
              {lead.source_detail || `Lead ${lead.id.slice(0, 8)}`}
            </div>
            <div className="bb-leads-detail__subtitle">{lead.source_channel}</div>
          </div>
          <button type="button" onClick={onClose} className="bb-leads-detail__close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="bb-leads-detail__body">
          {/* Score + Status */}
          <div className="bb-leads-detail__row">
            <span className="bb-leads-detail__badge" data-score={lead.score}>
              {lead.score}
            </span>
            <span className="bb-leads-detail__badge">
              {STATUS_LABEL[lead.status]}
            </span>
          </div>

          {/* Metrics */}
          <div className="bb-leads-detail__metrics">
            <div className="bb-leads-detail__metric">
              <div className="bb-leads-detail__metric-label">Value</div>
              <div className="bb-leads-detail__metric-value">{formatCurrency(lead.estimated_value)}</div>
            </div>
            <div className="bb-leads-detail__metric">
              <div className="bb-leads-detail__metric-label">Timeline</div>
              <div className="bb-leads-detail__metric-value">
                {typeof lead.timeline_days === 'number' ? `${lead.timeline_days} days` : '—'}
              </div>
            </div>
          </div>

          {/* Services */}
          {Array.isArray(lead.service_interest) && lead.service_interest.length > 0 && (
            <div>
              <div className="bb-leads-detail__section-title">Services</div>
              <div className="bb-leads-card__tags">
                {lead.service_interest.map((service: string) => (
                  <span key={service} className="bb-leads-card__tag">{service}</span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div>
              <div className="bb-leads-detail__section-title">Notes</div>
              <div className="bb-leads-detail__notes">{lead.notes}</div>
            </div>
          )}

          {/* Metadata */}
          {lead.metadata && Object.keys(lead.metadata).length > 0 && (
            <div>
              <div className="bb-leads-detail__section-title">Additional Info</div>
              <div className="flex flex-col gap-1">
                {Object.entries(lead.metadata).map(([key, value]) => (
                  <div key={key} className="bb-leads-detail__meta-row">
                    <span className="bb-leads-detail__meta-key">{key.replace(/_/g, ' ')}</span>
                    <span className="bb-leads-detail__meta-val">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lead ID */}
          <div className="bb-leads-detail__id">ID: {lead.id}</div>
        </div>
      </div>
    </div>
  )
}
