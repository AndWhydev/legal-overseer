import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Pressable,
  Text,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  /** Voice recording controls */
  voice?: {
    isRecording: boolean;
    isTranscribing: boolean;
    duration: number;
    onStart: () => void;
    onStop: () => void;
    onCancel: () => void;
  };
  /** Text injected from voice transcription */
  transcribedText?: string;
}

/**
 * Chat text input bar with send + voice buttons.
 *
 * Normal mode: text input + mic button + send button.
 * Recording mode: pulsing red indicator + duration timer + stop button.
 * Transcribing mode: spinner with "Transcribing..." text.
 * Long-press mic for push-to-talk (release = stop + transcribe).
 */
export function ChatInput({
  onSend,
  disabled,
  voice,
  transcribedText,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Apply transcribed text when it arrives
  useEffect(() => {
    if (transcribedText) {
      setText(transcribedText);
    }
  }, [transcribedText]);

  // Pulse animation for recording indicator
  useEffect(() => {
    if (voice?.isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [voice?.isRecording, pulseAnim]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }, [text, disabled, onSend]);

  const handleMicPress = useCallback(() => {
    if (!voice) return;
    if (voice.isRecording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      voice.onStop();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      voice.onStart();
    }
  }, [voice]);

  const handleMicLongPress = useCallback(() => {
    if (!voice || voice.isRecording) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    voice.onStart();
  }, [voice]);

  const handleMicRelease = useCallback(() => {
    // Push-to-talk: release stops recording if it was started via long press
    // Only trigger if recording for at least 500ms to differentiate from tap
    if (voice?.isRecording && voice.duration >= 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      voice.onStop();
    }
  }, [voice]);

  const canSend = text.trim().length > 0 && !disabled;
  const isRecording = voice?.isRecording ?? false;
  const isTranscribing = voice?.isTranscribing ?? false;

  // Recording mode UI
  if (isRecording) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.container}>
          {/* Cancel button */}
          <TouchableOpacity
            onPress={voice?.onCancel}
            style={styles.cancelButton}
            accessibilityLabel="Cancel recording"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          {/* Recording indicator */}
          <View style={styles.recordingInfo}>
            <Animated.View
              style={[styles.recordingDot, { opacity: pulseAnim }]}
            />
            <Text style={styles.recordingTime}>
              {formatDuration(voice?.duration ?? 0)}
            </Text>
          </View>

          {/* Stop button */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              voice?.onStop();
            }}
            style={styles.stopButton}
            accessibilityLabel="Stop recording and transcribe"
          >
            <View style={styles.stopSquare} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Transcribing mode UI
  if (isTranscribing) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.container}>
          <View style={styles.transcribingContainer}>
            <ActivityIndicator color="#2563eb" size="small" />
            <Text style={styles.transcribingText}>Transcribing...</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Normal text input mode
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.container}>
        {/* Mic button with long-press for push-to-talk */}
        {voice && (
          <Pressable
            onPress={handleMicPress}
            onLongPress={handleMicLongPress}
            onPressOut={handleMicRelease}
            delayLongPress={300}
            style={styles.iconButton}
            accessibilityLabel="Start voice recording"
          >
            <Text style={styles.micIcon}>{'\uD83C\uDF99'}</Text>
          </Pressable>
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
          editable={!disabled}
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
            style={[styles.sendIcon, canSend && styles.sendIconActive]}
          >
            {'\u2191'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
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
  micIcon: {
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
  // Recording mode
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 14,
    color: '#a1a1aa',
  },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#dc2626',
  },
  recordingTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fafafa',
    fontVariant: ['tabular-nums'],
  },
  stopButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 14,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  // Transcribing mode
  transcribingContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  transcribingText: {
    fontSize: 14,
    color: '#a1a1aa',
  },
});
