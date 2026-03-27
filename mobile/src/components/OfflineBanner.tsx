import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useOffline } from '@/hooks/useOffline';

/**
 * Offline status banner that slides in/out at the top of the screen.
 *
 * States:
 * - Offline: red banner "You're offline. Messages will be sent when you reconnect."
 * - Reconnecting: yellow banner "Syncing N pending messages..."
 * - Online (no pending): hidden
 */
export function OfflineBanner() {
  const { isOffline, isReconnecting, pendingCount } = useOffline();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const visible = isOffline || isReconnecting;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  // Always render (for animation out), but skip the expensive layout when not needed
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-50, 0],
  });

  const backgroundColor = isOffline ? '#dc2626' : '#d97706';
  const message = isOffline
    ? "You're offline. Messages will be sent when you reconnect."
    : `Syncing ${pendingCount} pending message${pendingCount !== 1 ? 's' : ''}...`;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor,
          transform: [{ translateY }],
          opacity: slideAnim,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={styles.inner}>
        <Text style={styles.icon}>{isOffline ? '\u26A0\uFE0F' : '\uD83D\uDD04'}</Text>
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  icon: {
    fontSize: 14,
    marginRight: 8,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
});
