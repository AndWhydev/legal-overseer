'use client'

import React, { useState, useMemo, memo } from 'react'
import { IconSend, IconUsers, IconMail } from '@tabler/icons-react'
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
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { EnhancedLeadData } from '@/lib/leads/types'
import type { EmailTemplate } from '@/hooks/use-campaigns'

interface CampaignCreatePanelProps {
  open: boolean
  onClose: () => void
  onCreate: (data: {
    name: string
    templateId: string
    leadIds: string[]
    dailyLimit: number
  }) => void
  templates: EmailTemplate[]
  leads: EnhancedLeadData[]
}

function CampaignCreatePanelInner({
  open,
  onClose,
  onCreate,
  templates,
  leads,
}: CampaignCreatePanelProps) {
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set())
  const [dailyLimit, setDailyLimit] = useState(50)

  const emailableLeads = useMemo(
    () => leads.filter(l => l.prospect_emails && l.prospect_emails.length > 0 && l.status !== 'converted' && l.status !== 'lost'),
    [leads],
  )

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  const selectAll = () => {
    if (selectedLeadIds.size === emailableLeads.length) {
      setSelectedLeadIds(new Set())
    } else {
      setSelectedLeadIds(new Set(emailableLeads.map(l => l.id)))
    }
  }

  const handleCreate = () => {
    if (!name.trim() || !templateId || selectedLeadIds.size === 0) return
    onCreate({
      name: name.trim(),
      templateId,
      leadIds: Array.from(selectedLeadIds),
      dailyLimit,
    })
    setName('')
    setTemplateId('')
    setSelectedLeadIds(new Set())
    setDailyLimit(50)
    onClose()
  }

  const canCreate = name.trim() && templateId && selectedLeadIds.size > 0

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Create Campaign</SheetTitle>
          <SheetDescription>Set up a new email outreach campaign.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Campaign Name</Label>
            <Input
              id="campaign-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Car Yards Sydney - SEO Audit"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Email Template</Label>
            {templates.length > 0 ? (
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No templates yet. Create one first.
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="daily-limit">Daily Send Limit</Label>
            <Input
              id="daily-limit"
              type="number"
              value={dailyLimit}
              onChange={e => setDailyLimit(Math.max(1, Math.min(1000, Number(e.target.value))))}
              min={1}
              max={1000}
              className="w-24"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Select Leads ({emailableLeads.length} with email)</Label>
              <Button variant="link" size="sm" onClick={selectAll} className="h-auto p-0 text-sm">
                {selectedLeadIds.size === emailableLeads.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border">
              {emailableLeads.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No leads with email addresses found. Import prospects first.
                </div>
              ) : (
                emailableLeads.map(lead => {
                  const selected = selectedLeadIds.has(lead.id)
                  const displayName = lead.prospect_name ?? lead.source_detail ?? lead.id.slice(0, 8)
                  return (
                    <div
                      key={lead.id}
                      onClick={() => toggleLead(lead.id)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-muted',
                        selected && 'bg-muted'
                      )}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleLead(lead.id)}
                      />
                      <span className="flex-1 text-sm font-medium text-foreground">{displayName}</span>
                      <span className="text-sm text-muted-foreground">{lead.prospect_emails?.[0]}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row items-center justify-between border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconUsers data-icon />
            {selectedLeadIds.size} recipients
            {templateId && (
              <>
                <IconMail data-icon className="ml-2" />
                {templates.find(t => t.id === templateId)?.name ?? 'Template'}
              </>
            )}
          </div>
          <Button onClick={handleCreate} disabled={!canCreate}>
            <IconSend data-icon /> Create Campaign
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export const CampaignCreatePanel = memo(CampaignCreatePanelInner)
