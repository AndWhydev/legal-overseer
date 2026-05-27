/**
 * Limitation-period engine.
 *
 * Given a matter type, an Australian state, and the date that starts
 * the clock, returns the deadline, days remaining, urgency flags, and
 * the governing legislation. This is the single source of truth the
 * brief generator and the dashboard use to flag matters that are
 * running out of time.
 *
 * Periods are accurate as commonly applied across Australian
 * jurisdictions; they are a triage aid, not legal advice. Every brief
 * carries the standard AI disclaimer and is reviewed by a lawyer.
 *
 * Australian English throughout.
 */

import type { MatterType, AustralianState } from '../types.js';
import { addDays, addMonths, addYears, daysBetween } from '../date-utils.js';

export interface LimitationPeriod {
  /** Human-readable description, e.g. "21 days from dismissal under Fair Work Act s.394". */
  periodDescription: string;
  expiryDate: Date;
  daysRemaining: number;
  /** True when fewer than 14 days remain (or already expired). */
  urgent: boolean;
  /** True when fewer than 3 days remain (or already expired). */
  critical: boolean;
  legislation: string;
}

const URGENT_THRESHOLD_DAYS = 14;
const CRITICAL_THRESHOLD_DAYS = 3;

/** Workers-compensation notification windows by state (days from injury). */
const WORKERS_COMP_DAYS: Partial<Record<AustralianState, number>> = {
  NSW: 182, // 6 months to lodge (notify employer immediately)
  VIC: 730, // 2 years to claim (30-day notification recommended)
  QLD: 182, // 6 months
  WA: 365, // 12 months
  SA: 365, // 1 year
};

/** Motor-vehicle CTP notification windows by state (days from accident). */
const MOTOR_NOTIFICATION_DAYS: Partial<Record<AustralianState, number>> = {
  NSW: 28, // most claims
  VIC: 365, // 12 months
  QLD: 273, // ~9 months
  WA: 1095, // 3 years
  SA: 1095, // 3 years
};

/** Family-provision claim windows by state (months from death). */
const FAMILY_PROVISION_MONTHS: Partial<Record<AustralianState, number>> = {
  NSW: 12,
  VIC: 6,
  QLD: 9,
  WA: 6,
  SA: 6,
  TAS: 3,
  ACT: 12,
  NT: 12,
};

/** Conveyancing cooling-off periods by state (business days). */
const COOLING_OFF_BUSINESS_DAYS: Partial<Record<AustralianState, number | null>> = {
  NSW: 5,
  VIC: 3,
  QLD: 5,
  SA: 2,
  ACT: 5,
  WA: null, // none (residential)
  TAS: null, // none (residential)
};

function build(
  triggerDate: Date,
  expiryDate: Date,
  periodDescription: string,
  legislation: string,
): LimitationPeriod {
  const daysRemaining = daysBetween(new Date(), expiryDate);
  return {
    periodDescription,
    expiryDate,
    daysRemaining,
    urgent: daysRemaining <= URGENT_THRESHOLD_DAYS,
    critical: daysRemaining <= CRITICAL_THRESHOLD_DAYS,
    legislation,
  };
}

/**
 * Compute the limitation period for a matter.
 *
 * `triggerDate` is the date that starts the clock — dismissal,
 * separation, divorce, injury, publication, death, last
 * acknowledgement, etc. The caller passes the date captured by the
 * relevant `limitationPeriodTrigger` question.
 */
