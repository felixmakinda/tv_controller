import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LinkStatus } from '@/devices/connection';
import { useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors, space } = useTheme();
  const inner = <View style={{ padding: space.lg, gap: space.lg }}>{children}</View>;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors, radius, space } = useTheme();
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function Label({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const { colors, type } = useTheme();
  return <Text style={[type.label, { color: muted ? colors.textMuted : colors.text }, style]}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  const { colors, type } = useTheme();
  return <Text style={[type.title, { color: colors.text }]}>{children}</Text>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const { colors, type } = useTheme();
  return <Text style={[type.caption, { color: colors.textMuted, textTransform: 'uppercase' }]}>{children}</Text>;
}

const STATUS: Record<LinkStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'textMuted' }> = {
  connected: { label: 'Connected', tone: 'success' },
  connecting: { label: 'Connecting…', tone: 'warning' },
  reconnecting: { label: 'Reconnecting…', tone: 'warning' },
  offline: { label: 'Offline', tone: 'danger' },
  unauthorized: { label: 'Pair again', tone: 'danger' },
  idle: { label: 'Not connected', tone: 'textMuted' },
};

export function StatusPill({ status }: { status: LinkStatus }) {
  const { colors, type } = useTheme();
  const s = STATUS[status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={`Status: ${s.label}`}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[s.tone] }} />
      <Text style={[type.label, { color: colors.textMuted }]}>{s.label}</Text>
    </View>
  );
}

export function Button({
  label, icon, onPress, variant = 'secondary', disabled, accessibilityLabel,
}: {
  label: string; icon?: IconName; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; accessibilityLabel?: string;
}) {
  const { colors, radius, type } = useTheme();
  const bg = variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : colors.surfaceHigh;
  const fg = variant === 'secondary' ? colors.text : colors.accentText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: bg, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 18,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[type.label, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** A round remote key. Hidden entirely when the TV doesn't support it. */
export function RemoteKeyButton({
  icon, label, onPress, supported = true, size = 64, onLongPress,
}: { icon: IconName; label: string; onPress: () => void; supported?: boolean; size?: number; onLongPress?: () => void }) {
  const { colors } = useTheme();
  if (!supported) return <View style={{ width: size, height: size }} />;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? colors.border : colors.surfaceHigh,
      })}
    >
      <Ionicons name={icon} size={size * 0.38} color={colors.text} />
    </Pressable>
  );
}
