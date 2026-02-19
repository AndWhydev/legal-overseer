import type { Protocol, DaySchedule, DosageEntry, Medication } from './types'
import type { Conflict, CycleDay, ConcentrationPoint, MedicationCurve } from './protocol-types'

/**
 * Apply a protocol to a date range, producing a day-by-day schedule.
 */
export function applyProtocol(
  protocol: Protocol,
  startDate: string,
  weeks: number
): DaySchedule[] {
  const totalDays = weeks * 7
  const cycleDays = protocol.cyclePattern
    ? applyCyclePattern(protocol, startDate, totalDays)
    : null

  const schedules: DaySchedule[] = []
  const start = new Date(startDate + 'T00:00:00')

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]

    const isActive = cycleDays
      ? cycleDays[i]?.active ?? true
      : true

    const medications: DosageEntry[] = isActive
      ? protocol.entries.map((e) => ({
          medicationId: e.medicationId,
          doses: e.dosesPerDay,
          taken: false,
        }))
      : []

    const status = medications.length === 0 ? 'empty' as const : 'pending' as const
    schedules.push({ date: dateStr, medications, status })
  }

  return schedules
}

/**
 * Generate cycling on/off pattern for a protocol.
 */
export function applyCyclePattern(
  protocol: Protocol,
  startDate: string,
  totalDays: number
): CycleDay[] {
  const pattern = protocol.cyclePattern
  if (!pattern) {
    return Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(startDate + 'T00:00:00')
      d.setDate(d.getDate() + i)
      return { date: d.toISOString().split('T')[0], active: true }
    })
  }

  const cycleLength = pattern.onDays + pattern.offDays
  const result: CycleDay[] = []
  const start = new Date(startDate + 'T00:00:00')

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const dayInCycle = i % cycleLength
    result.push({
      date: d.toISOString().split('T')[0],
      active: dayInCycle < pattern.onDays,
    })
  }

  return result
}

/**
 * Check for absorption/timing conflicts between all protocols.
 */
export function checkConflicts(
  protocols: Protocol[],
  medicationMap: Record<string, Medication>
): Conflict[] {
  const conflicts: Conflict[] = []

  // Gather all morning meds and evening meds across active protocols
  const morningMeds: { id: string; med: Medication }[] = []
  const eveningMeds: { id: string; med: Medication }[] = []

  for (const proto of protocols) {
    if (!proto.active) continue
    for (const entry of proto.entries) {
      const med = medicationMap[entry.medicationId]
      if (!med) continue
      if (entry.timing === 'morning' || entry.timing === 'both') {
        morningMeds.push({ id: entry.medicationId, med })
      }
      if (entry.timing === 'evening' || entry.timing === 'both') {
        eveningMeds.push({ id: entry.medicationId, med })
      }
    }
  }

  // Check absorption conflicts within each time slot
  checkAbsorptionConflicts(morningMeds, 'morning', conflicts)
  checkAbsorptionConflicts(eveningMeds, 'evening', conflicts)

  return conflicts
}

function checkAbsorptionConflicts(
  meds: { id: string; med: Medication }[],
  slot: string,
  conflicts: Conflict[]
) {
  const emptyStomach = meds.filter((m) => m.med.instructions === 'empty-stomach')
  const withFood = meds.filter((m) => m.med.instructions === 'with-food')
  const withFat = meds.filter((m) => m.med.instructions === 'with-fat')

  // empty-stomach + with-food = conflict
  if (emptyStomach.length > 0 && withFood.length > 0) {
    conflicts.push({
      type: 'absorption',
      medications: [...emptyStomach.map((m) => m.id), ...withFood.map((m) => m.id)],
      description: `${slot}: ${emptyStomach.map((m) => m.med.name).join(', ')} (empty stomach) conflicts with ${withFood.map((m) => m.med.name).join(', ')} (with food)`,
      severity: 'warning',
    })
  }

  // empty-stomach + with-fat = conflict
  if (emptyStomach.length > 0 && withFat.length > 0) {
    conflicts.push({
      type: 'absorption',
      medications: [...emptyStomach.map((m) => m.id), ...withFat.map((m) => m.id)],
      description: `${slot}: ${emptyStomach.map((m) => m.med.name).join(', ')} (empty stomach) conflicts with ${withFat.map((m) => m.med.name).join(', ')} (with fat)`,
      severity: 'warning',
    })
  }
}

/**
 * Merge multiple protocols into a unified day-by-day schedule.
 */
export function mergeProtocols(
  protocols: Protocol[],
  startDate: string,
  weeks: number
): DaySchedule[] {
  const active = protocols.filter((p) => p.active)
  if (active.length === 0) return []

  const totalDays = weeks * 7
  const allSchedules = active.map((p) => applyProtocol(p, startDate, weeks))

  const merged: DaySchedule[] = []
  for (let i = 0; i < totalDays; i++) {
    const date = allSchedules[0][i].date
    const dayMeds: Record<string, DosageEntry> = {}

    for (const schedule of allSchedules) {
      for (const med of schedule[i].medications) {
        if (dayMeds[med.medicationId]) {
          dayMeds[med.medicationId].doses += med.doses
        } else {
          dayMeds[med.medicationId] = { ...med }
        }
      }
    }

    const medications = Object.values(dayMeds)
    merged.push({
      date,
      medications,
      status: medications.length === 0 ? 'empty' : 'pending',
    })
  }

  return merged
}

/**
 * Calculate blood concentration curve for a medication over 24 hours.
 * Uses a simple pharmacokinetic model: rise to peak, then exponential decay.
 */
export function calculateConcentrationCurve(
  med: Medication,
  doseTimes: number[], // hours (e.g., [8] for 8am)
  resolution: number = 96 // points across 24h
): ConcentrationPoint[] {
  const points: ConcentrationPoint[] = []
  const halfLife = med.halfLifeHours ?? 6
  const peak = med.peakHours ?? 2
  const decayRate = Math.LN2 / halfLife

  for (let i = 0; i <= resolution; i++) {
    const hour = (i / resolution) * 24
    let totalConc = 0

    for (const doseTime of doseTimes) {
      const elapsed = hour - doseTime
      if (elapsed < 0) continue

      if (elapsed <= peak) {
        // Linear rise to peak
        totalConc += (elapsed / peak) * 100
      } else {
        // Exponential decay from peak
        totalConc += 100 * Math.exp(-decayRate * (elapsed - peak))
      }
    }

    points.push({ hour, concentration: Math.min(totalConc, 150) })
  }

  return points
}

/**
 * Build all medication curves for a given set of medications and their dose times.
 */
export function buildMedicationCurves(
  medications: Medication[],
  doseTimes: Record<string, number[]> // medicationId -> hours
): MedicationCurve[] {
  return medications
    .filter((med) => doseTimes[med.id])
    .map((med) => {
      const points = calculateConcentrationCurve(med, doseTimes[med.id])
      const peakPoint = points.reduce((max, p) =>
        p.concentration > max.concentration ? p : max,
        points[0]
      )
      return {
        medicationId: med.id,
        name: med.name,
        color: med.pillStyle.primaryColor,
        points,
        peakHour: peakPoint.hour,
        peakConcentration: peakPoint.concentration,
      }
    })
}
