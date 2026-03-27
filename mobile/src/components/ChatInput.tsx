import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  /** Placeholder for microphone button -- wired in Task 2 */
  onMicPress?: () => void;
  /** Whether voice recording is active */
  isRecording?: boolean;
  /** Text injected from voice transcription */
  transcribedText?: string;
}

/**
 * Chat text input bar with send button.
 * Multiline input that grows up to maxHeight.
 * Microphone button placeholder for voice input (Task 2).
 */
export function ChatInput({
  onSend,
  disabled,
  onMicPress,
  isRecording,
  transcribedText,
}: ChatInputProps) {
  const [text, setText] = useState('');

  // Apply transcribed text when it changes
  React.useEffect(() => {
    if (transcribedText) {
      setText(transcribedText);
    }
  }, [transcribedText]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }, [text, disabled, onSend]);

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.container}>
        {/* Mic button */}
        {onMicPress && (
          <TouchableOpacity
            onPress={onMicPress}
            style={[
              styles.iconButton,
              isRecording && styles.iconButtonRecording,
            ]}
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start voice recording'}
          >
            <Text style={styles.iconText}>{isRecording ? '\u23F9' : '\uD83C\uDF99'}</Text>
          </TouchableOpacity>
        )}

        {/* Text input */}
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor="#52525b"
          multiline
          maxLength={4000}
          editable={!disabled && !isRecording}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />

        {/* Send button */}
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend}
          style={[styles.sendButton, canSend && styles.sendButtonActive]}
          accessibilityLabel="Send message"
        >
          <Text
            style={[
              styles.sendIcon,
              canSend && styles.sendIconActive,
            ]}
          >
            {'\u2191'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#09090b',
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    gap: 6,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#18181b',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fafafa',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#18181b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonRecording: {
    backgroundColor: '#dc2626',
  },
  iconText: {
    fontSize: 18,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: '#2563eb',
  },
  sendIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#52525b',
  },
  sendIconActive: {
    color: '#fff',
  },
});
