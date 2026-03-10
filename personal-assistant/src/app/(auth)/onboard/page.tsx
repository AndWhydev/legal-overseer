'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  CheckCircle2,
  Link2,
  Sparkles,
  Waves,
} from 'lucide-react'
import { ConnectionsGrid, getConnectionDisplayName } from '@/components/connections/connections-grid'
import { AuroraCharacter } from '@/components/onboarding/aurora-character'
import { SkyVideoBackdrop } from '@/components/onboarding/sky-video-backdrop'
import {
  canBacktrackToStage,
  OnboardingStageProgress,
  type OnboardingStage,
} from '@/components/onboarding/stage-progress'
import { loadOnboardingProfile } from '@/lib/onboarding/profile'
import {
  getWorkspaceId,
  hasCompletedFirstRunOnboarding,
  requiresWorkspaceConfirmation,
} from '@/lib/onboarding/state'

const INDUSTRIES = [
  { value: 'digital-agency', label: 'Digital agency' },
  { value: 'ecommerce', label: 'E commerce' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'real-estate', label: 'Real estate' },
  { value: 'professional-services', label: 'Professional services' },
  { value: 'other', label: 'Other' },
]

const SYNC_LINES = [
  'Pulling in recent messages and events',
  'Mapping people and conversations',
  'Building your operational picture',
]

