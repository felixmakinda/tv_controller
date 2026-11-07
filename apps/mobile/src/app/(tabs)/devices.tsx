import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { CAPABILITIES } from '@tvc/device-contracts';
import { Button, Card, Label, Screen, SectionTitle, StatusPill, Title } from '@/components/ui';
import { connectDevice, getSession, useConnections } from '@/devices/connection';
import { useDevices, type SavedDevice } from '@/store/devices';
import { useTheme } from '@/theme';

export default function Devices() {
  const devices = useDevices((s) => s.devices);
  return (
    <Screen>
      <Title>My devices</Title>
      {devices.length === 0 ? <Label muted>No TVs yet. Make sure your phone is on the same Wi-Fi as the TV.</Label> : null}
      {devices.map((d) => <DeviceCard key={d.id} device={d} />)}
      <Button label="Add a TV" icon="add" variant="primary" onPress={() => router.push('/add-device')} />
    </Screen>
  );
}

function DeviceCard({ device }: { device: SavedDevice }) {
  const { colors, type, space, radius } = useTheme();
  const status = useConnections((s) => s.status[device.id] ?? 'idle');
  const error = useConnections((s) => s.lastError[device.id]);
  useConnections((s) => s.version);
  const isDefault = useDevices((s) => s.defaultDeviceId === device.id);
  const { update, remove, setDefault } = useDevices.getState();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.name);
  const [room, setRoom] = useState(device.room ?? '');
  const [showCaps, setShowCaps] = useState(false);
  const caps = getSession(device.id)?.capabilities;

  const input = { color: colors.text, backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, padding: space.md, ...type.body };

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <SectionTitle>{device.room ?? 'No room'}{isDefault ? ' · Default' : ''}</SectionTitle>
          <Text style={[type.heading, { color: colors.text }]}>{device.name}</Text>
          <Label muted>{[device.manufacturer, device.model].filter(Boolean).join(' ')}{device.adapterId === 'mock' ? ' (simulated)' : ''}</Label>
        </View>
        <StatusPill status={status} />
      </View>
      {error && status !== 'connected' ? <Label muted>{error}</Label> : null}

      {editing ? (
        <View style={{ gap: space.sm }}>
          <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.textMuted} style={input} />
          <TextInput value={room} onChangeText={setRoom} placeholder="Room (e.g. Living Room)" placeholderTextColor={colors.textMuted} style={input} />
          <Button label="Save" variant="primary" onPress={() => {
            update(device.id, { name: name.trim() || device.name, ...(room.trim() ? { room: room.trim() } : {}) });
            setEditing(false);
          }} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {!isDefault ? <Button label="Make default" onPress={() => setDefault(device.id)} /> : null}
          <Button label="Rename" icon="pencil" onPress={() => setEditing(true)} />
          {status !== 'connected' ? <Button label="Reconnect" icon="refresh" onPress={() => void connectDevice(device)} /> : null}
          {status === 'unauthorized' ? <Button label="Pair again" onPress={() => router.push('/add-device')} /> : null}
          <Button label="Remove" icon="trash" variant="danger" onPress={() =>
            Alert.alert('Remove TV?', 'This deletes its pairing token from this phone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => void remove(device.id) },
            ])
          } />
        </View>
      )}

      <Pressable onPress={() => setShowCaps((v) => !v)} accessibilityRole="button">
        <Label muted>{showCaps ? 'Hide' : 'Show'} capabilities</Label>
      </Pressable>
      {showCaps ? (
        caps ? (
          <View style={{ gap: 2 }}>
            {CAPABILITIES.map((c) => (
              <Text key={c} style={[type.caption, { color: caps[c] === 'supported' ? colors.success : caps[c] === 'unknown' ? colors.warning : colors.textMuted }]}>
                {c}: {caps[c]}
              </Text>
            ))}
          </View>
        ) : <Label muted>Connect to read capabilities.</Label>
      ) : null}
    </Card>
  );
}
