export interface Medication {
  id: string
  name: string
  genericName?: string
  doseMg: number
  pillStyle: PillStyle
  category: 'prescription' | 'supplement' | 'nootropic'
  instructions?: AbsorptionInstruction
  halfLifeHours?: number
  peakHours?: number
}

export interface PillStyle {
  shape: 'round' | 'capsule' | 'softgel' | 'oval' | 'disk'
  primaryColor: string
  secondaryColor?: string
  size: 'tiny' | 'small' | 'medium' | 'large'
  scoreLine?: boolean
  transparent?: boolean
  fillColor?: string
}

export type AbsorptionInstruction = 'empty-stomach' | 'with-food' | 'before-bed' | 'with-fat' | 'any'

export interface DaySchedule {
  date: string // YYYY-MM-DD
  medications: DosageEntry[]
  status: 'empty' | 'pending' | 'partial' | 'complete'
}

export interface DosageEntry {
  medicationId: string
  doses: number
  taken: boolean
  takenAt?: string
}

export interface InventoryItem {
  medicationId: string
  currentStock: number
  daysRemaining: number
  stockHealth: 'green' | 'amber' | 'red'
  scriptExpiry?: string
  scriptRepeatsLeft?: number
}

export interface InTransitItem {
  medicationId: string
  name: string
  quantity: number
  form: string
  expectedArrival?: string
  arrived: boolean
}

export interface Protocol {
  id: string
  name: string
  entries: ProtocolEntry[]
  cyclePattern?: { onDays: number; offDays: number }
  active: boolean
}

export interface ProtocolEntry {
  medicationId: string
  dosesPerDay: number
  timing: 'morning' | 'evening' | 'both' | 'as-needed'
}

export type MonthData = DaySchedule[]
