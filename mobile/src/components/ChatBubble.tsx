import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StreamingText } from './StreamingText';
import type { ChatMessage } from '@/hooks/useChat';

interface ChatBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingText?: string;
}

/**
 * Chat message bubble.
 * User messages: right-aligned, primary blue background.
 * Assistant messages: left-aligned, dark grey background.
 * When streaming, renders StreamingText with blinking cursor.
 */
export function ChatBubble({
  message,
  isStreaming,
  streamingText,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';

  const formattedTime = formatTime(message.timestamp);

  return (
    <View
      style={[
        styles.row,
        isUser ? styles.rowUser : styles.rowAssistant,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        {isStreaming && streamingText !== undefined ? (
          <StreamingText text={streamingText} />
        ) : (
          <Text
            style={[
              styles.messageText,
              isUser ? styles.textUser : styles.textAssistant,
            ]}
          >
            {message.content}
          </Text>
        )}
      </View>
      <Text
        style={[
          styles.timestamp,
          isUser ? styles.timestampUser : styles.timestampAssistant,
        ]}
      >
        {formattedTime}
      </Text>
    </View>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  row: {
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  rowUser: {
    alignItems: 'flex-end',
  },
  rowAssistant: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleUser: {
    backgroundColor: '#2563eb',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#27272a',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  textUser: {
    color: '#fff',
  },
  textAssistant: {
    color: '#e4e4e7',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 2,
  },
  timestampUser: {
    color: '#71717a',
    marginRight: 4,
  },
  timestampAssistant: {
    color: '#71717a',
    marginLeft: 4,
  },
});
