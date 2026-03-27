import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { streamChat, type ChatEvent } from '@/lib/sse';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
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

  const sendMessage = useCallback(
    (text: string) => {
      if (isStreaming || !text.trim()) return;

      // Add user message immediately
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingText('');

      let accumulatedText = '';
      let resolvedThreadId = currentThreadId;

      const cleanup = streamChat(text.trim(), currentThreadId, {
        onEvent: (event: ChatEvent) => {
          switch (event.type) {
            case 'thread': {
              // Server tells us the thread ID (created on first message)
              const threadData = event.data as { threadId: string };
              resolvedThreadId = threadData.threadId;
              setCurrentThreadId(threadData.threadId);
              break;
            }
            case 'content_delta': {
              // Streaming text token
              accumulatedText += event.data as string;
              setStreamingText(accumulatedText);
              break;
            }
            case 'message': {
              // Final compiled message (fallback if content_delta not used)
              if (!accumulatedText) {
                accumulatedText = event.data as string;
                setStreamingText(accumulatedText);
              }
              break;
            }
            case 'error': {
              // Show error as assistant message
              const errorText =
                typeof event.data === 'string'
                  ? event.data
                  : 'Something went wrong';
              accumulatedText = errorText;
              setStreamingText(errorText);
              break;
            }
            // Ignore: stage, thinking_*, tool_call, plan, etc. for now
          }
        },
        onDone: () => {
          // Convert streaming text to a final assistant message
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

          // Invalidate thread list so new threads appear
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
    [isStreaming, currentThreadId, queryClient],
  );

  const clearChat = useCallback(() => {
    cleanupRef.current?.();
    setMessages([]);
    setStreamingText('');
    setIsStreaming(false);
    setCurrentThreadId(null);
  }, []);

  return {
    messages,
    isStreaming,
    streamingText,
    currentThreadId,
    sendMessage,
    clearChat,
    isLoadingHistory: historyQuery.isLoading,
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
