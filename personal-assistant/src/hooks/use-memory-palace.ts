/**
 * useMemoryPalace — React hook for Memory Palace operations.
 *
 * Provides search, recall, store, forget, and stats functions
 * with loading/error state management.
 */

'use client'

import { useState, useCallback } from 'react'
import type {
  MemorySearchResult,
  EntityRecallResult,
  MemoryPalaceStats,
  MemoryPalaceEntry,
  MemoryCategory,
  ForgetResult,
} from '@/lib/memory-palace/types'

interface MemoryPalaceHook {
  // State
  loading: boolean
  error: string | null

  // Search
  search: (query: string, options?: {
    category?: MemoryCategory
    entityId?: string
    limit?: number
  }) => Promise<MemorySearchResult | null>

  // Entity recall
  recallEntity: (entityId: string) => Promise<EntityRecallResult | null>

  // Store
  storeMemory: (input: {
    content: string
    category?: MemoryCategory
    title?: string
    confidence?: number
    entityIds?: string[]
    entityNames?: string[]
    tags?: string[]
  }) => Promise<MemoryPalaceEntry | null>

  // Stats
  getStats: () => Promise<MemoryPalaceStats | null>

  // Forget
  forgetEntity: (entityId: string) => Promise<ForgetResult | null>

  // Recent memories
  getRecent: (limit?: number, category?: MemoryCategory) => Promise<MemoryPalaceEntry[]>

  // Archaeology
  excavate: (query: string, entityIds?: string[]) => Promise<{
    timeline: unknown[]
    narrative: string
  } | null>

  // Consolidate
  consolidate: () => Promise<{
    decayed: number
    merged: number
    promoted: number
    archived: number
  } | null>
}

export function useMemoryPalace(): MemoryPalaceHook {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async (
    query: string,
    options?: {
      category?: MemoryCategory
      entityId?: string
      limit?: number
    },
  ): Promise<MemorySearchResult | null> => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q: query })
      if (options?.category) params.set('category', options.category)
      if (options?.entityId) params.set('entity_id', options.entityId)
      if (options?.limit) params.set('limit', String(options.limit))

      const res = await fetch(`/api/memory-palace/search?${params}`)
      if (!res.ok) throw new Error('Search failed')
      return await res.json()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const recallEntity = useCallback(async (
    entityId: string,
  ): Promise<EntityRecallResult | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/memory-palace/recall?entity_id=${entityId}`)
      if (!res.ok) throw new Error('Recall failed')
      return await res.json()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recall failed')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const storeMemory = useCallback(async (input: {
    content: string
    category?: MemoryCategory
    title?: string
    confidence?: number
    entityIds?: string[]
    entityNames?: string[]
    tags?: string[]
  }): Promise<MemoryPalaceEntry | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/memory-palace/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: input.category ?? 'fact',
          ...input,
        }),
      })
      if (!res.ok) throw new Error('Store failed')
      const data = await res.json()
      return data.memory ?? null
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Store failed')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const getStats = useCallback(async (): Promise<MemoryPalaceStats | null> => {
    try {
      const res = await fetch('/api/memory-palace/stats')
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }, [])

  const forgetEntity = useCallback(async (
    entityId: string,
  ): Promise<ForgetResult | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/memory-palace/forget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId }),
      })
      if (!res.ok) throw new Error('Forget failed')
      const data = await res.json()
      return data.result ?? null
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forget failed')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const getRecent = useCallback(async (
    limit = 30,
    category?: MemoryCategory,
  ): Promise<MemoryPalaceEntry[]> => {
    try {
      const params = new URLSearchParams({
        q: '*',
        limit: String(limit),
      })
      if (category) params.set('category', category)

      const res = await fetch(`/api/memory-palace/search?${params}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.memories ?? []
    } catch {
      return []
    }
  }, [])

  const excavate = useCallback(async (
    query: string,
    entityIds?: string[],
  ): Promise<{ timeline: unknown[]; narrative: string } | null> => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q: query })
      if (entityIds && entityIds.length > 0) {
        params.set('entity_ids', entityIds.join(','))
      }

      const res = await fetch(`/api/memory-palace/archaeology?${params}`)
      if (!res.ok) throw new Error('Archaeology query failed')
      return await res.json()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archaeology failed')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const consolidate = useCallback(async (): Promise<{
    decayed: number
    merged: number
    promoted: number
    archived: number
  } | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/memory-palace/consolidate', {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Consolidation failed')
      const data = await res.json()
      return data.report ?? null
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Consolidation failed')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    error,
    search,
    recallEntity,
    storeMemory,
    getStats,
    forgetEntity,
    getRecent,
    excavate,
    consolidate,
  }
}