export function getLimitationPeriod(
  matterType: MatterType,
  state: AustralianState,
  triggerDate: Date,
): LimitationPeriod {
  switch (matterType) {
    case 'unfair-dismissal':
      return build(
        triggerDate,
        addDays(triggerDate, 21),
        '21 days from dismissal to lodge with the Fair Work Commission (Fair Work Act 2009 (Cth) s.394).',
        'Fair Work Act 2009 (Cth) s.394',
      );

    case 'workers-compensation': {
      const days = WORKERS_COMP_DAYS[state] ?? 182;
      return build(
        triggerDate,
        addDays(triggerDate, days),
        `${days} days from injury to lodge a workers compensation claim in ${state === 'unknown' ? 'this jurisdiction' : state} (notify the employer immediately).`,
        'State workers compensation legislation',
      );
    }

    case 'family-law-property':
      // Trigger is divorce date (married) or separation date (de facto).
      // De facto = 2 years; married = 12 months. Default to the de facto
      // window when we can't tell, as it is the more generous and common.
      return build(
        triggerDate,
        addYears(triggerDate, 2),
        '2 years from separation (de facto) or 12 months from divorce (married) under the Family Law Act 1975 (Cth). WA de facto matters fall under the Family Court Act 1997 (WA).',
        state === 'WA' ? 'Family Court Act 1997 (WA)' : 'Family Law Act 1975 (Cth) ss.44(5)-(6)',
      );

    case 'family-law-children':
      // No statutory limitation period, but delay is relevant. Use a
      // notional long horizon so urgency flags stay false unless an
      // urgencyCheck flags a safety/relocation issue separately.
      return build(
        triggerDate,
        addYears(triggerDate, 100),
        'No fixed limitation period for parenting matters, but delay is relevant and the status quo carries weight.',
        'Family Law Act 1975 (Cth) Part VII',
      );

    case 'conveyancing-purchase':
    case 'conveyancing-sale': {
      const businessDays = COOLING_OFF_BUSINESS_DAYS[state];
      if (businessDays === null) {
        return build(
          triggerDate,
          triggerDate,
          `${state} has no statutory residential cooling-off period — review the contract before signing.`,
          'State conveyancing / sale of land legislation',
        );
      }
      const days = businessDays ?? 5;
      // Approximate business days as calendar days + weekends padding.
      const calendarDays = Math.ceil((days / 5) * 7);
      return build(
        triggerDate,
        addDays(triggerDate, calendarDays),
        `${days} business day cooling-off period from exchange of contracts in ${state === 'unknown' ? 'this jurisdiction' : state}.`,
        'State conveyancing / sale of land legislation',
      );
    }

    case 'will-and-estate': {
      const months = FAMILY_PROVISION_MONTHS[state] ?? 12;
      return build(
        triggerDate,
        addMonths(triggerDate, months),
        `${months} months from death to bring a family provision claim in ${state === 'unknown' ? 'this jurisdiction' : state}.`,
        'State succession / family provision legislation',
      );
    }

    case 'debt-recovery':
    case 'commercial-dispute':
      return build(
        triggerDate,
        addYears(triggerDate, 6),
        '6 years from the cause of action (or last acknowledgement) for a contract claim in most states.',
        'State limitation of actions legislation',
      );

    case 'personal-injury-motor': {
      const days = MOTOR_NOTIFICATION_DAYS[state] ?? 28;
      return build(
        triggerDate,
        addDays(triggerDate, days),
        `${days} days from the accident to notify the CTP insurer in ${state === 'unknown' ? 'this jurisdiction' : state}.`,
        'State motor accident / CTP legislation',
      );
    }

    case 'personal-injury-public-liability':
      return build(
        triggerDate,
        addYears(triggerDate, 3),
        '3 years from the date of injury to commence proceedings in most states.',
        'State limitation of actions / civil liability legislation',
      );

    case 'residential-tenancy':
      // No single limitation period; notice periods govern. Use a long
      // horizon and rely on the question-set urgencyCheck for timing.
      return build(
        triggerDate,
        addYears(triggerDate, 6),
        'No single limitation period for tenancy disputes — state notice periods and tribunal timeframes govern.',
        'State residential tenancies legislation',
      );

    case 'defamation':
      return build(
        triggerDate,
        addYears(triggerDate, 1),
        '1 year from publication to commence defamation proceedings (all Australian states).',
        'Uniform Defamation Acts (state-based)',
      );

    case 'business-purchase':
      return build(
        triggerDate,
        addYears(triggerDate, 6),
        'No single limitation period for a transaction; 6 years applies to most contractual warranty claims.',
        'State limitation of actions legislation',
      );

    case 'criminal-defence':
      // Summary offences: 12 months in most states; indictable: none.
      return build(
        triggerDate,
        addMonths(triggerDate, 12),
        'Summary offences generally must be commenced within 12 months; indictable offences have no limitation period.',
        'State criminal procedure legislation',
      );

    case 'unknown':
    default:
      return build(
        triggerDate,
        addYears(triggerDate, 6),
        'Matter type not yet confirmed — default 6 year horizon applied pending classification.',
        'To be determined on classification',
      );
  }
}