function StageShell({
  title,
  subtitle,
  mascot,
  mascotSide = 'right',
  progress,
  children,
}: {
  title: string
  subtitle: string
  mascot?: React.ReactNode
  mascotSide?: 'left' | 'right'
  progress?: React.ReactNode
  children: React.ReactNode
}) {
  const mascotLeft = mascotSide === 'left'

  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative z-10 grid min-h-[calc(100dvh-3rem)] items-center gap-8 py-4 lg:grid-cols-[minmax(0,0.94fr)_minmax(300px,0.88fr)] lg:gap-10"
    >
      <motion.div
        initial={{ opacity: 0, x: mascotLeft ? 40 : -40, filter: 'blur(8px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, x: mascotLeft ? 40 : -40, filter: 'blur(8px)' }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className={`relative ${mascotLeft ? 'lg:order-2' : 'lg:order-1'}`}
      >
        <div className="absolute inset-0 rounded-[42px] bg-[linear-gradient(160deg,rgba(255,255,255,0.36),rgba(255,255,255,0.04))] blur-3xl" />
        <section className="relative overflow-hidden rounded-[38px] border border-white/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.46),rgba(255,255,255,0.18)_58%,rgba(244,247,252,0.12)_100%)] p-8 shadow-[0_30px_120px_rgba(37,55,92,0.16),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-[34px] lg:p-10">
          <div className="pointer-events-none absolute inset-px rounded-[36px] bg-[linear-gradient(180deg,rgba(255,255,255,0.36),rgba(255,255,255,0.08)_34%,rgba(255,255,255,0.02)_100%)]" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-28 bg-[linear-gradient(180deg,rgba(255,255,255,0.5),rgba(255,255,255,0))] blur-2xl" />
          <div className="relative max-w-2xl">
            {progress}
            <h1
              className="text-[clamp(2.8rem,5.8vw,5.4rem)] font-medium leading-[0.92] tracking-[-0.05em] text-[#13233e]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {title}
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-[#314764]">
              {subtitle}
            </p>
          </div>
          <div className="relative mt-8">{children}</div>
        </section>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: mascotLeft ? -64 : 64, scale: 0.96 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: mascotLeft ? -64 : 64, scale: 0.96 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className={`relative flex min-h-[28rem] items-center ${mascotLeft ? 'justify-start lg:order-1' : 'justify-end lg:order-2'}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.3),rgba(255,255,255,0)_66%)] blur-3xl" />
        <div className={`relative w-full ${mascotLeft ? 'lg:-ml-10' : 'lg:ml-10'}`}>
          {mascot}
        </div>
      </motion.div>
    </motion.div>
  )
}

function AmbientAvatar({
  side = 'right',
}: {
  side?: 'left' | 'right'
}) {
  const alignRight = side === 'right'

  return (
    <div
      className={`relative mx-auto flex w-full max-w-[34rem] flex-col gap-5 ${alignRight ? 'items-center lg:items-end' : 'items-center lg:items-start'} text-center ${alignRight ? 'lg:text-right' : 'lg:text-left'}`}
    >
      <motion.div
        className={`absolute top-[10%] h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(255,246,230,0.8),_rgba(255,255,255,0))] blur-[68px] ${alignRight ? 'right-[18%]' : 'left-[18%]'}`}
        animate={{ scale: [1, 1.08, 0.96, 1], opacity: [0.46, 0.66, 0.52, 0.46] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className={`relative z-10 ${alignRight ? 'lg:mr-4' : 'lg:ml-4'}`}
        animate={{ y: [0, -10, 0], rotate: [0, -1, 1, 0] }}
        transition={{ duration: 8.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <AuroraCharacter size={320} />
      </motion.div>
    </div>
  )
}

export default function OnboardPage() {
  const router = useRouter()

  const [stage, setStage] = useState<OnboardingStage>('workspace')
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [enteredConnectionsFromWorkspace, setEnteredConnectionsFromWorkspace] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [industry, setIndustry] = useState('digital-agency')
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [hasConnection, setHasConnection] = useState(false)
  const [connectedIds, setConnectedIds] = useState<string[]>([])
  const [syncStep, setSyncStep] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [firstValue, setFirstValue] = useState<{
    type: string; headline: string; detail: string; source: string
  } | null>(null)

  const connectedNames = useMemo(
    () => connectedIds.map((id) => getConnectionDisplayName(id)),
    [connectedIds],
  )
  const showWorkspaceStep = !workspaceReady || enteredConnectionsFromWorkspace

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    async function bootstrap() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.replace('/login')
          return
        }
        const { data: profile } = await loadOnboardingProfile(supabase as never, user.id)

        if (hasCompletedFirstRunOnboarding(profile)) {
          router.replace('/dashboard')
          return
        }

        const workspaceId = getWorkspaceId(profile)
        const needsWorkspace = requiresWorkspaceConfirmation(profile)

        if (workspaceId) {
          const { data: organisation } = await supabase
            .from('organisations')
            .select('name, industry')
            .eq('id', workspaceId)
            .maybeSingle()

          if (organisation?.name) setOrgName(organisation.name)
          if (typeof organisation?.industry === 'string' && organisation.industry) {
            setIndustry(organisation.industry)
          }
        }

        setOwnerName(
          profile?.display_name ||
            user.user_metadata?.display_name ||
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            '',
        )

        setWorkspaceReady(!needsWorkspace)
        setStage(needsWorkspace ? 'workspace' : 'connections')

        const params = new URLSearchParams(window.location.search)
        const justConnected = params.get('connected')
        if (justConnected) {
          setHasConnection(true)
          setConnectedIds(prev => [...new Set([...prev, justConnected])])
          window.history.replaceState({}, '', '/onboard')
        }

        setStatus('ready')
      } catch {
        setErrorMsg('Something went wrong loading your setup. Try refreshing.')
        setStatus('error')
      }
    }

    void bootstrap()
  }, [router])

  useEffect(() => {
    if (stage === 'connections') {
      document.cookie = 'bb-onboarding-active=1; path=/; max-age=3600; SameSite=Lax'
    }
  }, [stage])

  useEffect(() => {
    if (stage !== 'sync') return

    const syncRequest = fetch('/api/channels/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    }).catch(() => null)

    const interval = window.setInterval(() => {
      setSyncStep((current) => {
        if (current >= SYNC_LINES.length - 1) {
          window.clearInterval(interval)
          return current
        }
        return current + 1
      })
    }, 1000)

    const exitTimer = window.setTimeout(async () => {
      // Before transitioning to value, try to fetch real data
      try {
        const res = await fetch('/api/onboarding/first-value')
        if (res.ok) {
          const { value } = await res.json()
          if (value) setFirstValue(value)
        }
      } catch {
        // best effort
      }
      setStage('value')
    }, 3600)

    void syncRequest

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(exitTimer)
    }
  }, [stage])

  async function handleWorkspaceSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!orgName.trim() || !ownerName.trim()) return

    setStatus('saving')
    setErrorMsg('')

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName.trim(),
          ownerName: ownerName.trim(),
          industry,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || 'Couldn\'t save your workspace. Try again.')
      }

      setWorkspaceReady(true)
      setEnteredConnectionsFromWorkspace(true)
      setStatus('ready')
      setStage('connections')
    } catch (error) {
      setStatus('error')
      setErrorMsg(error instanceof Error ? error.message : 'Couldn\'t save your workspace. Try again.')
    }
  }

  async function completeOnboarding() {
    setFinishing(true)
    try {
      await fetch('/api/profile/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboarding_completed: true,
        }),
      })
    } catch {
      // best effort
    } finally {
      router.replace('/dashboard')
    }
  }

  if (status === 'loading') {
    return (
      <div className="relative min-h-dvh overflow-hidden bg-[#c8e4ff] text-[#13233e]">
        <SkyVideoBackdrop />
        <div className="relative z-10 flex min-h-dvh items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="overflow-hidden rounded-[34px] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.46),rgba(255,255,255,0.18))] px-8 py-10 text-center shadow-[0_30px_120px_rgba(37,55,92,0.16),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[32px]"
          >
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#7c92b1]">Setting up</p>
            <p className="mt-4 text-base text-[#2d4768]">One moment</p>
          </motion.div>
        </div>
      </div>
    )
  }

  const introSubtitle = workspaceReady
    ? 'Connect a source and BitBit starts learning right away.'
    : 'Name your business first, then connect a source. BitBit starts learning right away.'

  const progress = (
    <OnboardingStageProgress
      currentStage={stage}
      showWorkspaceStep={showWorkspaceStep}
      onSelectStage={(targetStage) => {
        if (!canBacktrackToStage(stage, targetStage, showWorkspaceStep)) return

        setErrorMsg('')
        if (targetStage === 'workspace' || targetStage === 'connections') {
          setStatus('ready')
        }
        setStage(targetStage)
      }}
    />
  )

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#c8e4ff] text-[#13233e]">
      <SkyVideoBackdrop />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-10">
        <AnimatePresence mode="wait">
          {stage === 'workspace' && (
            <StageShell
              title="Set up your workspace"
              subtitle="Name your business and BitBit takes it from there."
              mascotSide="right"
              progress={progress}
              mascot={<AmbientAvatar side="right" />}
            >
              <form className="grid gap-5" onSubmit={(event) => void handleWorkspaceSubmit(event)}>
                <div className="grid gap-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-[#8a7c70]" htmlFor="orgName">
                    Business name
                  </label>
                  <input
                    id="orgName"
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    className="h-14 rounded-[22px] border border-white/46 bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.2))] px-4 text-[15px] text-[#173357] shadow-[inset_0_1px_0_rgba(255,255,255,0.66)] outline-none backdrop-blur-[18px] transition focus:border-[#8fb5df] focus:ring-4 focus:ring-[#cfe4fb]"
                    placeholder="All Webbed Up"
                    required
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-xs uppercase tracking-[0.18em] text-[#8a7c70]" htmlFor="ownerName">
                      Your name
                    </label>
                    <input
                      id="ownerName"
                      value={ownerName}
                      onChange={(event) => setOwnerName(event.target.value)}
                      className="h-14 rounded-[22px] border border-white/46 bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.2))] px-4 text-[15px] text-[#173357] shadow-[inset_0_1px_0_rgba(255,255,255,0.66)] outline-none backdrop-blur-[18px] transition focus:border-[#8fb5df] focus:ring-4 focus:ring-[#cfe4fb]"
                      placeholder="Andy Smith"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs uppercase tracking-[0.18em] text-[#8a7c70]" htmlFor="industry">
                      Industry
                    </label>
                    <select
                      id="industry"
                      value={industry}
                      onChange={(event) => setIndustry(event.target.value)}
                      className="h-14 rounded-[22px] border border-white/46 bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.2))] px-4 text-[15px] text-[#173357] shadow-[inset_0_1px_0_rgba(255,255,255,0.66)] outline-none backdrop-blur-[18px] transition focus:border-[#8fb5df] focus:ring-4 focus:ring-[#cfe4fb]"
                    >
                      {INDUSTRIES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {errorMsg ? (
                  <div className="rounded-[20px] border border-[#f1c9c3] bg-[#fff3f0] px-4 py-3 text-sm text-[#91574c]">
                    {errorMsg}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    type="submit"
                    disabled={status === 'saving'}
                    className="inline-flex items-center gap-2 rounded-full bg-[#163357] px-5 py-3 text-sm font-medium text-white shadow-[0_18px_48px_rgba(29,65,114,0.28)] transition duration-200 hover:translate-y-[-1px] hover:bg-[#214674] disabled:opacity-50"
                  >
                    {status === 'saving' ? 'Saving your workspace' : 'Continue to connections'}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            </StageShell>
          )}

          {stage === 'connections' && (
            <StageShell
              title="Connect a source"
              subtitle={
                workspaceReady && !enteredConnectionsFromWorkspace
                  ? introSubtitle
                  : 'Pick where your work already lives.'
              }
              mascotSide={enteredConnectionsFromWorkspace ? 'left' : 'right'}
              progress={progress}
              mascot={<AmbientAvatar side={enteredConnectionsFromWorkspace ? 'left' : 'right'} />}
            >
              <div className="grid gap-4">
                <ConnectionsGrid
                  variant="onboarding"
                  showHeader={false}
                  showCategoryTabs={false}
                  onConnectionStateChange={setHasConnection}
                  onConnectedIdsChange={setConnectedIds}
                />

                <div className="flex flex-wrap items-center gap-4 rounded-[22px] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.4),rgba(255,255,255,0.14))] px-4 py-3 shadow-[0_18px_56px_rgba(45,71,117,0.12),inset_0_1px_0_rgba(255,255,255,0.68)] backdrop-blur-[28px]">
                  <div className="flex items-center gap-3 text-sm text-[#24415f]">
                    <div className={`h-2.5 w-2.5 rounded-full ${hasConnection ? 'bg-[#7fb28c]' : 'bg-[#b6c8de]'}`} />
                    <span>
                      {hasConnection
                        ? `${connectedNames.join(' and ')} connected`
                        : 'Connect at least one to continue'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSyncStep(0)
                      setStage('sync')
                    }}
                    disabled={!hasConnection}
                    className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#163357] px-5 py-3 text-sm font-medium text-white shadow-[0_18px_48px_rgba(29,65,114,0.28)] transition duration-200 hover:translate-y-[-1px] hover:bg-[#214674] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Continue
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </StageShell>
          )}

          {stage === 'sync' && (
            <StageShell
              title="Scanning your history"
              subtitle="BitBit is pulling the last 30 days. This runs in the background — you won't need to wait."
              mascotSide="left"
              progress={progress}
              mascot={<AmbientAvatar side="left" />}
            >
              <div className="grid gap-6">
                <div className="rounded-[30px] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(255,255,255,0.16))] p-6 shadow-[0_18px_56px_rgba(45,71,117,0.12),inset_0_1px_0_rgba(255,255,255,0.68)] backdrop-blur-[28px]">
                  <div className="mb-6 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-[#7186a4]">Syncing</p>
                      <p className="mt-2 text-lg font-medium text-[#173357]">
                        Reading from {connectedNames.join(' and ') || 'your first connection'}
                      </p>
                    </div>
                    <div className="rounded-full bg-white/54 px-3 py-1 text-xs font-medium text-[#49698f]">
                      {Math.min(syncStep + 1, SYNC_LINES.length)} of {SYNC_LINES.length}
                    </div>
                  </div>

                  <div className="relative h-3 overflow-hidden rounded-full bg-white/42">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#87b3de_0%,#d0e7ff_52%,#f7d8bf_100%)]"
                      animate={{ width: `${((syncStep + 1) / SYNC_LINES.length) * 100}%` }}
                      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>

                <div className="grid gap-3">
                  {SYNC_LINES.map((line, index) => {
                    const active = index <= syncStep
                    return (
                      <motion.div
                        key={line}
                        initial={{ opacity: 0.35, x: -8 }}
                        animate={{
                          opacity: active ? 1 : 0.42,
                          x: active ? 0 : -8,
                          scale: active ? 1 : 0.985,
                        }}
                        className="flex items-center gap-3 rounded-[24px] border border-white/42 bg-[linear-gradient(180deg,rgba(255,255,255,0.38),rgba(255,255,255,0.14))] px-4 py-4 shadow-[0_14px_38px_rgba(45,71,117,0.09),inset_0_1px_0_rgba(255,255,255,0.62)] backdrop-blur-[24px]"
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full ${active ? 'bg-white/70 text-[#49698f]' : 'bg-white/38 text-[#9db0c5]'}`}>
                          {active ? <CheckCircle2 size={16} /> : <Waves size={16} />}
                        </div>
                        <p className="text-sm text-[#24415f]">{line}</p>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </StageShell>
          )}

          {stage === 'value' && (
            <StageShell
              title="You're all set"
              subtitle="BitBit has enough to start working. It picks up more as you go."
              mascotSide="left"
              progress={progress}
              mascot={<AmbientAvatar side="left" />}
            >
              <div className="grid gap-5">
                <div className="rounded-[30px] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(255,255,255,0.16))] p-6 shadow-[0_18px_56px_rgba(45,71,117,0.12),inset_0_1px_0_rgba(255,255,255,0.68)] backdrop-blur-[28px]">
                  <div className="flex items-center gap-2 text-[#49698f]">
                    <Sparkles size={16} />
                    <span className="text-sm font-medium">What BitBit knows</span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-[24px] bg-white/42 px-4 py-4 text-sm leading-7 text-[#24415f]"
                    >
                      {ownerName ? `Set up for ${ownerName}` : 'Workspace owner confirmed'}
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 }}
                      className="rounded-[24px] bg-white/38 px-4 py-4 text-sm leading-7 text-[#24415f]"
                    >
                      {orgName ? `${orgName} workspace active` : 'Workspace ready'}
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.24 }}
                      className="rounded-[24px] bg-white/36 px-4 py-4 text-sm leading-7 text-[#24415f]"
                    >
                      {connectedNames.length > 0
                        ? `Reading from ${connectedNames.join(' and ')}. Add more sources anytime from Settings.`
                        : 'Initial scan done. Add sources from Settings whenever you want.'}
                    </motion.div>
                  </div>
                </div>

                {firstValue && (
                  <div style={{
                    background: 'rgba(127, 178, 140, 0.08)',
                    border: '1px solid rgba(127, 178, 140, 0.2)',
                    borderRadius: 12,
                    padding: '14px 18px',
                    marginTop: 16,
                  }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#7fb28c', marginBottom: 6 }}>
                      BitBit already found
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {firstValue.headline}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {firstValue.detail} — via {firstValue.source}
                    </div>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ['Ask BitBit', 'Try the chat — ask about your schedule or a recent email'],
                    ['Add more sources', 'Calendar, project tools, and accounting can all connect'],
                    ['Just use it', 'BitBit gets sharper the more you work'],
                  ].map(([title, body]) => (
                    <div
                      key={title}
                      className="rounded-[24px] border border-white/42 bg-[linear-gradient(180deg,rgba(255,255,255,0.38),rgba(255,255,255,0.14))] p-4 text-sm leading-6 text-[#24415f] shadow-[0_14px_38px_rgba(45,71,117,0.09),inset_0_1px_0_rgba(255,255,255,0.62)] backdrop-blur-[24px]"
                    >
                      <p className="font-medium text-[#173357]">{title}</p>
                      <p className="mt-2">{body}</p>
                    </div>
                  ))}
                </div>

                {errorMsg ? (
                  <div className="rounded-[20px] border border-[#f1c9c3] bg-[#fff3f0] px-4 py-3 text-sm text-[#91574c]">
                    {errorMsg}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => void completeOnboarding()}
                    disabled={finishing}
                    className="inline-flex items-center gap-2 rounded-full bg-[#163357] px-5 py-3 text-sm font-medium text-white shadow-[0_18px_48px_rgba(29,65,114,0.28)] transition duration-200 hover:translate-y-[-1px] hover:bg-[#214674] disabled:opacity-50"
                  >
                    Open chat
                    <ArrowRight size={16} />
                  </button>
                  <div className="flex items-center gap-2 text-sm text-[#47627f]">
                    <Link2 size={14} />
                    <span>Progress saved to your account</span>
                  </div>
                </div>
              </div>
            </StageShell>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
