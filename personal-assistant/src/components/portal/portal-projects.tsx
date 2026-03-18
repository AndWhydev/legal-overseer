'use client'

import type { PortalProject } from '@/lib/portal/types'

interface PortalProjectsProps {
  projects: PortalProject[]
  primary: string
}

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: '#ecfdf5', color: '#059669', label: 'Active' },
  completed: { bg: '#eff6ff', color: '#2563eb', label: 'Completed' },
  paused: { bg: '#fef3c7', color: '#d97706', label: 'Paused' },
  cancelled: { bg: '#fef2f2', color: '#dc2626', label: 'Cancelled' },
}

export function PortalProjects({ projects, primary }: PortalProjectsProps) {
  if (projects.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 24px', color: '#9ca3af' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#128196;</div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>No projects yet</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>Your projects will appear here once they begin.</div>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, color: '#1a1a2e' }}>Projects</h2>
      <div style={{ display: 'grid', gap: 16 }}>
        {projects.map(project => {
          const statusInfo = STATUS_CONFIG[project.status] || STATUS_CONFIG.active
          const progress = typeof project.metadata?.progress === 'number' ? project.metadata.progress : null

          return (
            <div
              key={project.id}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                padding: 24,
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e', margin: 0 }}>{project.name}</h3>
                  {project.description && (
                    <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0', lineHeight: 1.5 }}>
                      {project.description}
                    </p>
                  )}
                </div>
                <span style={{
                  fontSize: 12,
                  padding: '4px 12px',
                  borderRadius: 6,
                  backgroundColor: statusInfo.bg,
                  color: statusInfo.color,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}>
                  {statusInfo.label}
                </span>
              </div>

              {/* Progress bar */}
              {progress !== null && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Progress</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: primary }}>{progress}%</span>
                  </div>
                  <div style={{ height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(0, progress))}%`,
                      backgroundColor: primary,
                      borderRadius: 3,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              )}

              {/* Dates */}
              <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#9ca3af' }}>
                {project.started_at && (
                  <span>Started {new Date(project.started_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                )}
                {project.completed_at && (
                  <span>Completed {new Date(project.completed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
