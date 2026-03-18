'use client'

<<<<<<< HEAD
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
=======
import { useState, useEffect, useCallback } from 'react'
import type { PortalProject, PortalProjectTask } from '@/lib/portal/types'

interface PortalProjectsViewProps {
  projects: PortalProject[]
  orgSlug: string
  primaryColor: string
}

export function PortalProjectsView({ projects, primaryColor }: PortalProjectsViewProps) {
  const [selectedProject, setSelectedProject] = useState<PortalProject | null>(null)
  const [tasks, setTasks] = useState<(PortalProjectTask & { task_title: string; task_status: string })[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)

  const loadProjectTasks = useCallback(async (projectId: string) => {
    setLoadingTasks(true)
    try {
      const res = await fetch(`/api/portal/projects?id=${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setTasks(data.tasks ?? [])
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingTasks(false)
    }
  }, [])

  useEffect(() => {
    if (selectedProject) loadProjectTasks(selectedProject.id)
  }, [selectedProject, loadProjectTasks])

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    planning: { bg: '#EFF6FF', text: '#2563EB', label: 'Planning' },
    active: { bg: '#ECFDF5', text: '#059669', label: 'Active' },
    on_hold: { bg: '#FEF3C7', text: '#D97706', label: 'On Hold' },
    completed: { bg: '#F3F4F6', text: '#6B7280', label: 'Completed' },
    cancelled: { bg: '#FEF2F2', text: '#DC2626', label: 'Cancelled' },
>>>>>>> v1.5-marketing-launch
  }

  return (
    <div>
<<<<<<< HEAD
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
=======
      <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', margin: '0 0 24px', letterSpacing: '-0.02em' }}>
        Projects
      </h1>

      {projects.length === 0 ? (
        <div style={{ ...cardStyle, padding: 64, textAlign: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
            <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7-6H4a2 2 0 0 0-2 2z" />
            <path d="M14 2v6h6" />
          </svg>
          <p style={{ fontSize: 16, color: '#6B7280' }}>No projects yet</p>
          <p style={{ fontSize: 14, color: '#9CA3AF', marginTop: 4 }}>Your projects will appear here once they are set up.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projects.map(project => {
            const sc = statusConfig[project.status] ?? statusConfig.active
            const isSelected = selectedProject?.id === project.id

            return (
              <div key={project.id}>
                <button
                  onClick={() => setSelectedProject(isSelected ? null : project)}
                  style={{
                    ...cardStyle,
                    padding: 24,
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: isSelected ? `2px solid ${primaryColor}` : '1px solid #E5E7EB',
                    transition: 'all 200ms ease',
                  }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 600, color: '#111827', margin: 0 }}>
                      {project.title}
                    </h3>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: sc.bg,
                        color: sc.text,
                      }}
                    >
                      {sc.label}
                    </span>
                  </div>

                  {project.description && (
                    <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 16px', lineHeight: 1.5 }}>
                      {project.description}
                    </p>
                  )}

                  {project.current_phase && (
                    <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 12px' }}>
                      Current phase: <span style={{ fontWeight: 500, color: '#374151' }}>{project.current_phase}</span>
                    </p>
                  )}

                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: '#6B7280' }}>Progress</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{project.progress}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: '#F3F4F6', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 4,
                          background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}CC)`,
                          width: `${project.progress}%`,
                          transition: 'width 500ms ease',
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4" style={{ marginTop: 16 }}>
                    {project.start_date && (
                      <span style={{ fontSize: 13, color: '#9CA3AF' }}>
                        Started: {new Date(project.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {project.target_date && (
                      <span style={{ fontSize: 13, color: '#9CA3AF' }}>
                        Target: {new Date(project.target_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </button>

                {/* Task List (expanded) */}
                {isSelected && (
                  <div style={{ ...cardStyle, marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', fontWeight: 600, fontSize: 14, color: '#111827' }}>
                      Project Milestones & Tasks
                    </div>
                    {loadingTasks ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
                        Loading...
                      </div>
                    ) : tasks.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
                        No tasks linked to this project yet.
                      </div>
                    ) : (
                      tasks.map((task, i) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3"
                          style={{
                            padding: '12px 20px',
                            borderBottom: i < tasks.length - 1 ? '1px solid #F9FAFB' : 'none',
                          }}
                        >
                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: task.is_milestone ? 4 : '50%',
                              border: task.task_status === 'completed'
                                ? `2px solid #059669`
                                : '2px solid #D1D5DB',
                              background: task.task_status === 'completed' ? '#059669' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {task.task_status === 'completed' && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <span
                              style={{
                                fontSize: 14,
                                color: task.task_status === 'completed' ? '#9CA3AF' : '#111827',
                                textDecoration: task.task_status === 'completed' ? 'line-through' : 'none',
                                fontWeight: task.is_milestone ? 500 : 400,
                              }}
                            >
                              {task.is_milestone && (
                                <span style={{ color: primaryColor, marginRight: 6, fontSize: 12 }}>MILESTONE</span>
                              )}
                              {task.display_name ?? task.task_title}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 12,
  border: '1px solid #E5E7EB',
}
>>>>>>> v1.5-marketing-launch
