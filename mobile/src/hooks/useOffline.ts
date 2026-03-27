import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { usePendingMutations } from '@/lib/offline-queue';

interface OfflineState {
  /** Device has no network connectivity */
  isOffline: boolean;
  /** Was offline, just came back online, and still has pending mutations draining */
  isReconnecting: boolean;
  /** Number of mutations queued/pending */
  pendingCount: number;
}

/**
 * Hook for monitoring network status and offline mutation queue.
 *
 * Subscribes to NetInfo state changes and combines with TanStack Query
 * pending mutation count to provide offline/reconnecting/online status.
 */
export function useOffline(): OfflineState {
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const pendingCount = usePendingMutations();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !state.isConnected;
      setIsOffline(offline);

      if (offline) {
        setWasOffline(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Clear wasOffline once all pending mutations have drained
  useEffect(() => {
    if (!isOffline && wasOffline && pendingCount === 0) {
      setWasOffline(false);
    }
  }, [isOffline, wasOffline, pendingCount]);

  const isReconnecting = !isOffline && wasOffline && pendingCount > 0;

  return { isOffline, isReconnecting, pendingCount };
}
