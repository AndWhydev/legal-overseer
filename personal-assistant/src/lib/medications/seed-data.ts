import type { Medication, MonthData, DaySchedule, DosageEntry } from './types'

export const medications: Medication[] = [
  {
    id: 'dex',
    name: 'Dexamfetamine',
    genericName: 'Dexamfetamine sulfate',
    doseMg: 5,
    pillStyle: {
      shape: 'round',
      primaryColor: '#E8E4DE',
      size: 'small',
      scoreLine: true,
    },
    category: 'prescription',
    instructions: 'empty-stomach',
    halfLifeHours: 12,
    peakHours: 2,
  },
  {
    id: 'escit',
    name: 'Escitalopram',
    genericName: 'Escitalopram oxalate',
    doseMg: 10,
    pillStyle: {
      shape: 'round',
      primaryColor: '#F0ECE6',
      size: 'small',
    },
    category: 'prescription',
    instructions: 'any',
    halfLifeHours: 27,
    peakHours: 4,
  },
  {
    id: 'iso',
    name: 'Isotretinoin',
    genericName: 'Isotretinoin',
    doseMg: 20,
    pillStyle: {
      shape: 'softgel',
      primaryColor: '#E8740C',
      size: 'small',
      transparent: true,
      fillColor: '#E8740C',
    },
    category: 'prescription',
    instructions: 'with-fat',
    halfLifeHours: 21,
    peakHours: 3,
  },
  {
    id: 'clon',
    name: 'Clonidine',
    genericName: 'Clonidine hydrochloride',
    doseMg: 0.1,
    pillStyle: {
      shape: 'round',
      primaryColor: '#F5F1EB',
      size: 'tiny',
    },
    category: 'prescription',
    instructions: 'any',
    halfLifeHours: 12,
    peakHours: 2,
  },
  {
    id: 'thea',
    name: 'L-Theanine',
    doseMg: 200,
    pillStyle: {
      shape: 'capsule',
      primaryColor: '#D4CFC7',
      secondaryColor: '#D4CFC7',
      size: 'medium',
      transparent: true,
      fillColor: '#F0ECE6',
    },
    category: 'supplement',
    instructions: 'any',
    halfLifeHours: 3,
    peakHours: 1,
  },
  {
    id: 'mag',
    name: 'Magnesium Glycinate',
    doseMg: 400,
    pillStyle: {
      shape: 'capsule',
      primaryColor: '#D4CFC7',
      secondaryColor: '#D4CFC7',
      size: 'large',
      transparent: true,
      fillColor: '#F5F1EB',
    },
    category: 'supplement',
    instructions: 'any',
    halfLifeHours: 6,
    peakHours: 2,
  },
  {
    id: 'astax',
    name: 'Astaxanthin',
    doseMg: 12,
    pillStyle: {
      shape: 'softgel',
      primaryColor: '#C0392B',
      size: 'small',
      transparent: true,
      fillColor: '#C0392B',
    },
    category: 'supplement',
    instructions: 'with-fat',
    halfLifeHours: 16,
    peakHours: 3,
  },
  {
    id: 'omega',
    name: 'Omega-3',
    genericName: 'Fish oil EPA/DHA',
    doseMg: 1000,
    pillStyle: {
      shape: 'softgel',
      primaryColor: '#C9A84C',
      size: 'medium',
      transparent: true,
      fillColor: '#C9A84C',
    },
    category: 'supplement',
    instructions: 'with-food',
  },
]

export const medicationMap = Object.fromEntries(medications.map(m => [m.id, m]))

function entry(medicationId: string, doses: number, taken: boolean): DosageEntry {
  return {
    medicationId,
    doses,
    taken,
    ...(taken ? { takenAt: '2026-02-01T08:00:00Z' } : {}),
  }
}

function day(date: string, entries: DosageEntry[]): DaySchedule {
  const allTaken = entries.length > 0 && entries.every(e => e.taken)
  const someTaken = entries.some(e => e.taken)
  return {
    date,
    medications: entries,
    status: entries.length === 0 ? 'empty' : allTaken ? 'complete' : someTaken ? 'partial' : 'pending',
  }
}

