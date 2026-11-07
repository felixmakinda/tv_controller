import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import { useTheme } from '@/theme';

/** The primary interaction. Tap to start listening, tap again to stop. */
export function MicButton({ listening, onPress, size = 112 }: { listening: boolean; onPress: () => void; size?: number }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!listening) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop listening' : 'Speak a command'}
      style={{ alignSelf: 'center', width: size * 1.5, height: size * 1.5, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={{
          position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
        }}
      />
      <Animated.View
        style={{
          width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
          backgroundColor: listening ? colors.danger : colors.accent,
        }}
      >
        <Ionicons name={listening ? 'stop' : 'mic'} size={size * 0.42} color={colors.accentText} />
      </Animated.View>
    </Pressable>
  );
}
