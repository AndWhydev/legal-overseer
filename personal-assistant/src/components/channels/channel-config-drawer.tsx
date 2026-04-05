'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  IconRefresh,
  IconDeviceFloppy,
  IconPlugOff,
  IconLoader2,
  IconClock,
  IconMail,
  IconCheckbox,
  IconCalendarTime,
  IconCreditCard,
  IconPhone,
} from '@tabler/icons-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const SYNC_FREQUENCY_OPTIONS = [
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
  { label: '15 min', value: 900 },
  { label: '30 min', value: 1800 },
  { label: '1 hr', value: 3600 },
]

const STRIPE_EVENT_TYPES = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.deleted',
  'charge.refunded',
]

const channelIcons: Record<string, React.ElementType> = {
  gmail: IconMail,
  outlook: IconMail,
  asana: IconCheckbox,
  calendly: IconCalendarTime,
  stripe: IconCreditCard,
  whatsapp: IconPhone,
}

interface ChannelConfig {
  sync_frequency: number
  relay_enabled: boolean
  last_sync: string | null
  // Gmail/Outlook
  folder_filter?: string
  // Asana
  workspace_id?: string
  workspaces?: { id: string; name: string }[]
  // Calendly
  event_type_filter?: string
  // Stripe
  event_types?: string[]
  // WhatsApp
  session_status?: string
}

interface ChannelConfigDrawerProps {
  channel: string | null
  orgId?: string
  isOpen: boolean
  onClose: () => void
  onDisconnect?: (channel: string) => void
  onToast?: (message: string, type: 'success' | 'error') => void
}

