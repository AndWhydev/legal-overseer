import type { Protocol } from './types'

export const seedProtocols: Protocol[] = [
  {
    id: 'morning-focus',
    name: 'Morning Focus',
    active: true,
    entries: [
      { medicationId: 'dex', dosesPerDay: 6, timing: 'morning' },
      { medicationId: 'thea', dosesPerDay: 2, timing: 'morning' },
      { medicationId: 'omega', dosesPerDay: 1, timing: 'morning' },
    ],
  },
  {
    id: 'daily-essentials',
    name: 'Daily Essentials',
    active: true,
    entries: [
      { medicationId: 'iso', dosesPerDay: 2, timing: 'evening' },
      { medicationId: 'clon', dosesPerDay: 1, timing: 'evening' },
      { medicationId: 'omega', dosesPerDay: 1, timing: 'evening' },
      { medicationId: 'astax', dosesPerDay: 1, timing: 'evening' },
    ],
  },
  {
    id: 'sleep-recovery',
    name: 'Sleep & Recovery',
    active: true,
    entries: [
      { medicationId: 'mag', dosesPerDay: 2, timing: 'evening' },
    ],
  },
  {
    id: 'cognitive-enhancement',
    name: 'Cognitive Enhancement',
    active: false,
    entries: [
      { medicationId: 'modafinil', dosesPerDay: 1, timing: 'morning' },
      { medicationId: 'creatine', dosesPerDay: 2, timing: 'both' },
      { medicationId: 'baclofen', dosesPerDay: 1, timing: 'evening' },
      { medicationId: 'mk677', dosesPerDay: 1, timing: 'evening' },
    ],
  },
]

export const protocolDescriptions: Record<string, string> = {
  'morning-focus': 'Stimulant stack with L-Theanine synergy for smooth focus. Omega-3 for neuroprotection.',
  'daily-essentials': 'Evening maintenance: skin care (Isotretinoin + Astaxanthin with fat), blood pressure (Clonidine), anti-inflammatory (Omega-3).',
  'sleep-recovery': 'Magnesium glycinate before bed for sleep quality and muscle recovery.',
  'cognitive-enhancement': 'Pending arrival of in-transit medications. Modafinil for wakefulness, Creatine for brain energy, Baclofen for GABAergic support, MK-677 for GH secretagogue.',
}

/** Default dose times (hours, 24h format) for half-life visualization */
export const defaultDoseTimes: Record<string, number[]> = {
  dex: [8],       // morning dose
  escit: [8],     // morning (steady state, timing less critical)
  iso: [19],      // evening with dinner
  clon: [21],     // evening
  thea: [8],      // morning with dex
  mag: [22],      // before bed
  astax: [19],    // evening with dinner (with fat)
  omega: [8, 19], // morning + evening
}
