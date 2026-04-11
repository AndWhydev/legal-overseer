'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Medication } from '@/lib/medications/types'
import { medications as seedMedications, medicationMap as seedMedicationMap } from '@/lib/medications/seed-data'

interface MedicationRecord {
  id: string
  user_id: string
  org_id: string
  name: string
  generic_name: string | null
  dosage: string | null
  dose_mg: number | null
  frequency: string | null
  category: string | null
  instructions: string | null
  refill_date: string | null
  prescriber: string | null
  pharmacy: string | null
  notes: string | null
  pill_style: Record<string, unknown> | null
  half_life_hours: number | null
  peak_hours: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Convert a DB record into the UI Medication type */
function toMedication(record: MedicationRecord): Medication {
  return {
    id: record.id,
    name: record.name,
    genericName: record.generic_name ?? undefined,
    doseMg: record.dose_mg ?? 0,
    pillStyle: (record.pill_style as unknown as Medication['pillStyle']) ?? {
      shape: 'round',
      primaryColor: '#D4CFC7',
      size: 'small',
    },
    category: (record.category as Medication['category']) ?? 'supplement',
    instructions: (record.instructions as Medication['instructions']) ?? undefined,
    halfLifeHours: record.half_life_hours ?? undefined,
    peakHours: record.peak_hours ?? undefined,
  }
}

export function useMedications() {
  const [medications, setMedications] = useState<Medication[]>(seedMedications)
  const [medicationMap, setMedicationMap] = useState<Record<string, Medication>>(seedMedicationMap)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usingSeed, setUsingSeed] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const loadMedications = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/medications', { signal: controller.signal })

      if (!response.ok) {
        // If API is unavailable (503/401), fall back to seed data silently
        if (response.status === 503 || response.status === 401) {
          setUsingSeed(true)
          return
        }
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to load medications')
      }

      const body = (await response.json()) as { medications?: MedicationRecord[] }
      const records = body.medications ?? []

      if (records.length > 0) {
        const meds = records.map(toMedication)
        setMedications(meds)
        setMedicationMap(Object.fromEntries(meds.map(m => [m.id, m])))
        setUsingSeed(false)
      } else {
        // No DB records yet — continue using seed data
        setUsingSeed(true)
      }
      setError(null)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      // On error, keep seed data as fallback
      setUsingSeed(true)
      setError(err instanceof Error ? err.message : 'Failed to load medications')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    setIsLoading(true)

    loadMedications().finally(() => {
      if (mounted) setIsLoading(false)
    })

    return () => {
      mounted = false
      abortRef.current?.abort()
    }
  }, [loadMedications])

  const createMedication = useCallback(async (data: Partial<MedicationRecord>) => {
    const response = await fetch('/api/medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? 'Failed to create medication')
    }

    await loadMedications()
    return (await response.json()) as { medication: MedicationRecord }
  }, [loadMedications])

  const updateMedication = useCallback(async (id: string, data: Partial<MedicationRecord>) => {
    const response = await fetch(`/api/medications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? 'Failed to update medication')
    }

    await loadMedications()
    return (await response.json()) as { medication: MedicationRecord }
  }, [loadMedications])

  const deleteMedication = useCallback(async (id: string) => {
    const response = await fetch(`/api/medications/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? 'Failed to delete medication')
    }

    await loadMedications()
  }, [loadMedications])

  return {
    medications,
    medicationMap,
    isLoading,
    error,
    usingSeed,
    createMedication,
    updateMedication,
    deleteMedication,
    refresh: loadMedications,
  }
}
