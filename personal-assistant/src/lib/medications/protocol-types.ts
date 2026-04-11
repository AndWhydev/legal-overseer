export interface Conflict {
  type: 'timing' | 'absorption' | 'interaction'
  medications: string[]
  description: string
  severity: 'warning' | 'danger'
}

export interface CycleDay {
  date: string
  active: boolean
}

export interface ConcentrationPoint {
  hour: number
  concentration: number
}

export interface MedicationCurve {
  medicationId: string
  name: string
  color: string
  points: ConcentrationPoint[]
  peakHour: number
  peakConcentration: number
}
