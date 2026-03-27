import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { streamChat, type ChatEvent } from '@/lib/sse';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** True when message is queued offline and not yet confirmed by server */
  pending?: boolean;
}

interface ThreadListItem {
  id: string;
  title: string | null;
  lastActivity: string;
  messageCount: number;
  preview: string | null;
}

interface ThreadListResponse {
  threads: ThreadListItem[];
}

interface HistoryResponse {
  threadId: string;
  messages: Array<{
    id: string;
    content: string;
    role: string;
    created_at: string;
  }>;
}

/**
 * Hook for managing chat state: messages, streaming, and history.
 *
 * When online: uses SSE streaming for real-time token-by-token responses.
 * When offline: queues the message via useMutation with mutationKey ['sendMessage']
 * so it persists in AsyncStorage and replays on reconnect.
 */
export function useChat(initialThreadId?: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(
    initialThreadId ?? null,
  );
  const cleanupRef = useRef<(() => void) | null>(null);
  const queryClient = useQueryClient();

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  // Load thread history when threadId is set
  const historyQuery = useQuery({
    queryKey: ['chat-history', currentThreadId],
    queryFn: async () => {
      if (!currentThreadId) return { threadId: '', messages: [] };
      const res = await apiClient.get<HistoryResponse>(
        `/api/agent/chat/history?threadId=${currentThreadId}&limit=50`,
      );
      return res.data;
    },
    enabled: !!currentThreadId,
    staleTime: 1000 * 30, // 30s
  });

  // Populate messages from history
  useEffect(() => {
    if (historyQuery.data?.messages) {
      const mapped: ChatMessage[] = historyQuery.data.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.created_at,
        }));
      setMessages(mapped);
    }
  }, [historyQuery.data]);

  // Offline message queue mutation -- uses the ['sendMessage'] key registered
  // in configurePersistentMutations so it can resume after app restart
  const offlineMutation = useMutation({
    mutationKey: ['sendMessage'],
    onMutate: async (variables: { message: string; threadId: string | null }) => {
      // Optimistic: add user message with pending indicator
      const pendingMsg: ChatMessage = {
        id: `pending-${Date.now()}`,
        role: 'user',
        content: variables.message,
        timestamp: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, pendingMsg]);
      return { pendingMsg };
    },
    onSettled: () => {
      // Invalidate conversation caches so list and history refresh
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (currentThreadId) {
        queryClient.invalidateQueries({
          queryKey: ['chat-history', currentThreadId],
        });
      }
    },
    onSuccess: () => {
      // Clear the pending indicator from all user messages
      setMessages((prev) =>
        prev.map((m) => (m.pending ? { ...m, pending: false } : m)),
      );
    },
  });

  const sendMessage = useCallback(
    (text: string) => {
      if (isStreaming || !text.trim()) return;

      const trimmed = text.trim();
      const isOnline = onlineManager.isOnline();

      if (!isOnline) {
        // Queue via mutation for offline persistence + replay
        offlineMutation.mutate({
          message: trimmed,
          threadId: currentThreadId,
        });
        return;
      }

      // Online path: use SSE streaming for real-time response
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingText('');

      let accumulatedText = '';
      let resolvedThreadId = currentThreadId;

      const cleanup = streamChat(trimmed, currentThreadId, {
        onEvent: (event: ChatEvent) => {
          switch (event.type) {
            case 'thread': {
              const threadData = event.data as { threadId: string };
              resolvedThreadId = threadData.threadId;
              setCurrentThreadId(threadData.threadId);
              break;
            }
            case 'content_delta': {
              accumulatedText += event.data as string;
              setStreamingText(accumulatedText);
              break;
            }
            case 'message': {
              if (!accumulatedText) {
                accumulatedText = event.data as string;
                setStreamingText(accumulatedText);
              }
              break;
            }
            case 'error': {
              const errorText =
                typeof event.data === 'string'
                  ? event.data
                  : 'Something went wrong';
              accumulatedText = errorText;
              setStreamingText(errorText);
              break;
            }
          }
        },
        onDone: () => {
          if (accumulatedText) {
            const assistantMsg: ChatMessage = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: accumulatedText,
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
          setStreamingText('');
          setIsStreaming(false);
          cleanupRef.current = null;

          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          if (resolvedThreadId) {
            queryClient.invalidateQueries({
              queryKey: ['chat-history', resolvedThreadId],
            });
          }
        },
        onError: (err: Error) => {
          const errMsg: ChatMessage = {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: err.message || 'Connection failed. Please try again.',
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, errMsg]);
          setStreamingText('');
          setIsStreaming(false);
          cleanupRef.current = null;
        },
      });

      cleanupRef.current = cleanup;
    },
    [isStreaming, currentThreadId, queryClient, offlineMutation],
  );

  const clearChat = useCallback(() => {
    cleanupRef.current?.();
    setMessages([]);
    setStreamingText('');
    setIsStreaming(false);
    setCurrentThreadId(null);
  }, []);

  // Count pending messages for UI indicator
  const pendingCount = messages.filter((m) => m.pending).length;

  return {
    messages,
    isStreaming,
    streamingText,
    currentThreadId,
    sendMessage,
    clearChat,
    isLoadingHistory: historyQuery.isLoading,
    /** Number of messages queued offline, not yet confirmed */
    pendingCount,
    /** Whether any offline mutation is in progress */
    isPending: offlineMutation.isPending,
  };
}

/**
 * Hook for fetching the conversation thread list.
 */
export function useThreadList() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await apiClient.get<ThreadListResponse>(
        '/api/conversations/list',
      );
      return res.data.threads;
    },
    staleTime: 1000 * 60, // 1 min
  });
}
