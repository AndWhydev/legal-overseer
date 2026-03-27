'use client'

import React, { useState, useCallback, memo } from 'react'
import { IconPlus, IconVariable } from '@tabler/icons-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'

interface TemplateEditorPanelProps {
  open: boolean
  onClose: () => void
  onSave: (data: {
    name: string
    subject: string
    body: string
    variables: string[]
    category: string
  }) => void
  initial?: {
    name?: string
    subject?: string
    body?: string
    variables?: string[]
    category?: string
  }
}

const AVAILABLE_VARIABLES = [
  { key: 'firstName', label: 'First Name' },
  { key: 'name', label: 'Full Name' },
  { key: 'company', label: 'Company' },
  { key: 'domain', label: 'Domain' },
  { key: 'services', label: 'Services' },
  { key: 'outreachAngle', label: 'Outreach Angle' },
]

const CATEGORIES = [
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'demo_request', label: 'Demo Request' },
  { value: 'nurture', label: 'Nurture' },
]

function TemplateEditorPanelInner({ open, onClose, onSave, initial }: TemplateEditorPanelProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'cold_outreach')

  const handleInsertVariable = useCallback((varKey: string) => {
    setBody(prev => prev + `{{${varKey}}}`)
  }, [])

  const handleSave = useCallback(() => {
    if (!name.trim() || !subject.trim() || !body.trim()) return

    const allText = subject + body
    const usedVars = AVAILABLE_VARIABLES
      .filter(v => allText.includes(`{{${v.key}}}`))
      .map(v => v.key)

    onSave({
      name: name.trim(),
      subject: subject.trim(),
      body: body.trim(),
      variables: usedVars,
      category,
    })
  }, [name, subject, body, category, onSave])

  const canSave = name.trim() && subject.trim() && body.trim()

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Email Template</SheetTitle>
          <SheetDescription>Create a reusable email template for campaigns.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Cold Outreach - SEO Audit"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-subject">Subject Line</Label>
            <Input
              id="template-subject"
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Quick question about {{company}}"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Insert Variables</Label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_VARIABLES.map(v => (
                <Badge
                  key={v.key}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => handleInsertVariable(v.key)}
                  title={`Insert {{${v.key}}}`}
                >
                  <IconVariable data-icon />
                  {v.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-body">Email Body (HTML)</Label>
            <Textarea
              id="template-body"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={`Hi {{firstName}},\n\nI noticed {{company}} doesn't have...\n\nWould you be open to a quick chat?\n\nBest regards`}
              className="min-h-60 font-mono text-xs"
            />
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            <IconPlus data-icon />
            Save Template
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export const TemplateEditorPanel = memo(TemplateEditorPanelInner)
