import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useChat, type ChatMessage } from '@/hooks/useChat';
import { useVoice } from '@/hooks/useVoice';
import { ChatBubble } from '@/components/ChatBubble';
import { ChatInput } from '@/components/ChatInput';

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const router = useRouter();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // "new" means start a fresh conversation with no thread ID
  const isNewChat = threadId === 'new';

  const {
    messages,
    isStreaming,
    streamingText,
    sendMessage,
    isLoadingHistory,
  } = useChat(isNewChat ? null : threadId);

  // Voice recording integration
  const [transcribedText, setTranscribedText] = useState<string | undefined>();
  const voice = useVoice({
    onTranscript: (text) => {
      setTranscribedText(text);
      // Reset after applying so the effect triggers on repeated transcriptions
      setTimeout(() => setTranscribedText(undefined), 100);
    },
  });

  // Auto-scroll to bottom on new messages or streaming
  useEffect(() => {
    if (messages.length > 0 || streamingText) {
      // Small delay so FlatList has time to layout
      const t = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(t);
    }
  }, [messages.length, streamingText]);

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      // If this is the last message and streaming, show streaming bubble
      const isLastAssistant =
        index === messages.length - 1 &&
        item.role === 'assistant' &&
        isStreaming;

      return (
        <ChatBubble
          message={item}
          isStreaming={isLastAssistant}
          streamingText={isLastAssistant ? streamingText : undefined}
        />
      );
    },
    [messages.length, isStreaming, streamingText],
  );

  // Show streaming bubble as a separate item when streaming and last message is user
  const dataWithStreamingPlaceholder: ChatMessage[] = React.useMemo(() => {
    if (isStreaming && streamingText && messages[messages.length - 1]?.role === 'user') {
      return [
        ...messages,
        {
          id: 'streaming-placeholder',
          role: 'assistant' as const,
          content: streamingText,
          timestamp: new Date().toISOString(),
        },
      ];
    }
    return messages;
  }, [messages, isStreaming, streamingText]);

  const renderItemWithPlaceholder = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const isStreamingPlaceholder = item.id === 'streaming-placeholder';

      return (
        <ChatBubble
          message={item}
          isStreaming={isStreamingPlaceholder}
          streamingText={isStreamingPlaceholder ? streamingText : undefined}
        />
      );
    },
    [streamingText],
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backArrow}>{'\u2190'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {isNewChat ? 'New Chat' : 'Chat'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Messages */}
      {isLoadingHistory ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#2563eb" size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={dataWithStreamingPlaceholder}
          renderItem={renderItemWithPlaceholder}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {isNewChat ? 'Start a conversation' : 'No messages yet'}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Input with voice */}
      <ChatInput
        onSend={sendMessage}
        disabled={isStreaming}
        transcribedText={transcribedText}
        voice={{
          isRecording: voice.isRecording,
          isTranscribing: voice.isTranscribing,
          duration: voice.duration,
          onStart: voice.startRecording,
          onStop: voice.stopAndTranscribe,
          onCancel: voice.cancel,
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 22,
    color: '#fafafa',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#fafafa',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  messageList: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#52525b',
  },
});
