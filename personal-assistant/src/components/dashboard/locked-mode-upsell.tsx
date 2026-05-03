'use client';

/**
 * locked-mode-upsell.tsx — Modal that appears when a user clicks a mode tab
 * their plan tier hasn't paid for.
 *
 * Replaces the previous "redirect to /pricing on locked click" behavior
 * (#104) with an in-context modal that names the locked mode + the plan it
 * requires and offers an upgrade CTA. The CTA still routes to /pricing —
 * the actual upgrade flow is out-of-scope — but with a hash anchor pointing
 * at the relevant tier so the user lands on the right card.
 *
 * "Hide the machinery": the user sees "Money requires the Growth plan",
 * never "MIN_PLAN_FOR_MODE['money'] === 'growth'". Plan names are title-
 * cased at the boundary; mode names are capitalised inline.
 */

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { Mode } from '@/lib/dashboard/mode-store';
import type { PlanName } from '@/lib/billing/plan-gates';

// ─── Mode + plan display helpers ──────────────────────────────────────────────

const MODE_LABEL: Record<Mode, string> = {
  chat: 'Chat',
  inbox: 'Inbox',
  work: 'Work',
  money: 'Money',
};

const MODE_SUMMARY: Record<Mode, string> = {
  chat: 'Conversational AI for asking BitBit anything.',
  inbox: 'Triage email, WhatsApp, and iMessage in one queue.',
  work: 'Capture tasks and run a work board with due-date inference.',
  money: 'Draft invoices, track unpaid amounts, and chase clients.',
};

const PLAN_LABEL: Record<PlanName, string> = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
  enterprise: 'Enterprise',
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface LockedModeUpsellProps {
  /** When non-null, the modal is open and shows this lock context. */
  lockedMode: { mode: Mode; requiredPlan: PlanName } | null;
  /** Called when the modal closes (X click, escape, outside click, after CTA). */
  onClose: () => void;
}

export function LockedModeUpsell({ lockedMode, onClose }: LockedModeUpsellProps) {
  const open = lockedMode !== null;

  // Resolve display strings only when we have a lock — keeps the JSX terse.
  const modeName = lockedMode ? MODE_LABEL[lockedMode.mode] : '';
  const modeBlurb = lockedMode ? MODE_SUMMARY[lockedMode.mode] : '';
  const planName = lockedMode ? PLAN_LABEL[lockedMode.requiredPlan] : '';
  const pricingHref = lockedMode ? `/pricing#tier-${lockedMode.requiredPlan}` : '/pricing';

  function handleOpenChange(next: boolean) {
    if (!next) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modeName} mode is on the {planName} plan</DialogTitle>
          <DialogDescription>{modeBlurb}</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You&apos;re on a plan that doesn&apos;t include {modeName} yet. Upgrade to{' '}
          <span className="font-medium text-foreground">{planName}</span> to unlock it,
          along with everything else in that tier.
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Not now</Button>
          </DialogClose>
          <Button asChild>
            <Link href={pricingHref} onClick={onClose}>
              See {planName} plan
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
