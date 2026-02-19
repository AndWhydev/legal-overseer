import type { InventoryItem, InTransitItem, Medication, DosageEntry } from './types'

// --- Additional types for inventory engine ---

export interface ScriptRoadmap {
  medicationId: string
  name: string
  stockRunsOut: string // ISO date
  scriptExpires?: string
  repeatsRemaining?: number
  needsRefill: boolean
  needsNewScript: boolean
  daysUntilStockout: number
}

export interface InventoryStatus {
  medicationId: string
  name: string
  doseMg: number
  category: 'prescription' | 'supplement' | 'nootropic'
  currentStock: number
  daysRemaining: number
  stockHealth: 'green' | 'amber' | 'red'
  urgentRed: boolean // < 3 days
  scriptExpiry?: string
  scriptRepeatsLeft?: number
}

// --- Core inventory functions ---

/**
 * Green: > 14 days remaining
 * Amber: 7-14 days
 * Red: < 7 days (< 3 days = "urgent red" handled separately)
 */
export function getStockHealth(currentStock: number, dailyUsage: number): 'green' | 'amber' | 'red' {
  if (dailyUsage <= 0) return 'green'
  const days = currentStock / dailyUsage
  if (days > 14) return 'green'
  if (days >= 7) return 'amber'
  return 'red'
}

export function getDaysRemaining(currentStock: number, dailyUsage: number): number {
  if (dailyUsage <= 0) return Infinity
  return Math.floor(currentStock / dailyUsage)
}

/**
 * When a day is marked complete, deduct the taken doses from inventory.
 */
export function decrementStock(
  inventory: InventoryItem[],
  dayMeds: DosageEntry[]
): InventoryItem[] {
  const usageMap = new Map<string, number>()
  for (const entry of dayMeds) {
    if (entry.taken) {
      usageMap.set(entry.medicationId, (usageMap.get(entry.medicationId) ?? 0) + entry.doses)
    }
  }

  return inventory.map(item => {
    const used = usageMap.get(item.medicationId) ?? 0
    if (used === 0) return item
    const newStock = Math.max(0, item.currentStock - used)
    // Recalculate health — we need daily usage which we approximate from the decrement
    const dailyUsage = used // best approximation from today's usage
    return {
      ...item,
      currentStock: newStock,
      daysRemaining: getDaysRemaining(newStock, dailyUsage),
      stockHealth: getStockHealth(newStock, dailyUsage),
    }
  })
}

/**
 * Build full inventory status with health indicators for display.
 */
export function getInventoryStatus(
  inventory: InventoryItem[],
  medications: Medication[]
): InventoryStatus[] {
  const medMap = new Map(medications.map(m => [m.id, m]))

  return inventory.map(item => {
    const med = medMap.get(item.medicationId)
    return {
      medicationId: item.medicationId,
      name: med?.name ?? item.medicationId,
      doseMg: med?.doseMg ?? 0,
      category: med?.category ?? 'supplement',
      currentStock: item.currentStock,
      daysRemaining: item.daysRemaining,
      stockHealth: item.stockHealth,
      urgentRed: item.stockHealth === 'red' && item.daysRemaining < 3,
      scriptExpiry: item.scriptExpiry,
      scriptRepeatsLeft: item.scriptRepeatsLeft,
    }
  })
}

/**
 * Script vs stock: when does the bottle run out vs when does the script expire.
 */
export function getScriptRoadmap(
  item: InventoryItem,
  dailyUsage: number,
  medication: Medication
): ScriptRoadmap {
  const daysUntilStockout = getDaysRemaining(item.currentStock, dailyUsage)
  const now = new Date()
  const stockRunsOut = new Date(now)
  stockRunsOut.setDate(stockRunsOut.getDate() + daysUntilStockout)

  const scriptExpires = item.scriptExpiry ? new Date(item.scriptExpiry) : undefined
  const needsRefill = daysUntilStockout < 14
  const needsNewScript =
    scriptExpires !== undefined
      ? scriptExpires <= stockRunsOut || (item.scriptRepeatsLeft ?? 0) === 0
      : false

  return {
    medicationId: item.medicationId,
    name: medication.name,
    stockRunsOut: stockRunsOut.toISOString().split('T')[0],
    scriptExpires: item.scriptExpiry,
    repeatsRemaining: item.scriptRepeatsLeft,
    needsRefill,
    needsNewScript,
    daysUntilStockout,
  }
}
