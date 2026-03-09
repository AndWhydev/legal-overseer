'use client'

import { motion } from 'motion/react'

export type OnboardingStage = 'workspace' | 'connections' | 'sync' | 'value'

const STAGE_LABELS: Record<OnboardingStage, string> = {
  workspace: 'Workspace',
  connections: 'Connections',
  sync: 'Sync',
  value: 'Ready',
}

const BACKTRACKABLE_STAGES = new Set<OnboardingStage>(['workspace', 'connections'])

export function getStageSequence(showWorkspaceStep: boolean): OnboardingStage[] {
  return showWorkspaceStep
    ? ['workspace', 'connections', 'sync', 'value']
    : ['connections', 'sync', 'value']
}

export function canBacktrackToStage(
  currentStage: OnboardingStage,
  targetStage: OnboardingStage,
  showWorkspaceStep: boolean,
) {
  const steps = getStageSequence(showWorkspaceStep)
  const currentIndex = steps.indexOf(currentStage)
  const targetIndex = steps.indexOf(targetStage)

  if (currentIndex === -1 || targetIndex === -1) return false
  if (targetIndex >= currentIndex) return false

  return BACKTRACKABLE_STAGES.has(targetStage)
}

export function OnboardingStageProgress({
  currentStage,
  showWorkspaceStep,
  onSelectStage,
}: {
  currentStage: OnboardingStage
  showWorkspaceStep: boolean
  onSelectStage?: (stage: OnboardingStage) => void
}) {
  const steps = getStageSequence(showWorkspaceStep)
  const currentIndex = steps.indexOf(currentStage)

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <div className="mr-2 rounded-full border border-white/42 bg-white/28 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#6f84a4] backdrop-blur-[18px]">
        {currentIndex + 1} / {steps.length}
      </div>

      {steps.map((step, index) => {
        const isCurrent = step === currentStage
        const isComplete = index < currentIndex
        const isInteractive = canBacktrackToStage(currentStage, step, showWorkspaceStep)

        return (
          <motion.button
            key={step}
            type="button"
            whileHover={isInteractive ? { y: -1 } : undefined}
            whileTap={isInteractive ? { scale: 0.98 } : undefined}
            onClick={() => {
              if (isInteractive) onSelectStage?.(step)
            }}
            disabled={!isInteractive}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
              isCurrent
                ? 'border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.18))] text-[#173357] shadow-[0_12px_32px_rgba(45,71,117,0.12)] backdrop-blur-[18px]'
                : isComplete
                  ? 'border-white/45 bg-white/26 text-[#35506f] backdrop-blur-[16px]'
                  : 'border-white/28 bg-white/10 text-[#7f93ad] backdrop-blur-[12px]'
            } ${isInteractive ? 'cursor-pointer hover:border-white/60 hover:bg-white/32' : 'cursor-default'}`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                isCurrent
                  ? 'bg-[#173357] text-white'
                  : isComplete
                    ? 'bg-white/78 text-[#35506f]'
                    : 'bg-white/20 text-[#7f93ad]'
              }`}
            >
              {index + 1}
            </span>
            <span>{STAGE_LABELS[step]}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
