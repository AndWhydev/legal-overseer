'use client'

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Copy,
  Check,
  Download,
  EyeOff,
  Eye,
  BatteryFull,
  Wifi,
  SignalHigh,
  Flashlight,
  Camera,
  Lock,
} from 'lucide-react'
import { TabShell } from '@/components/ui/tab-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useEnabledModules } from '@/lib/modules/use-enabled-modules'
import {
  composeCreatorStudioDeck,
  createDefaultCreatorStudioRequest,
  type CreatorStudioApp,
  type CreatorStudioModuleId,
  type CreatorStudioRequest,
} from '@/lib/creator-studio'

const APP_OPTIONS: Array<{ value: CreatorStudioApp; label: string }> = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'x', label: 'X' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'custom', label: 'Custom' },
]

const WALLPAPERS = [
  { value: 'sunset-grid', label: 'Sunset Grid' },
  { value: 'night-wave', label: 'Night Wave' },
  { value: 'paper-grain', label: 'Paper Grain' },
  { value: 'neon-city', label: 'Neon City' },
] as const

const MODULE_LABELS: Record<CreatorStudioModuleId, string> = {
  scene: 'Scene',
  'notification-stack': 'Notification Stack',
  appearance: 'Appearance',
  privacy: 'Privacy',
  export: 'Export',
}

const SELECT_CLASS =
  'h-12 w-full rounded-md border border-border bg-background pl-4 pr-10 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25'
const INPUT_CLASS = 'h-12 !px-4 !py-3 text-sm leading-[1.35]'

function wallpaperBgClass(wallpaper: string): string {
  if (wallpaper === 'night-wave') {
    return 'bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,.35),transparent_38%),radial-gradient(circle_at_80%_0%,rgba(15,23,42,.6),transparent_45%),linear-gradient(165deg,#060b1a_0%,#13223a_45%,#090f1f_100%)]'
  }
  if (wallpaper === 'paper-grain') {
    return 'bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,.65),transparent_42%),radial-gradient(circle_at_88%_80%,rgba(217,219,223,.6),transparent_45%),linear-gradient(165deg,#eceff3_0%,#d9dde3_55%,#c8d0d9_100%)]'
  }
  if (wallpaper === 'neon-city') {
    return 'bg-[radial-gradient(circle_at_15%_18%,rgba(236,72,153,.4),transparent_40%),radial-gradient(circle_at_82%_10%,rgba(34,211,238,.35),transparent_42%),linear-gradient(160deg,#23093b_0%,#42156a_50%,#0f1a4c_100%)]'
  }
  return 'bg-[radial-gradient(circle_at_18%_16%,rgba(255,245,157,.35),transparent_38%),radial-gradient(circle_at_84%_10%,rgba(244,114,182,.35),transparent_45%),linear-gradient(160deg,#f97316_0%,#ec4899_55%,#4f46e5_100%)]'
}

function isLightWallpaper(wallpaper: string): boolean {
  return wallpaper === 'paper-grain'
}

function labelForModule(moduleId: CreatorStudioModuleId): string {
  return MODULE_LABELS[moduleId] ?? moduleId
}

function StudioCard({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('bb-card rounded-2xl p-6 md:p-7', className)}>
      {children}
    </section>
  )
}

function StudioCardHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1.5 pr-2">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{title}</h2>
        {description ? <p className="max-w-[72ch] text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2.5">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--text-primary)]">
        {label}
      </label>
      {hint ? <p id={`${id}-hint`} className="text-xs text-[var(--text-secondary)]">{hint}</p> : null}
      {children}
    </div>
  )
}

