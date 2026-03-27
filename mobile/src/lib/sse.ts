import EventSource, { type MessageEvent } from 'react-native-sse';
import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

export interface ChatEvent {
  type: string;
  data: unknown;
}

/**
 * Stream a chat message via SSE from /api/agent/chat.
 *
 * Uses react-native-sse (not fetch) because Android's OkHttp
 * buffers chunked responses, breaking real-time streaming (RN #28835).
 *
 * Returns a cleanup function that closes the EventSource.
 */
export function streamChat(
  message: string,
  threadId: string | null,
  callbacks: {
    onEvent: (event: ChatEvent) => void;
    onDone: () => void;
    onError: (err: Error) => void;
  },
): () => void {
  let es: EventSource | null = null;
  let closed = false;

  const cleanup = () => {
    if (!closed && es) {
      closed = true;
      es.close();
    }
  };

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (closed) return;

    if (!session) {
      callbacks.onError(new Error('Not authenticated'));
      return;
    }

    es = new EventSource(`${API_URL}/api/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        message,
        threadId: threadId || undefined,
      }),
    });

    es.addEventListener('message', (event: MessageEvent) => {
      if (!event.data) return;
      try {
        const parsed = JSON.parse(event.data) as ChatEvent;
        callbacks.onEvent(parsed);

        // Server signals end of stream
        if (parsed.type === 'done') {
          cleanup();
          callbacks.onDone();
        }
      } catch {
        // Skip malformed SSE events
      }
    });

    es.addEventListener('error', () => {
      if (closed) return;
      cleanup();
      callbacks.onError(new Error('Stream connection error'));
    });
  });

  return cleanup;
}
