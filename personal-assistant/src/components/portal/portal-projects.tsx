'use client'

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
    active: { bg: '#ECFDF5', text: 'var(--success)', label: 'Active' },
    on_hold: { bg: '#FEF3C7', text: 'var(--warning)', label: 'On Hold' },
    completed: { bg: 'var(--muted)', text: 'var(--muted-foreground)', label: 'Completed' },
    cancelled: { bg: '#FEF2F2', text: 'var(--destructive)', label: 'Cancelled' },
  }

  return (
    <div>
      <h1 className="mb-6 text-base font-medium tracking-tight text-foreground">
        Projects
      </h1>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-16 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke='var(--border)' strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4">
            <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7-6H4a2 2 0 0 0-2 2z" />
            <path d="M14 2v6h6" />
          </svg>
          <p className="text-base text-muted-foreground">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Your projects will appear here once they are set up.</p>
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
                  className="w-full text-left cursor-pointer rounded-xl bg-card transition-all duration-200"
                  style={{
                    padding: 24,
                    border: isSelected ? `2px solid ${primaryColor}` : '1px solid var(--border)',
                  }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-base font-medium text-foreground">
                      {project.title}
                    </h3>
                    <span
                      className="text-sm font-medium px-3 py-1 rounded-lg"
                      style={{ background: sc.bg, color: sc.text }}
                    >
                      {sc.label}
                    </span>
                  </div>

                  {project.description && (
                    <p className="text-sm text-muted-foreground mb-4 mt-0 leading-relaxed">
                      {project.description}
                    </p>
                  )}

                  {project.current_phase && (
                    <p className="text-sm text-muted-foreground mb-3 mt-0">
                      Current phase: <span className="font-medium text-foreground">{project.current_phase}</span>
                    </p>
                  )}

                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Progress</span>
                      <span className="text-sm font-medium text-foreground">{project.progress}%</span>
                    </div>
                    <div className="h-2 rounded-lg bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-lg transition-[width] duration-500 ease-in-out"
                        style={{
                          background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}CC)`,
                          width: `${project.progress}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-4">
                    {project.start_date && (
                      <span className="text-sm text-muted-foreground">
                        Started: {new Date(project.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {project.target_date && (
                      <span className="text-sm text-muted-foreground">
                        Target: {new Date(project.target_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </button>

                {/* Task List (expanded) */}
                {isSelected && (
                  <div className="rounded-xl border border-border bg-card overflow-hidden mt-2">
                    <div className="px-5 py-3 border-b border-muted font-medium text-sm text-foreground">
                      Project Milestones & Tasks
                    </div>
                    {loadingTasks ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        Loading...
                      </div>
                    ) : tasks.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        No tasks linked to this project yet.
                      </div>
                    ) : (
                      tasks.map((task, i) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 px-5 py-3"
                          style={{
                            borderBottom: i < tasks.length - 1 ? '1px solid var(--muted)' : 'none',
                          }}
                        >
                          <div
                            className="flex items-center justify-center shrink-0"
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: task.is_milestone ? 4 : '50%',
                              border: task.task_status === 'completed'
                                ? `2px solid 'var(--success)'`
                                : '2px solid var(--border)',
                              background: task.task_status === 'completed' ? 'var(--success)' : 'transparent',
                            }}
                          >
                            {task.task_status === 'completed' && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke='var(--card)' strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <span
                              className={`text-sm ${task.task_status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'} ${task.is_milestone ? 'font-medium' : 'font-normal'}`}
                            >
                              {task.is_milestone && (
                                <span className="mr-2 text-sm" style={{ color: primaryColor }}>MILESTONE</span>
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
