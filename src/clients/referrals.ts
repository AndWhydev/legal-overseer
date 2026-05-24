/**
 * 3.5 — Referral tracking.
 *
 * Captures the referral source at client creation. Aggregates by
 * volume + matter-value + top referring clients / professionals.
 * Drafts a thank-you note for lawyer approval when a referral is
 * received.
 */

import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { wrapWithDisclaimer } from '../compliance/disclaimer.js';
import { enqueueForReview } from '../compliance/reviewGate.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { getClient, listClients, type Client } from './repo.js';
import { listMatters } from '../db/repositories/matters.js';
import { summariseMatterBilling } from '../compliance/billing.js';

const logger = createSafeLogger('Referrals');

export interface ReferralStats {
  bySource: { source: string; count: number; totalValueAud: number }[];
  byReferringClient: { clientId: string; clientName: string; referredCount: number; totalValueAud: number }[];
  byProfessional: { professional: string; referredCount: number; totalValueAud: number }[];
}

const FIRM_RATE_AUD = Number.parseFloat(process.env.FIRM_LAWYER_RATE_AUD ?? '450');

function clientMatterValueAud(clientId: string): number {
  const matters = listMatters().filter((m) => m.client_id === clientId);
  let total = 0;
  for (const m of matters) {
    const s = summariseMatterBilling(m.id);
    total += (s.lawyerSeconds / 3600) * FIRM_RATE_AUD + s.aiCostUsd * 1.5;
  }
  return total;
}

export function getReferralStats(): ReferralStats {
  const all = listClients();
  const bySource = new Map<string, { count: number; totalValueAud: number }>();
  const byReferringClient = new Map<string, { clientName: string; referredCount: number; totalValueAud: number }>();
  const byProfessional = new Map<string, { referredCount: number; totalValueAud: number }>();

  for (const c of all) {
    const value = clientMatterValueAud(c.id);
    if (c.referral_source) {
      const e = bySource.get(c.referral_source) ?? { count: 0, totalValueAud: 0 };
      e.count += 1;
      e.totalValueAud += value;
      bySource.set(c.referral_source, e);
    }
    if (c.referring_client_id) {
      const refClient = getClient(c.referring_client_id);
      const e = byReferringClient.get(c.referring_client_id) ?? {
        clientName: refClient?.full_name ?? '(unknown)',
        referredCount: 0,
        totalValueAud: 0,
      };
      e.referredCount += 1;
      e.totalValueAud += value;
      byReferringClient.set(c.referring_client_id, e);
    }
    if (c.referring_professional) {
      const e = byProfessional.get(c.referring_professional) ?? {
        referredCount: 0,
        totalValueAud: 0,
      };
      e.referredCount += 1;
      e.totalValueAud += value;
      byProfessional.set(c.referring_professional, e);
    }
  }

  return {
    bySource: Array.from(bySource.entries())
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.totalValueAud - a.totalValueAud),
    byReferringClient: Array.from(byReferringClient.entries())
      .map(([clientId, v]) => ({ clientId, ...v }))
      .sort((a, b) => b.totalValueAud - a.totalValueAud),
    byProfessional: Array.from(byProfessional.entries())
      .map(([professional, v]) => ({ professional, ...v }))
      .sort((a, b) => b.totalValueAud - a.totalValueAud),
  };
}

export function draftReferralThankYou(newClient: Client, acting: string): string {
  let referrerName = newClient.referring_professional ?? newClient.referral_source ?? 'referrer';
  let referrerEmail: string | null = null;
  if (newClient.referring_client_id) {
    const ref = getClient(newClient.referring_client_id);
    if (ref) {
      referrerName = ref.full_name;
      referrerEmail = ref.email;
    }
  }

  const body = wrapWithDisclaimer(`# Thank-you note — referral

Dear ${referrerName},

Thank you very much for referring ${newClient.full_name} to our firm.
We genuinely appreciate the confidence you have shown in our practice
by recommending us.

We will, of course, look after ${newClient.full_name} with the same care
we would extend to any client you sent our way. If there is ever an
opportunity to reciprocate or assist you in turn, please do not
hesitate to let us know.

With thanks,

[FIRM PARTNER]`);

  const review = enqueueForReview({
    matterId: null,
    matterNumber: null,
    skillId: 'referral_thank_you',
    outputKind: 'client_email',
    title: `Thank-you draft for referral by ${referrerName}`,
    bodyMarkdown: body,
    metadata: { to: referrerEmail, referring: referrerName, new_client_id: newClient.id },
  });

  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'referral.thank_you_drafted',
    detail: `referrer=${referrerName} for new client ${newClient.full_name}`,
    refTable: 'review_queue',
    refId: review.id,
  });
  return review.id;
}