function IOSPreview({ deck }: { deck: ReturnType<typeof composeCreatorStudioDeck> }) {
  const lightWallpaper = isLightWallpaper(deck.scene.wallpaper)
  const statusTone = lightWallpaper ? 'text-zinc-900' : 'text-white'
  const cardTone = lightWallpaper
    ? 'bg-white/84 text-zinc-900 border-zinc-200/70'
    : 'bg-white/16 text-white border-white/30'
  const glassTone = lightWallpaper ? 'bg-zinc-900/14 text-zinc-900' : 'bg-black/38 text-white'

  return (
    <StudioCard className="sticky top-4">
      <StudioCardHeader
        title="iPhone Preview"
        actions={<p className="text-xs text-[var(--text-secondary)]">{deck.meta.watermark}</p>}
      />

      <div className="space-y-4">
        <div className="rounded-xl border border-border/70 bg-background/45 px-4 py-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">{deck.caption}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{deck.shareHook}</p>
        </div>

        <div className="mx-auto w-full max-w-[410px]" aria-label="iOS lock-screen output">
          <div
            className="rounded-[52px] border p-2.5 shadow-2xl"
            style={{
              borderColor: 'rgba(255,255,255,0.14)',
              background: 'linear-gradient(170deg, var(--bg-primary), var(--bg-card))',
            }}
          >
            <div
              className={`relative h-[812px] overflow-hidden rounded-[42px] ${wallpaperBgClass(deck.scene.wallpaper)}`}
              style={{
                fontFamily:
                  '"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
              }}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_12%,rgba(255,255,255,.2),transparent_40%),radial-gradient(circle_at_72%_88%,rgba(255,255,255,.16),transparent_45%)]" />

              <div className="absolute left-1/2 top-3.5 z-20 h-7.5 w-[126px] -translate-x-1/2 rounded-full bg-black/82" />

              <div className={`absolute inset-x-6 top-6 z-20 flex items-center justify-between text-[13px] font-semibold ${statusTone}`}>
                <span>{deck.scene.carrier}</span>
                <div className="flex items-center gap-1.5">
                  <SignalHigh size={14} strokeWidth={2.4} />
                  <Wifi size={14} strokeWidth={2.4} />
                  <BatteryFull size={17} strokeWidth={2.4} />
                  <span className="text-[11px] font-bold">58%</span>
                </div>
              </div>

              <div className={`absolute inset-x-0 top-[106px] z-10 text-center ${statusTone}`}>
                <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-black/24 px-3 py-1 text-[11px] font-medium backdrop-blur-sm">
                  <Lock size={11} />
                  Lock Screen
                </div>
                <p className="text-[19px] font-medium tracking-tight opacity-90">{deck.scene.dateLabel}</p>
                <p className="mt-1 text-[70px] font-semibold leading-none tracking-[-0.045em]">{deck.scene.clock}</p>
              </div>

              <div className="absolute inset-x-4 bottom-[118px] top-[330px] z-10 overflow-y-auto px-2 pr-3">
                <div className="space-y-3 pb-4">
                  {deck.notifications.map((notification) => (
                    <article
                      key={notification.id}
                      className={`rounded-[18px] border px-5 py-4 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${cardTone}`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`flex h-6 w-6 items-center justify-center rounded-full ${glassTone}`}>
                            <span className="text-[12px]">{notification.icon}</span>
                          </div>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">
                            {notification.appLabel}
                          </span>
                        </div>
                        <span className="text-[11px] font-medium opacity-70">{notification.timeAgo}</span>
                      </div>
                      <p className="text-[13px] font-semibold leading-tight">{notification.headline}</p>
                      <p className="mt-1 text-[13px] leading-[1.35] opacity-90">{notification.body}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="absolute inset-x-6 bottom-8 z-20 flex items-center justify-between">
                <button
                  type="button"
                  className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/20 backdrop-blur-xl ${glassTone}`}
                  aria-label="Flashlight"
                >
                  <Flashlight size={20} />
                </button>
                <button
                  type="button"
                  className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/20 backdrop-blur-xl ${glassTone}`}
                  aria-label="Camera"
                >
                  <Camera size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </StudioCard>
  )
}

