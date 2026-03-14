'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown, Calendar, Tag, Trash2 } from 'lucide-react'
import type { Task, KanbanColumn } from '@/lib/types'

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

// Shared glass chip style (matches .bb-chat__chip)
const chipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 12px',
  borderRadius: 20,
  background: 'var(--glass-pill-bg)',
  boxShadow: 'var(--glass-card-inset)',
  border: 'none',
  fontSize: 12,
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

// Dropdown menu style
const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  minWidth: 160,
  background: 'var(--glass-card-bg)',
  backdropFilter: 'var(--glass-card-blur)',
  WebkitBackdropFilter: 'var(--glass-card-blur)',
  borderRadius: 14,
  boxShadow: 'var(--card-shadow-hover), var(--glass-card-inset)',
  padding: '6px',
  zIndex: 10,
  overflow: 'hidden',
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
    } else {
      setTitle('')
      setDescription('')
      setColumnId(defaultColumnId || columns[0]?.id || '')
      setPriority('medium')
      setTags('')
      setDeadline('')
      setShowDescription(false)
    }
  }, [task, defaultColumnId, columns])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeMenu) {
          setActiveMenu(null)
        } else {
          onOpenChange(false)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange, activeMenu])

  useEffect(() => {
    if (open) {
      setActiveMenu(null)
      setHoveredItem(null)
      setTimeout(() => titleRef.current?.focus(), 60)
    }
  }, [open])

  // Focus tag/deadline input when their menu opens
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
            width: 440,
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--glass-card-bg)',
            backdropFilter: 'var(--glass-card-blur)',
            WebkitBackdropFilter: 'var(--glass-card-blur)',
            borderRadius: 18,
            boxShadow: 'var(--card-shadow-hover), var(--glass-card-inset)',
            overflow: 'visible',
            animation: 'td-in 180ms cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          {/* Title area */}
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
                fontWeight: 600,
                color: 'var(--text-primary)',
                padding: 0,
                fontFamily: 'inherit',
                letterSpacing: '-0.01em',
              }}
            />
          </div>

          {/* Description — expandable */}
          <div style={{ padding: '0 22px' }}>
            {showDescription ? (
              <textarea
                className="td-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add notes..."
                rows={2}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  padding: '8px 0 0',
                  fontFamily: 'inherit',
                  resize: 'none',
                  lineHeight: 1.5,
                }}
              />
            ) : (
              <button
                onClick={() => { setShowDescription(true) }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 12,
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

          {/* Metadata chip row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '14px 22px',
            flexWrap: 'wrap',
          }}>
            {/* Column chip */}
            <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
              <button
                style={{
                  ...chipBase,
                  ...(activeMenu === 'column' ? chipHover : {}),
                }}
                onMouseEnter={(e) => {
                  if (activeMenu !== 'column') {
                    Object.assign(e.currentTarget.style, chipHover)
                  }
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
                <ChevronDown size={11} style={{
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
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: 'none',
                          background: isActive
                            ? 'var(--glass-interactive-border)'
                            : isHov
                              ? 'var(--glass-interactive-bg)'
                              : 'transparent',
                          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontSize: 12,
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
                style={{
                  ...chipBase,
                  ...(activeMenu === 'priority' ? chipHover : {}),
                }}
                onMouseEnter={(e) => {
                  if (activeMenu !== 'priority') {
                    Object.assign(e.currentTarget.style, chipHover)
                  }
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
                <ChevronDown size={11} style={{
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
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: 'none',
                          background: isActive
                            ? 'var(--glass-interactive-border)'
                            : isHov
                              ? 'var(--glass-interactive-bg)'
                              : 'transparent',
                          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontSize: 12,
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

            {/* Tag chips + add button */}
            {tagList.map((tag) => (
              <span key={tag} style={{
                ...chipBase,
                cursor: 'default',
                paddingRight: 6,
                gap: 4,
              }}>
                {tag}
                <button
                  onClick={() => {
                    const next = tagList.filter((t) => t !== tag).join(', ')
                    setTags(next)
                  }}
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
                  <X size={10} />
                </button>
              </span>
            ))}

            <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
              <button
                style={{
                  ...chipBase,
                  ...(activeMenu === 'tags' ? chipHover : {}),
                }}
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
                <Tag size={11} style={{ opacity: 0.6 }} />
                Tag
              </button>
              {activeMenu === 'tags' && (
                <div style={{ ...menuStyle, minWidth: 180, padding: '8px 10px' }}>
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
                      fontSize: 12,
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
                <Calendar size={11} style={{ opacity: 0.6 }} />
                {deadline || 'Date'}
              </button>
              {activeMenu === 'deadline' && (
                <div style={{ ...menuStyle, minWidth: 160, padding: '8px 10px' }}>
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
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      padding: 0,
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Divider + footer */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 22px',
            borderTop: '1px solid var(--glass-divider)',
          }}>
            <div>
              {task && onDelete && (
                <button
                  onClick={() => { onDelete(task.id); onOpenChange(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-dim)',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: '4px 0',
                    fontFamily: 'inherit',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                style={{
                  ...chipBase,
                  background: 'var(--glass-interactive-border)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
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
                  fontSize: 9,
                  color: 'var(--text-dim)',
                  fontFamily: 'inherit',
                  marginLeft: 2,
                }}>↵</kbd>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
