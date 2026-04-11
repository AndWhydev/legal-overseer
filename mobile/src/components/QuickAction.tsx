import React, { useRef } from 'react';
import {
  Text,
  StyleSheet,
  Pressable,
  Animated,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

type QuickActionVariant = 'approve' | 'reject' | 'reply' | 'snooze';

interface Props {
  label: string;
  icon?: string;
  variant: QuickActionVariant;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

const VARIANT_STYLES: Record<QuickActionVariant, { bg: string; activeBg: string }> = {
  approve: { bg: '#16a34a', activeBg: '#15803d' },
  reject: { bg: '#dc2626', activeBg: '#b91c1c' },
  reply: { bg: '#2563eb', activeBg: '#1d4ed8' },
  snooze: { bg: '#6b7280', activeBg: '#4b5563' },
};

/**
 * Reusable quick action button with haptic feedback and scale animation.
 *
 * Variants: approve (green), reject (red), reply (blue), snooze (gray).
 * Used in approval detail screen and potentially other quick-interaction flows.
 */
export function QuickAction({ label, icon, variant, onPress, disabled, style }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const variantStyle = VARIANT_STYLES[variant];

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View
        style={[
          styles.button,
          {
            backgroundColor: disabled ? '#333' : variantStyle.bg,
            transform: [{ scale: scaleAnim }],
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <Text style={styles.label}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 120,
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
