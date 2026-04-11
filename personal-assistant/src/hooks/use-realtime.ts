'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = RealtimePostgresChangesPayload<{ [key: string]: any }>

interface UseRealtimeOptions {
  table: string
  event?: Event
  filter?: string
  onChange: (payload: Payload) => void
}

export function useRealtime({
  table,
  event = '*',
  filter,
  onChange,
}: UseRealtimeOptions) {
  const callbackRef = useRef(onChange)
  callbackRef.current = onChange

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return

    const channelName = `realtime:${table}:${event}:${filter ?? 'all'}`

    const params: Record<string, string> = {
      event,
      schema: 'public',
      table,
    }
    if (filter) params.filter = filter

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as never,
        params,
        (payload: Payload) => {
          callbackRef.current(payload)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, event, filter])
}