export default function CreatorStudioTab() {
  const { industry } = useEnabledModules()
  const [request, setRequest] = useState<CreatorStudioRequest>(() =>
    createDefaultCreatorStudioRequest(industry)
  )
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  useEffect(() => {
    setRequest(createDefaultCreatorStudioRequest(industry))
  }, [industry])

  const deck = useMemo(
    () => composeCreatorStudioDeck({ ...request, industry }),
    [request, industry]
  )

  const allowedAppOptions = useMemo(
    () => APP_OPTIONS.filter((option) => deck.meta.allowedApps.includes(option.value)),
    [deck.meta.allowedApps]
  )

  const defaultApp = allowedAppOptions[0]?.value ?? 'custom'
  const modules = request.moduleOrder ?? deck.meta.moduleOrder

  const setField = useCallback(
    <K extends keyof CreatorStudioRequest>(key: K, value: CreatorStudioRequest[K]) => {
      setRequest((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const updateNotification = useCallback(
    (
      index: number,
      patch: Partial<{
        app: CreatorStudioApp
        amount: string
        from: string
        timeAgo: string
        message: string
      }>
    ) => {
      setRequest((prev) => {
        const current = [...(prev.notifications ?? [])]
        const base = current[index] ?? { app: defaultApp }
        current[index] = { ...base, ...patch }
        return { ...prev, notifications: current }
      })
    },
    [defaultApp]
  )

  const addNotification = useCallback(() => {
    setRequest((prev) => {
      const current = [...(prev.notifications ?? [])]
      if (current.length >= deck.meta.maxNotifications) return prev
      current.push({
        app: defaultApp,
        amount: '$59',
        from: 'new@subscriber.com',
        timeAgo: '1m ago',
      })
      return { ...prev, notifications: current }
    })
  }, [deck.meta.maxNotifications, defaultApp])

  const removeNotification = useCallback((index: number) => {
    setRequest((prev) => {
      const current = [...(prev.notifications ?? [])]
      current.splice(index, 1)
      return { ...prev, notifications: current }
    })
  }, [])

  const moveModule = useCallback(
    (index: number, direction: -1 | 1) => {
      setRequest((prev) => {
        const order = [...(prev.moduleOrder ?? deck.meta.moduleOrder)]
        const next = index + direction
        if (next < 0 || next >= order.length) return prev
        const temp = order[index]
        order[index] = order[next]
        order[next] = temp
        return { ...prev, moduleOrder: order }
      })
    },
    [deck.meta.moduleOrder]
  )

  const copyJson = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify(deck, null, 2))
    setCopyState('copied')
    window.setTimeout(() => setCopyState('idle'), 1500)
  }, [deck])

  const copyToolPayload = useCallback(async () => {
    const payload = JSON.stringify(
      { name: 'compose_creator_notification_mockup', input: request },
      null,
      2
    )
    await navigator.clipboard.writeText(payload)
    setCopyState('copied')
    window.setTimeout(() => setCopyState('idle'), 1500)
  }, [request])

  const downloadManifest = useCallback(() => {
    const payload = JSON.stringify(deck, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `creator-studio-${deck.meta.industry}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [deck])

  return (
    <TabShell variant="fixed" padding="p-0" className="min-h-0 gap-0">
      <div className="h-full overflow-y-auto p-6 lg:p-8">
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-full border border-border/70 bg-background/45 px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
              {deck.notifications.length} Notifications
            </div>
            <Button
              variant="outline"
              className="h-11 px-5"
              onClick={() => setRequest(createDefaultCreatorStudioRequest(industry))}
            >
              <RefreshCw size={14} />
              Reset
            </Button>
          </div>

          <div className="grid gap-8 2xl:grid-cols-[minmax(0,1.2fr)_440px]">
            <div className="space-y-7" role="form" aria-label="Creator studio dashboard controls">
              <StudioCard>
                <StudioCardHeader title="Lock Screen" />
                <div className="space-y-4">
                  <p className="text-sm font-medium text-[var(--text-secondary)]">Time · Device Make · Carrier</p>
                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    <Field id="cs-time" label="Time" hint="Example: 8:42">
                      <Input
                        id="cs-time"
                        className={INPUT_CLASS}
                        value={request.clock ?? ''}
                        onChange={(e) => setField('clock', e.target.value)}
                        aria-describedby="cs-time-hint"
                      />
                    </Field>
                    <Field id="cs-device" label="Device Make">
                      <select
                        id="cs-device"
                        className={SELECT_CLASS}
                        value={request.device ?? 'iphone'}
                        onChange={(e) => setField('device', e.target.value as 'iphone' | 'android')}
                      >
                        <option value="iphone">iPhone</option>
                        <option value="android">Android</option>
                      </select>
                    </Field>
                    <Field id="cs-carrier" label="Carrier">
                      <Input
                        id="cs-carrier"
                        className={INPUT_CLASS}
                        value={request.carrier ?? ''}
                        onChange={(e) => setField('carrier', e.target.value)}
                      />
                    </Field>
                    <Field id="cs-date" label="Date">
                      <Input
                        id="cs-date"
                        className={INPUT_CLASS}
                        value={request.dateLabel ?? ''}
                        onChange={(e) => setField('dateLabel', e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </StudioCard>

              <StudioCard>
                <StudioCardHeader
                  title="Notification Stack"
                  actions={
                    <>
                      <span className="inline-flex items-center rounded-full border border-border/70 bg-background/45 px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                        {deck.notifications.length} Notifications
                      </span>
                      <Button
                        variant="outline"
                        className="h-11 px-5"
                        onClick={addNotification}
                        disabled={deck.notifications.length >= deck.meta.maxNotifications}
                      >
                        <Plus size={14} />
                        Add Notification
                      </Button>
                    </>
                  }
                />
                <div className="space-y-5">
                  {deck.notifications.map((notification, index) => (
                    <div
                      key={notification.id}
                      className="rounded-2xl border border-border/70 bg-background/45 p-5 md:p-6"
                      role="group"
                      aria-label={`Notification ${index + 1}`}
                    >
                      <div className="mb-5 flex items-start gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">Notification</p>
                          <p className="text-xs text-[var(--text-secondary)]">{notification.appLabel}</p>
                        </div>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="ml-auto"
                          onClick={() => removeNotification(index)}
                          disabled={deck.notifications.length <= 1}
                          aria-label={`Remove notification ${index + 1}`}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field id={`cs-app-${index}`} label="App">
                          <select
                            id={`cs-app-${index}`}
                            className={SELECT_CLASS}
                            value={notification.app}
                            onChange={(e) => updateNotification(index, { app: e.target.value as CreatorStudioApp })}
                          >
                            {allowedAppOptions.map((app) => (
                              <option key={app.value} value={app.value}>
                                {app.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field id={`cs-amount-${index}`} label="Amount">
                          <Input
                            id={`cs-amount-${index}`}
                            className={INPUT_CLASS}
                            value={request.notifications?.[index]?.amount ?? ''}
                            onChange={(e) => updateNotification(index, { amount: e.target.value })}
                          />
                        </Field>
                        <Field id={`cs-from-${index}`} label="From">
                          <Input
                            id={`cs-from-${index}`}
                            className={INPUT_CLASS}
                            value={request.notifications?.[index]?.from ?? ''}
                            onChange={(e) => updateNotification(index, { from: e.target.value })}
                          />
                        </Field>
                        <Field id={`cs-timeago-${index}`} label="Time Ago">
                          <Input
                            id={`cs-timeago-${index}`}
                            className={INPUT_CLASS}
                            value={request.notifications?.[index]?.timeAgo ?? ''}
                            onChange={(e) => updateNotification(index, { timeAgo: e.target.value })}
                          />
                        </Field>
                        <div className="md:col-span-2">
                          <Field id={`cs-message-${index}`} label="Custom Message (optional)">
                            <Input
                              id={`cs-message-${index}`}
                              className={INPUT_CLASS}
                              value={request.notifications?.[index]?.message ?? ''}
                              onChange={(e) => updateNotification(index, { message: e.target.value })}
                            />
                          </Field>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </StudioCard>

              <StudioCard>
                <StudioCardHeader title="Appearance" />
                <div className="grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Wallpaper selection">
                  {WALLPAPERS.map((wallpaper) => {
                    const active = request.wallpaper === wallpaper.value
                    return (
                      <button
                        key={wallpaper.value}
                        className="rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30"
                        style={{
                          borderColor: active ? 'var(--bb-orange)' : 'var(--border-subtle)',
                          background: active ? 'rgba(255,90,31,0.1)' : 'var(--glass-interactive-bg)',
                        }}
                        onClick={() => setField('wallpaper', wallpaper.value)}
                        role="radio"
                        aria-checked={active}
                        aria-label={`${wallpaper.label} wallpaper`}
                      >
                        <div className={`mb-3 h-16 rounded-lg ${wallpaperBgClass(wallpaper.value)}`} />
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{wallpaper.label}</p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {active ? 'Selected' : 'Tap to apply'}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </StudioCard>

              <StudioCard>
                <StudioCardHeader title="Privacy & Export" />
                <div className="space-y-4">
                  <button
                    className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-background/45 px-5 py-4 text-sm"
                    onClick={() => setField('hideSensitive', !request.hideSensitive)}
                    aria-pressed={Boolean(request.hideSensitive)}
                    aria-label="Toggle sensitive content masking"
                  >
                    <span className="flex items-center gap-2 text-[var(--text-primary)]">
                      {request.hideSensitive ? <EyeOff size={16} /> : <Eye size={16} />}
                      Hide sensitive content in rendered preview
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {request.hideSensitive ? 'Enabled' : 'Disabled'}
                    </span>
                  </button>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Button onClick={copyJson} variant="outline" className="h-12 px-4">
                      {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
                      {copyState === 'copied' ? 'Copied' : 'Copy JSON'}
                    </Button>
                    <Button onClick={downloadManifest} variant="outline" className="h-12 px-4">
                      <Download size={14} />
                      Download Manifest
                    </Button>
                    <Button onClick={copyToolPayload} className="h-12 px-4">
                      <Copy size={14} />
                      Copy AI Payload
                    </Button>
                  </div>
                </div>
              </StudioCard>

              <StudioCard>
                <StudioCardHeader title="Module Order" />
                <ol className="grid gap-3 sm:grid-cols-2" aria-label="Module order">
                  {modules.map((moduleId, index) => (
                    <li
                      key={`${moduleId}-${index}`}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-background/45 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
                          style={{ background: 'var(--glass-interactive-border)', color: 'var(--text-secondary)' }}
                        >
                          {index + 1}
                        </span>
                        <span className="text-sm text-[var(--text-primary)]">{labelForModule(moduleId)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => moveModule(index, -1)}
                          aria-label={`Move ${labelForModule(moduleId)} up`}
                        >
                          <ArrowUp size={14} />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => moveModule(index, 1)}
                          aria-label={`Move ${labelForModule(moduleId)} down`}
                        >
                          <ArrowDown size={14} />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              </StudioCard>
            </div>

            <div className="space-y-4">
              <IOSPreview deck={deck} />
            </div>
          </div>
        </div>
      </div>
    </TabShell>
  )
}
