'use client';

/**
 * mode-onboarding-card.tsx — Per-mode onboarding nudge surface.
 *
 * Wraps the `useModeOnboarding` hook (#101) with a card-shaped UI: title +
 * description + a single CTA. Reads from + writes to the same localStorage
 * record the hook manages, so completing a step here updates the wider
 * onboarding state immediately.
 *
 * Renders null when:
 *   - userId is missing (SSR / pre-auth)
 *   - the mode is fully onboarded (isComplete + no nextStep)
 *
 * The CTA currently just calls `completeStep(nextStep.id)` to mark the step
 * done — the actual per-step actions (open the channel-connect dialog,
 * focus the task input, etc.) wire in via a separate follow-up PR. The
 * primitive shape stays foundation-only.
 *
 * "Hide the machinery": no progress %, no step count, no pluralised
 * "step 2 of 3" — the card says one thing at a time. Users complete one,
 * the next replaces it on re-render.
 */

import { Button } from '@/components/ui/button';
import { useModeOnboarding } from '@/hooks/use-mode-onboarding';
import type { Mode } from '@/lib/dashboard/mode-store';

export interface ModeOnboardingCardProps {
  userId: string;
  mode: Mode;
  /** Optional className passthrough for layout positioning. */
  className?: string;
}

export function ModeOnboardingCard({ userId, mode, className }: ModeOnboardingCardProps) {
  const { nextStep, isComplete, completeStep } = useModeOnboarding({ userId, mode });

  // Render null in any "nothing to nudge" state. The card silently disappears
  // — no "you're all done" celebration, since the foundation doesn't carry
  // a confirmation modal yet.
  if (!userId || isComplete || !nextStep) return null;

  return (
    <div
      data-testid="mode-onboarding-card"
      className={
        'rounded-lg border bg-card p-4 shadow-sm flex items-start justify-between gap-4 ' +
        (className ?? '')
      }
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-foreground leading-tight">{nextStep.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground leading-snug">{nextStep.description}</p>
      </div>
      <Button
        size="sm"
        onClick={() => completeStep(nextStep.id)}
        className="shrink-0"
      >
        {nextStep.ctaLabel}
      </Button>
    </div>
  );
}
