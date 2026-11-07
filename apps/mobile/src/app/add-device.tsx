import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { isTVError, type DiscoveredDevice } from '@tvc/device-contracts';
import { Button, Card, Label, Screen, SectionTitle } from '@/components/ui';
import { nativeLanAvailable } from '@/connectivity/transports';
import { MOCK_DEVICE } from '@/devices/adapters/mock';
import { getAdapter, realAdapters } from '@/devices/registry';
import { useDevices } from '@/store/devices';
import { useTheme } from '@/theme';

type Phase =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'pairing'; device: DiscoveredDevice; message: string }
  | { kind: 'error'; message: string };

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export default function AddDevice() {
  const { colors, type, space, radius } = useTheme();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [found, setFound] = useState<DiscoveredDevice[]>([]);
  const [ip, setIp] = useState('');
  const saved = useDevices((s) => s.devices);

  const search = async () => {
    setPhase({ kind: 'searching' });
    try {
      const all = (await Promise.all(realAdapters.map((a) => a.discover({ timeoutMs: 3500 }).catch(() => [])))).flat();
      setFound(all);
      setPhase(all.length ? { kind: 'idle' } : { kind: 'error', message: 'No TVs found. Check the TV is on and on the same Wi-Fi, or enter its IP address.' });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const probe = async () => {
    if (!IPV4.test(ip.trim())) return setPhase({ kind: 'error', message: 'Enter an IP like 192.168.1.20 (TV Settings → Network → Status).' });
    setPhase({ kind: 'searching' });
    for (const a of realAdapters) {
      const d = await a.probe(ip.trim()).catch(() => null);
      if (d) {
        setFound((f) => [...f.filter((x) => x.uniqueId !== d.uniqueId), d]);
        return setPhase({ kind: 'idle' });
      }
    }
    setPhase({ kind: 'error', message: `No supported TV answered at ${ip.trim()}.` });
  };

  const pair = async (d: DiscoveredDevice) => {
    setPhase({ kind: 'pairing', device: d, message: 'Connecting…' });
    try {
      const paired = await getAdapter(d.adapterId).pair(d, {
        showInstruction: (message) => setPhase({ kind: 'pairing', device: d, message }),
      });
      await useDevices.getState().add(paired);
      router.back();
    } catch (e) {
      const msg = isTVError(e)
        ? e.code === 'pairing_rejected' ? 'The TV declined. Try again and choose “Allow”.'
        : e.code === 'pairing_timeout' || e.code === 'timeout' ? 'No answer on the TV. Try again and accept the prompt.'
        : e.message
        : String(e);
      setPhase({ kind: 'error', message: msg });
    }
  };

  const busy = phase.kind === 'searching' || phase.kind === 'pairing';

  return (
    <Screen>
      {!nativeLanAvailable ? (
        <Card>
          <Label>Real TV control needs the development build of this app (not Expo Go). You can still try the Demo TV.</Label>
        </Card>
      ) : null}

      {phase.kind === 'pairing' ? (
        <Card style={{ alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[type.heading, { color: colors.text, textAlign: 'center' }]}>{phase.message}</Text>
        </Card>
      ) : null}
      {phase.kind === 'error' ? <Label style={{ color: colors.danger }}>{phase.message}</Label> : null}

      <Button label={phase.kind === 'searching' ? 'Searching…' : 'Search this Wi-Fi'} icon="wifi" variant="primary" onPress={() => void search()} disabled={busy || !nativeLanAvailable} />

      {found.length ? <SectionTitle>Found</SectionTitle> : null}
      {found.map((d) => {
        const already = saved.some((s) => s.uniqueId === d.uniqueId);
        return (
          <Pressable key={d.uniqueId} disabled={busy} onPress={() => void pair(d)} accessibilityRole="button">
            <Card>
              <Text style={[type.heading, { color: colors.text }]}>{d.name}</Text>
              <Label muted>{[d.manufacturer, d.model, d.host].filter(Boolean).join(' · ')}{already ? ' · already added (tap to re-pair)' : ''}</Label>
            </Card>
          </Pressable>
        );
      })}

      <SectionTitle>Or enter the TV’s IP address</SectionTitle>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <TextInput
          value={ip}
          onChangeText={setIp}
          placeholder="192.168.1.20"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          style={[type.body, { flex: 1, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: space.lg, borderWidth: 1, borderColor: colors.border }]}
        />
        <Button label="Find" onPress={() => void probe()} disabled={busy || !nativeLanAvailable} />
      </View>

      <SectionTitle>No TV handy?</SectionTitle>
      <Button label="Add Demo TV (simulated)" icon="flask-outline" onPress={() => void pair(MOCK_DEVICE)} disabled={busy} />
    </Screen>
  );
}
