'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconX, IconChevronDown, IconCalendar, IconTag, IconTrash, IconPencil } from '@tabler/icons-react'
import type { Task, KanbanColumn } from '@/lib/types'
import { MarkdownRenderer } from './markdown-renderer'

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: Task | null
  columns: KanbanColumn[]
  defaultColumnId?: string
  onSave: (data: {
    title: string
    description: string
    column_id: string
    priority: string
    tags: string[]
    deadline: string
  }) => void
  onDelete?: (taskId: string) => void
}

const priorityOptions = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const priorityDotColors: Record<string, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: 'var(--text-dim)',
  low: 'var(--text-dim)',
}

const chipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 12px',
  borderRadius: 20,
  background: 'var(--glass-pill-bg)',
  boxShadow: 'var(--glass-card-inset)',
  border: 'none',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s, color 0.15s',
  whiteSpace: 'nowrap' as const,
}

const chipHover: React.CSSProperties = {
  background: 'var(--glass-card-bg)',
  color: 'var(--text-secondary)',
}

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  minWidth: 160,
  background: 'var(--glass-card-bg)',
  backdropFilter: 'var(--glass-card-blur)',
  WebkitBackdropFilter: 'var(--glass-card-blur)',
  borderRadius: 12,
  boxShadow: 'var(--card-shadow-hover), var(--glass-card-inset)',
  padding: '8px',
  zIndex: 10,
  overflow: 'hidden',
}