export function ChannelConfigDrawer({
  channel,
  isOpen,
  onClose,
  onDisconnect,
  onToast,
}: ChannelConfigDrawerProps) {
  const [config, setConfig] = useState<ChannelConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const fetchConfig = useCallback(async () => {
    if (!channel) return
    setLoading(true)
    try {
      const res = await fetch(`/api/channels/${channel}/config`)
      if (res.ok) {
        const data = await res.json()
        setConfig(data.config || {
          sync_frequency: 300,
          relay_enabled: true,
          last_sync: null,
        })
      } else {
        // Fallback defaults
        setConfig({
          sync_frequency: 300,
          relay_enabled: true,
          last_sync: null,
        })
      }
    } catch {
      setConfig({
        sync_frequency: 300,
        relay_enabled: true,
        last_sync: null,
      })
    } finally {
      setLoading(false)
    }
  }, [channel])

  useEffect(() => {
    if (isOpen && channel) {
      fetchConfig()
      setDirty(false)
    }
  }, [isOpen, channel, fetchConfig])

  function updateConfig(partial: Partial<ChannelConfig>) {
    setConfig(prev => prev ? { ...prev, ...partial } : null)
    setDirty(true)
  }

  async function handleSave() {
    if (!channel || !config) return
    setSaving(true)
    try {
      const res = await fetch(`/api/channels/${channel}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        setDirty(false)
        onToast?.(`${channel} config saved`, 'success')
      } else {
        const data = await res.json()
        onToast?.(data.error || 'Failed to save config', 'error')
      }
    } catch {
      onToast?.('Network error saving config', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    if (!channel) return
    if (!confirm(`Disconnect ${channel}? Your synced messages will be preserved.`)) return
    onDisconnect?.(channel)
    onClose()
  }

  const Icon = channel ? channelIcons[channel] || IconMail : IconMail

  return (
    <Sheet open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {channel ? channel.charAt(0).toUpperCase() + channel.slice(1) : ''} Configuration
          </SheetTitle>
          <SheetDescription>
            Manage sync settings and filters for this channel.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : config ? (
          <div className="flex flex-col gap-6 px-4 py-4">
            {/* Last sync info */}
            {config.last_sync && (
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
                <IconClock className="h-3 w-3" />
                Last synced: {new Date(config.last_sync).toLocaleString()}
              </div>
            )}

            {/* Sync frequency */}
            <div>
              <label className="text-sm font-medium text-foreground">Sync Frequency</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {SYNC_FREQUENCY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => updateConfig({ sync_frequency: opt.value })}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      config.sync_frequency === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:border-border'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Relay enabled toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Relay Enabled</p>
                <p className="text-sm text-muted-foreground">Auto-process incoming messages</p>
              </div>
              <Switch
                checked={config.relay_enabled}
                onCheckedChange={(checked) => updateConfig({ relay_enabled: checked })}
              />
            </div>

            {/* Channel-specific config */}
            {(channel === 'gmail' || channel === 'outlook') && (
              <div>
                <label className="text-sm font-medium text-foreground">
                  {channel === 'gmail' ? 'Label' : 'Folder'} Filter
                </label>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Comma-separated {channel === 'gmail' ? 'labels' : 'folders'} to sync (leave empty for all)
                </p>
                <input
                  type="text"
                  value={config.folder_filter || ''}
                  onChange={e => updateConfig({ folder_filter: e.target.value })}
                  placeholder={channel === 'gmail' ? 'INBOX, IMPORTANT' : 'Inbox, Sent Items'}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
            )}

            {channel === 'asana' && (
              <div>
                <label className="text-sm font-medium text-foreground">Workspace</label>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Select which Asana workspace to sync
                </p>
                {config.workspaces && config.workspaces.length > 0 ? (
                  <div className="mt-1.5">
                    <Select
                      value={config.workspace_id || ''}
                      onValueChange={v => updateConfig({ workspace_id: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All workspaces" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All workspaces</SelectItem>
                        {config.workspaces.map(ws => (
                          <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={config.workspace_id || ''}
                    onChange={e => updateConfig({ workspace_id: e.target.value })}
                    placeholder="Workspace ID (optional)"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
            )}

            {channel === 'calendly' && (
              <div>
                <label className="text-sm font-medium text-foreground">Event Type Filter</label>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Filter by event type name (leave empty for all)
                </p>
                <input
                  type="text"
                  value={config.event_type_filter || ''}
                  onChange={e => updateConfig({ event_type_filter: e.target.value })}
                  placeholder="30 Minute Meeting, Discovery Call"
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
            )}

            {channel === 'stripe' && (
              <div>
                <label className="text-sm font-medium text-foreground">Event Types</label>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Select which Stripe events to process
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {STRIPE_EVENT_TYPES.map(evt => {
                    const checked = config.event_types?.includes(evt) ?? true
                    return (
                      <label key={evt} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const current = config.event_types || STRIPE_EVENT_TYPES
                            const next = checked
                              ? current.filter(e => e !== evt)
                              : [...current, evt]
                            updateConfig({ event_types: next })
                          }}
                          className="h-4 w-4 rounded-lg border-border text-primary focus:ring-ring"
                        />
                        <span className="tabular-nums text-sm text-foreground">{evt}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {channel === 'whatsapp' && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground">Session Status</label>
                  <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                    <span className={cn(
                      'h-2 w-2 rounded-full',
                      config.session_status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
                    )} />
                    <span className="text-sm capitalize text-foreground">
                      {config.session_status || 'Pending setup'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onToast?.('Reconnect initiated (Phase 15)', 'success')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <IconRefresh className="h-3 w-3" />
                  Reconnect Session
                </button>
              </div>
            )}

            {/* Save button */}
            <div className="border-t border-border pt-4">
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  dirty
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'cursor-not-allowed bg-secondary text-muted-foreground'
                )}
              >
                {saving ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconDeviceFloppy className="h-4 w-4" />}
                {saving ? 'Saving...' : dirty ? 'Save Changes' : 'No Changes'}
              </button>
            </div>

            {/* Disconnect (danger zone) */}
            <div className="border-t border-border pt-4">
              <button
                onClick={handleDisconnect}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <IconPlugOff className="h-4 w-4" />
                Disconnect Channel
              </button>
              <p className="mt-1.5 text-center text-sm text-muted-foreground">
                Synced messages will be preserved
              </p>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
