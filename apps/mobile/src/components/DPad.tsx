import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import type { RemoteKey } from '@tvc/device-contracts';
import { useTheme } from '@/theme';
import type { IconName } from './ui';

export function DPad({ onKey, size = 240 }: { onKey: (k: RemoteKey) => void; size?: number }) {
  const { colors, type } = useTheme();
  const third = size / 3;
  const arrow = (key: RemoteKey, icon: IconName, pos: object, label: string) => (
    <Pressable
      onPress={() => onKey(key)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        { position: 'absolute', width: third, height: third, alignItems: 'center', justifyContent: 'center', borderRadius: third / 2, backgroundColor: pressed ? colors.border : 'transparent' },
        pos,
      ]}
    >
      <Ionicons name={icon} size={30} color={colors.text} />
    </Pressable>
  );
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceHigh, alignSelf: 'center' }}>
      {arrow('up', 'chevron-up', { top: 0, left: third }, 'Up')}
      {arrow('down', 'chevron-down', { bottom: 0, left: third }, 'Down')}
      {arrow('left', 'chevron-back', { left: 0, top: third }, 'Left')}
      {arrow('right', 'chevron-forward', { right: 0, top: third }, 'Right')}
      <Pressable
        onPress={() => onKey('select')}
        accessibilityRole="button"
        accessibilityLabel="OK"
        style={({ pressed }) => ({
          position: 'absolute', left: third, top: third, width: third, height: third, borderRadius: third / 2,
          alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.accent : colors.surface,
        })}
      >
        <Text style={[type.heading, { color: colors.text }]}>OK</Text>
      </Pressable>
    </View>
  );
}
