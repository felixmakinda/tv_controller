import { useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { mockLog } from '@/devices/adapters/mock';
import { useTheme } from '@/theme';
import { Card, SectionTitle } from './ui';

/** Shows what the simulated Demo TV "received", so button presses have visible feedback. */
export function DemoTvLog({ limit = 5 }: { limit?: number }) {
  const { colors, type } = useTheme();
  useSyncExternalStore(mockLog.subscribe, mockLog.version);
  const entries = mockLog.entries().slice(0, limit);

  return (
    <Card>
      <SectionTitle>Demo TV screen (simulated)</SectionTitle>
      {entries.length === 0 ? (
        <Text style={[type.label, { color: colors.textMuted }]}>Press a button or say a command — it will show up here.</Text>
      ) : (
        <View style={{ gap: 4 }}>
          {entries.map((e, i) => (
            <Text key={e.at + e.action} style={[type.label, { color: i === 0 ? colors.text : colors.textMuted }]}>
              {new Date(e.at).toLocaleTimeString()} · {e.action}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
}
