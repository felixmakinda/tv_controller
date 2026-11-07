import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import type { IconName } from '@/components/ui';
import { useTheme } from '@/theme';

const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue | null; size: number }) {
    return <Ionicons name={name} color={typeof color === "number" ? undefined : color ?? undefined} size={size} />;
  };

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('mic-outline') }} />
      <Tabs.Screen name="remote" options={{ title: 'Remote', tabBarIcon: icon('game-controller-outline') }} />
      <Tabs.Screen name="devices" options={{ title: 'Devices', tabBarIcon: icon('tv-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings-outline') }} />
    </Tabs>
  );
}