const readChipStyle: React.CSSProperties = {
  ...chipBase,
  cursor: 'default',
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  columns,
  defaultColumnId,
  onSave,
  onDelete,
}: TaskDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [columnId, setColumnId] = useState('')
  const [priority, setPriority] = useState('medium')
  const [tags, setTags] = useState('')
  const [deadline, setDeadline] = useState('')
  const [activeMenu, setActiveMenu] = useState<'column' | 'priority' | 'tags' | 'deadline' | null>(null)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [showDescription, setShowDescription] = useState(false)

  const titleRef = useRef<HTMLInputElement>(null)
  const tagsInputRef = useRef<HTMLInputElement>(null)
  const deadlineInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setColumnId(task.column_id || '')
      setPriority(task.priority)
      setTags(((task.metadata?.tags as string[]) || []).join(', '))
      setDeadline((task.metadata?.deadline as string) || '')
      setShowDescription(!!task.description)
      setEditMode(false)
    } else {
      setTitle('')
      setDescription('')
      setColumnId(defaultColumnId || columns[0]?.id || '')
      setPriority('medium')
      setTags('')
      setDeadline('')
      setShowDescription(false)
      setEditMode(true)
    }
  }, [task, defaultColumnId, columns])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeMenu) {
          setActiveMenu(null)
        } else if (editMode && task) {
          setEditMode(false)
        } else {
          onOpenChange(false)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange, activeMenu, editMode, task])

  useEffect(() => {
    if (open) {
      setActiveMenu(null)
      setHoveredItem(null)
      if (!task) setTimeout(() => titleRef.current?.focus(), 60)
    }
  }, [open, task])

  useEffect(() => {
    if (editMode) setTimeout(() => titleRef.current?.focus(), 60)
  }, [editMode])

  useEffect(() => {
    if (activeMenu === 'tags') setTimeout(() => tagsInputRef.current?.focus(), 30)
    if (activeMenu === 'deadline') setTimeout(() => deadlineInputRef.current?.focus(), 30)
  }, [activeMenu])

  function handleSubmit() {
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      description: description.trim(),
      column_id: columnId,
      priority,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      deadline: deadline.trim(),
    })
    onOpenChange(false)
  }

  if (!open || !mounted) return null

  const selectedColumn = columns.find((c) => c.id === columnId)
  const selectedPriority = priorityOptions.find((p) => p.value === priority)
  const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean)

  const meta = (task?.metadata || {}) as Record<string, unknown>
  const sourceChannel = meta.source_channel as string | undefined
  const isAiCreated = meta.source === 'bitbit'

  return createPortal(
    <>
      <style>{`
        @keyframes td-in {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes td-bg-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .td-title::placeholder { color: var(--text-dim); }
        .td-desc::placeholder { color: var(--text-dim); }
        .td-inline-input::placeholder { color: var(--text-dim); }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false)
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '18vh',
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          animation: 'td-bg-in 120ms ease-out both',
        }}
      >
        {/* Panel */}
        <div
          onClick={() => activeMenu && setActiveMenu(null)}
          style={{
            width: editMode ? 440 : 520,
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--glass-card-bg)',
            backdropFilter: 'var(--glass-card-blur)',
            WebkitBackdropFilter: 'var(--glass-card-blur)',
            borderRadius: 16,
            boxShadow: 'var(--card-shadow-hover), var(--glass-card-inset)',
            overflow: 'visible',
            animation: 'td-in 180ms cubic-bezier(0.16, 1, 0.3, 1) both',
            transition: 'width 0.2s ease',
          }}
        >
          {editMode ? (
            /* ========== EDIT MODE ========== */
            <>
              {/* Title input */}
              <div style={{ padding: '20px 22px 0' }}>
                <input
                  ref={titleRef}
                  className="td-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmit()
                    }
                  }}
                  placeholder="What needs to be done?"
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: 16,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    padding: 0,
                    fontFamily: 'inherit',
                    letterSpacing: '-0.01em',
                  }}
                />
              </div>

              {/* Description */}
              <div style={{ padding: '0 22px' }}>
                {showDescription ? (
                  <textarea
                    className="td-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add notes... (Markdown supported)"
                    rows={4}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: 14,
                      color: 'var(--text-secondary)',
                      padding: '8px 0 0',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      lineHeight: 1.5,
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setShowDescription(true)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      fontSize: 14,
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '8px 0 0',
                      fontFamily: 'inherit',
                    }}
                  >
                    + Add notes
                  </button>
                )}
              </div>

              {/* Metadata chips */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '16px 24px',
                flexWrap: 'wrap',
              }}>
                {/* Column chip */}
                <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                  <button
                    style={{ ...chipBase, ...(activeMenu === 'column' ? chipHover : {}) }}
                    onMouseEnter={(e) => {
                      if (activeMenu !== 'column') Object.assign(e.currentTarget.style, chipHover)
                    }}
                    onMouseLeave={(e) => {
                      if (activeMenu !== 'column') {
                        e.currentTarget.style.background = chipBase.background as string
                        e.currentTarget.style.color = chipBase.color as string
                      }
                    }}
                    onClick={() => setActiveMenu(activeMenu === 'column' ? null : 'column')}
                  >
                    {selectedColumn?.title || 'Column'}
                    <IconChevronDown size={11} style={{
                      transition: 'transform 150ms',
                      transform: activeMenu === 'column' ? 'rotate(180deg)' : 'none',
                      opacity: 0.6,
                    }} />
                  </button>
                  {activeMenu === 'column' && (
                    <div style={menuStyle}>
                      {columns.map((col) => {
                        const isActive = col.id === columnId
                        const isHov = hoveredItem === `c-${col.id}`
                        return (
                          <button
                            key={col.id}
                            onClick={() => { setColumnId(col.id); setActiveMenu(null) }}
                            onMouseEnter={() => setHoveredItem(`c-${col.id}`)}
                            onMouseLeave={() => setHoveredItem(null)}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: 'none',
                              background: isActive
                                ? 'var(--glass-interactive-border)'
                                : isHov
                                  ? 'var(--glass-interactive-bg)'
                                  : 'transparent',
                              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                              fontSize: 14,
                              fontWeight: isActive ? 600 : 400,
                              cursor: 'pointer',
                              textAlign: 'left',
                              fontFamily: 'inherit',
                              transition: 'background 0.1s',
                            }}
                          >
                            {col.title}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Priority chip */}
                <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                  <button
                    style={{ ...chipBase, ...(activeMenu === 'priority' ? chipHover : {}) }}
                    onMouseEnter={(e) => {
                      if (activeMenu !== 'priority') Object.assign(e.currentTarget.style, chipHover)
                    }}
                    onMouseLeave={(e) => {
                      if (activeMenu !== 'priority') {
                        e.currentTarget.style.background = chipBase.background as string
                        e.currentTarget.style.color = chipBase.color as string
                      }
                    }}
                    onClick={() => setActiveMenu(activeMenu === 'priority' ? null : 'priority')}
                  >
                    {selectedPriority?.label || 'Priority'}
                    <IconChevronDown size={11} style={{
                      transition: 'transform 150ms',
                      transform: activeMenu === 'priority' ? 'rotate(180deg)' : 'none',
                      opacity: 0.6,
                    }} />
                  </button>
                  {activeMenu === 'priority' && (
                    <div style={menuStyle}>
                      {priorityOptions.map((opt) => {
                        const isActive = opt.value === priority
                        const isHov = hoveredItem === `p-${opt.value}`
                        return (
                          <button
                            key={opt.value}
                            onClick={() => { setPriority(opt.value); setActiveMenu(null) }}
                            onMouseEnter={() => setHoveredItem(`p-${opt.value}`)}
                            onMouseLeave={() => setHoveredItem(null)}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: 'none',
                              background: isActive
                                ? 'var(--glass-interactive-border)'
                                : isHov
                                  ? 'var(--glass-interactive-bg)'
                                  : 'transparent',
                              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                              fontSize: 14,
                              fontWeight: isActive ? 600 : 400,
                              cursor: 'pointer',
                              textAlign: 'left',
                              fontFamily: 'inherit',
                              transition: 'background 0.1s',
                            }}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Tag chips + add */}
                {tagList.map((tag) => (
                  <span key={tag} style={{
                    ...chipBase,
                    cursor: 'default',
                    paddingRight: 8,
                    gap: 4,
                  }}>
                    {tag}
                    <button
                      onClick={() => setTags(tagList.filter((t) => t !== tag).join(', '))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <IconX size={10} />
                    </button>
                  </span>
                ))}

                <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                  <button
                    style={{ ...chipBase, ...(activeMenu === 'tags' ? chipHover : {}) }}
                    onMouseEnter={(e) => {
                      if (activeMenu !== 'tags') Object.assign(e.currentTarget.style, chipHover)
                    }}
                    onMouseLeave={(e) => {
                      if (activeMenu !== 'tags') {
                        e.currentTarget.style.background = chipBase.background as string
                        e.currentTarget.style.color = chipBase.color as string
                      }
                    }}
                    onClick={() => setActiveMenu(activeMenu === 'tags' ? null : 'tags')}
                  >
                    <IconTag size={11} style={{ opacity: 0.6 }} />
                    Tag
                  </button>
                  {activeMenu === 'tags' && (
                    <div style={{ ...menuStyle, minWidth: 180, padding: '8px 12px' }}>
                      <input
                        ref={tagsInputRef}
                        className="td-inline-input"
                        placeholder="Type tag, press Enter"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const val = (e.target as HTMLInputElement).value.trim()
                            if (val && !tagList.includes(val)) {
                              setTags(tagList.length > 0 ? tags + ', ' + val : val)
                            }
                            ;(e.target as HTMLInputElement).value = ''
                          }
                          if (e.key === 'Escape') {
                            e.stopPropagation()
                            setActiveMenu(null)
                          }
                        }}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          fontSize: 14,
                          color: 'var(--text-primary)',
                          padding: 0,
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Deadline chip */}
                <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                  <button
                    style={{
                      ...chipBase,
                      ...(activeMenu === 'deadline' ? chipHover : {}),
                      ...(deadline ? { color: 'var(--text-secondary)' } : {}),
                    }}
                    onMouseEnter={(e) => {
                      if (activeMenu !== 'deadline') Object.assign(e.currentTarget.style, chipHover)
                    }}
                    onMouseLeave={(e) => {
                      if (activeMenu !== 'deadline') {
                        e.currentTarget.style.background = chipBase.background as string
                        e.currentTarget.style.color = deadline ? 'var(--text-secondary)' : chipBase.color as string
                      }
                    }}
                    onClick={() => setActiveMenu(activeMenu === 'deadline' ? null : 'deadline')}
                  >
                    <IconCalendar size={11} style={{ opacity: 0.6 }} />
                    {deadline || 'Date'}
                  </button>
                  {activeMenu === 'deadline' && (
                    <div style={{ ...menuStyle, minWidth: 160, padding: '8px 12px' }}>
                      <input
                        ref={deadlineInputRef}
                        className="td-inline-input"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        placeholder="e.g. Mar 15"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            setActiveMenu(null)
                          }
                          if (e.key === 'Escape') {
                            e.stopPropagation()
                            setActiveMenu(null)
                          }
                        }}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          fontSize: 14,
                          color: 'var(--text-primary)',
                          padding: 0,
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 24px',
                borderTop: '1px solid var(--glass-divider)',
              }}>
                <div>
                  {task && onDelete && (
                    <button
                      onClick={() => { onDelete(task.id); onOpenChange(false) }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-dim)',
                        fontSize: 14,
                        cursor: 'pointer',
                        padding: '4px 0',
                        fontFamily: 'inherit',
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
                    >
                      <IconTrash size={13} />
                      Delete
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => {
                      if (task) { setEditMode(false) } else { onOpenChange(false) }
                    }}
                    style={{
                      ...chipBase,
                      color: 'var(--text-dim)',
                    }}
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, chipHover)}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = chipBase.background as string
                      e.currentTarget.style.color = 'var(--text-dim)'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    style={{
                      ...chipBase,
                      background: 'var(--glass-interactive-border)',
                      color: 'var(--text-primary)',
                      fontWeight: 500,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--glass-interactive-border)'
                    }}
                  >
                    {task ? 'Update' : 'Create'}
                    <kbd style={{
                      fontSize: 14,
                      color: 'var(--text-dim)',
                      fontFamily: 'inherit',
                      marginLeft: 4,
                    }}>↵</kbd>
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* ========== READ MODE ========== */
            <>
              {/* Header: title + edit button */}
              <div style={{
                padding: '20px 22px 0',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <h2 style={{
                  flex: 1,
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  lineHeight: 1.35,
                  letterSpacing: '-0.01em',
                }}>
                  {task?.title}
                </h2>
                <button
                  onClick={() => setEditMode(true)}
                  style={{
                    background: 'var(--glass-pill-bg)',
                    border: 'none',
                    borderRadius: 8,
                    padding: 8,
                    cursor: 'pointer',
                    color: 'var(--text-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'color 0.15s, background 0.15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)'
                    e.currentTarget.style.background = 'var(--glass-card-bg)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-dim)'
                    e.currentTarget.style.background = 'var(--glass-pill-bg)'
                  }}
                  title="Edit task"
                >
                  <IconPencil size={14} />
                </button>
              </div>

              {/* Source badge */}
              {isAiCreated && sourceChannel && (
                <div style={{ padding: '6px 22px 0' }}>
                  <span style={{
                    fontSize: 14,
                    color: 'var(--text-dim)',
                    fontStyle: 'italic',
                  }}>
                    Auto-created from {sourceChannel}
                  </span>
                </div>
              )}

              {/* Description (rendered Markdown) */}
              {task?.description && (
                <div style={{ padding: '12px 22px 0' }}>
                  <MarkdownRenderer content={task.description} />
                </div>
              )}

              {/* Metadata chips (read-only) */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '16px 24px',
                flexWrap: 'wrap',
              }}>
                {/* Column */}
                <span style={readChipStyle}>
                  {selectedColumn?.title || 'No column'}
                </span>

                {/* Priority with dot */}
                <span style={{ ...readChipStyle, gap: 4 }}>
                  <span style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: priorityDotColors[task?.priority || 'medium'] || 'var(--text-dim)',
                    flexShrink: 0,
                  }} />
                  {selectedPriority?.label || task?.priority}
                </span>

                {/* Tags */}
                {tagList.map((tag) => (
                  <span key={tag} style={readChipStyle}>{tag}</span>
                ))}

                {/* Deadline */}
                {deadline && (
                  <span style={{ ...readChipStyle, gap: 4 }}>
                    <IconCalendar size={11} style={{ opacity: 0.6 }} />
                    {deadline}
                  </span>
                )}
              </div>

              {/* Footer */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 24px',
                borderTop: '1px solid var(--glass-divider)',
              }}>
                <div>
                  {task && onDelete && (
                    <button
                      onClick={() => { onDelete(task.id); onOpenChange(false) }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-dim)',
                        fontSize: 14,
                        cursor: 'pointer',
                        padding: '4px 0',
                        fontFamily: 'inherit',
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
                    >
                      <IconTrash size={13} />
                      Delete
                    </button>
                  )}
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  style={{
                    ...chipBase,
                    color: 'var(--text-dim)',
                  }}
                  onMouseEnter={(e) => Object.assign(e.currentTarget.style, chipHover)}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = chipBase.background as string
                    e.currentTarget.style.color = 'var(--text-dim)'
                  }}
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  )
}
