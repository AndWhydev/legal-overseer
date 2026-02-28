'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'disconnected'

/**
 * Hook that monitors Supabase realtime connection status.
 * Subscribes to a lightweight heartbeat channel and tracks connection state.
 */
export function useRealtimeStatus(): RealtimeConnectionStatus {
  const [status, setStatus] = useState<RealtimeConnectionStatus>('connecting')
  const clientRef = useRef(createClient())

  useEffect(() => {
    const client = clientRef.current
    if (!client) {
      setStatus('disconnected')
      return
    }

    const channel = client.channel('connection-status-probe')
    channel.subscribe((channelStatus: string) => {
      switch (channelStatus) {
        case 'SUBSCRIBED':
          setStatus('connected')
          break
        case 'CHANNEL_ERROR':
        case 'TIMED_OUT':
        case 'CLOSED':
          setStatus('disconnected')
          break
        default:
          setStatus('connecting')
      }
    })

    return () => {
      client.removeChannel(channel)
    }
  }, [])

  return status
}