// Feb 2026 starts on Sunday
// Build the full February 2026 schedule
function buildFebruary2026(): MonthData {
  const days: DaySchedule[] = []
  const today = '2026-02-18'

  for (let d = 1; d <= 28; d++) {
    const dateStr = `2026-02-${String(d).padStart(2, '0')}`
    const completed = dateStr < today // Before today = completed
    const isToday = dateStr === today
    const entries: DosageEntry[] = []

    // Week 1: Feb 1-7
    if (d >= 1 && d <= 7) {
      // Dexamfetamine: 6/day all 7 days
      entries.push(entry('dex', 6, completed))
      // Isotretinoin: 2/day all 7 days
      entries.push(entry('iso', 2, completed))
      // Clonidine: 1/day all 7 days
      entries.push(entry('clon', 1, completed))
      // L-Theanine: 2/day all 7 days
      entries.push(entry('thea', 2, completed))
      // Omega-3: 2/day all 7 days
      entries.push(entry('omega', 2, completed))
      // Magnesium: 2/day Wed-Sat only (Feb 4=Wed through Feb 7=Sat)
      if (d >= 4 && d <= 7) {
        entries.push(entry('mag', 2, completed))
      }
      // Escitalopram: 1 on Wednesday only (Feb 4)
      if (d === 4) {
        entries.push(entry('escit', 1, completed))
      }
      // Astaxanthin: 1/day Wed-Sat only
      if (d >= 4 && d <= 7) {
        entries.push(entry('astax', 1, completed))
      }
    }

    // Week 2: Feb 8-14
    if (d >= 8 && d <= 14) {
      // Dexamfetamine: 4 on Sunday only (Feb 8)
      if (d === 8) {
        entries.push(entry('dex', 4, completed))
      }
      // Isotretinoin: 2/day all 7 days
      entries.push(entry('iso', 2, completed))
      // Clonidine: 1/day all 7 days
      entries.push(entry('clon', 1, completed))
      // L-Theanine: 2/day all 7 days
      entries.push(entry('thea', 2, completed))
      // Omega-3: 2/day all 7 days
      entries.push(entry('omega', 2, completed))
      // Magnesium: 1/day all 7 days
      entries.push(entry('mag', 1, completed))
      // Astaxanthin: 1/day all 7 days
      entries.push(entry('astax', 1, completed))
    }

    // Week 3: Feb 15-21
    if (d >= 15 && d <= 21) {
      const taken = completed || (isToday && false) // today = not yet taken
      // Isotretinoin: 2/day all 7 days
      entries.push(entry('iso', 2, completed))
      // Clonidine: 1/day all 7 days
      entries.push(entry('clon', 1, completed))
      // L-Theanine: 2/day except Fri=1, Sat=0
      // Feb 15=Sun, 16=Mon, 17=Tue, 18=Wed, 19=Thu, 20=Fri, 21=Sat
      if (d === 21) {
        // Saturday = 0
      } else if (d === 20) {
        entries.push(entry('thea', 1, taken))
      } else {
        entries.push(entry('thea', 2, completed))
      }
      // Omega-3: 2/day all 7 days
      entries.push(entry('omega', 2, completed))
      // Magnesium: 1 on Sunday only (Feb 15)
      if (d === 15) {
        entries.push(entry('mag', 1, completed))
      }
      // Astaxanthin: 1/day all 7 days
      entries.push(entry('astax', 1, completed))
    }

    // Week 4: Feb 22-28
    if (d >= 22 && d <= 28) {
      // Isotretinoin: 2/day all 7 days
      entries.push(entry('iso', 2, false))
      // Clonidine: 1/day all 7 days
      entries.push(entry('clon', 1, false))
      // Omega-3: 2/day all 7 days
      entries.push(entry('omega', 2, false))
      // Astaxanthin: 1/day all 7 days
      entries.push(entry('astax', 1, false))
    }

    days.push(day(dateStr, entries))
  }

  return days
}

export const february2026: MonthData = buildFebruary2026()
