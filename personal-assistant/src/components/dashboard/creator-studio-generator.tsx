'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { IconCopy, IconCheck, IconLoader2, IconTrash, IconPlus, IconSparkles } from '@tabler/icons-react'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { logger } from '@/lib/core/logger'

interface Template {
  id: string
  label: string
  description: string
  icon: string
}

interface GeneratedItem {
  id: string
  template_type: string
  inputs: {
    product_name: string
    target_audience: string
    tone: string
    length: string
  }
  output: string
  created_at: string
}

export function CreatorStudioGenerator() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [history, setHistory] = useState<GeneratedItem[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('ad_scripts')
  const [loading, setLoading] = useState(false)
  const [copyState, setCopyState] = useState<Record<string, boolean>>({})

  const [formInputs, setFormInputs] = useState({
    product_name: '',
    target_audience: '',
    tone: 'professional' as const,
    length: 'medium' as const,
  })

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch('/api/creator-studio/templates')
        const data = await res.json()
        setTemplates(data.templates || [])
      } catch (err) {
        logger.error('Failed to fetch templates:', err)
      }
    }
    fetchTemplates()
  }, [])

  // Fetch history
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/creator-studio/history?template_type=${selectedTemplate}&limit=20`)
      const data = await res.json()
      setHistory(data.items || [])
    } catch (err) {
      logger.error('Failed to fetch history:', err)
    }
  }, [selectedTemplate])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const handleGenerate = async () => {
    if (!formInputs.product_name || !formInputs.target_audience) {
      logger.warn('Missing required fields')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/creator-studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_type: selectedTemplate,
          inputs: formInputs,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        logger.error('Generation failed:', error)
        return
      }

      const data = await res.json()
      setHistory([data, ...history.slice(0, 19)])

      // Reset form
      setFormInputs({
        product_name: '',
        target_audience: '',
        tone: 'professional',
        length: 'medium',
      })
    } catch (err) {
      logger.error('Generation request failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopyState({ ...copyState, [id]: true })
    setTimeout(() => setCopyState({ ...copyState, [id]: false }), 1500)
  }

  return (
    <div className="grid h-full grid-cols-2 gap-6">
      {/* Left column: Generator */}
      <div className="h-full overflow-y-auto p-6">
        <h2 className="mb-2 text-base font-medium text-foreground">Generate Content</h2>
        <p className="mb-4 text-sm text-muted-foreground">Create ad scripts, social posts, emails, and more using AI</p>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            Template Type
          </label>
          <Select value={selectedTemplate} onValueChange={(v) => setSelectedTemplate(v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {templates.find((t) => t.id === selectedTemplate)?.description && (
            <p className="mt-2 text-sm text-muted-foreground">
              {templates.find((t) => t.id === selectedTemplate)?.description}
            </p>
          )}
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-sm font-medium text-foreground">
            Product Name
          </label>
          <input
            type="text"
            placeholder="e.g., SaaS Dashboard Pro"
            value={formInputs.product_name}
            onChange={(e) => setFormInputs({ ...formInputs, product_name: e.target.value })}
            className="w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-foreground">
            Target Audience
          </label>
          <input
            type="text"
            placeholder="e.g., Small business owners"
            value={formInputs.target_audience}
            onChange={(e) => setFormInputs({ ...formInputs, target_audience: e.target.value })}
            className="w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              Tone
            </label>
            <Select value={formInputs.tone} onValueChange={(v) => setFormInputs({ ...formInputs, tone: v as any })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="playful">Playful</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              Length
            </label>
            <Select value={formInputs.length} onValueChange={(v) => setFormInputs({ ...formInputs, length: v as any })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="long">Long</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || !formInputs.product_name || !formInputs.target_audience}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <IconLoader2 size={16} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <IconPlus size={16} />
              Generate Content
            </>
          )}
        </button>
      </div>

      {/* Right column: History */}
      <div className="h-full overflow-y-auto border-l border-border p-6">
        <h2 className="mb-2 text-base font-medium text-foreground">Recent Generations</h2>
        <p className="mb-4 text-sm text-muted-foreground">Generated content appears here</p>

        {history.length === 0 ? (
          <Empty className="mt-6">
            <EmptyMedia variant="icon"><IconSparkles size={20} /></EmptyMedia>
            <EmptyTitle>Nothing generated yet</EmptyTitle>
            <EmptyDescription>Generated content will appear here.</EmptyDescription>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {history.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-muted/50 p-3">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">
                      {item.inputs.product_name}
                    </p>
                    <p className="text-sm text-muted-foreground/60">
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopy(item.output, item.id)}
                    className="cursor-pointer border-none bg-transparent p-1 text-muted-foreground"
                    title="Copy to clipboard"
                  >
                    {copyState[item.id] ? (
                      <IconCheck size={14} className="text-emerald-500" />
                    ) : (
                      <IconCopy size={14} />
                    )}
                  </button>
                </div>
                <p className="max-h-[100px] overflow-hidden text-sm leading-relaxed text-foreground text-ellipsis">
                  {item.output}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
