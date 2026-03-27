import React, { useEffect, useRef } from 'react';
import { Text, View, StyleSheet, Animated } from 'react-native';

interface StreamingTextProps {
  text: string;
}

/**
 * Renders streaming text with a blinking cursor at the end.
 * The cursor fades in/out to indicate active streaming.
 */
export function StreamingText({ text }: StreamingTextProps) {
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    );
    blink.start();
    return () => blink.stop();
  }, [cursorOpacity]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {text}
        <Animated.Text style={[styles.cursor, { opacity: cursorOpacity }]}>
          {'\u2588'}
        </Animated.Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    color: '#e4e4e7',
  },
  cursor: {
    fontSize: 15,
    color: '#2563eb',
  },
});
