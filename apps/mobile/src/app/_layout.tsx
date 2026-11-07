import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { startConnectionManager } from '@/devices/connection';
import { useDevices } from '@/store/devices';
import { useTheme } from '@/theme';

export default function RootLayout() {
  const { colors, scheme } = useTheme();

  useEffect(() => {
    // Wait for persisted devices to load before reconnecting.
    let stop: (() => void) | undefined;
    const begin = () => (stop = startConnectionManager());
    if (useDevices.persist.hasHydrated()) begin();
    const unsub = useDevices.persist.onFinishHydration(begin);
    return () => {
      unsub();
      stop?.();
    };
  }, []);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="assistant" options={{ presentation: 'modal', title: 'Assistant' }} />
        <Stack.Screen name="keyboard" options={{ presentation: 'modal', title: 'Keyboard' }} />
        <Stack.Screen name="add-device" options={{ presentation: 'modal', title: 'Add a TV' }} />
      </Stack>
    </>
  );
}
