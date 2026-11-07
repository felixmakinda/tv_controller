import { router } from 'expo-router';
import { Text, View } from 'react-native';
import type { RemoteKey } from '@tvc/device-contracts';
import { DPad } from '@/components/DPad';
import { DemoTvLog } from '@/components/DemoTvLog';
import { Card, Label, RemoteKeyButton, Screen, StatusPill, type IconName } from '@/components/ui';
import { pressKey, runIntent } from '@/commands/useCommandRunner';
import { useActiveDevice } from '@/hooks/useActiveDevice';
import { useTheme } from '@/theme';

export default function Remote() {
  const { colors, space, type } = useTheme();
  const a = useActiveDevice();

  if (!a.device) {
    return (
      <Screen>
        <Label muted>Add a TV in the Devices tab to use the remote.</Label>
      </Screen>
    );
  }

  const key = (k: RemoteKey, icon: IconName, label: string, size?: number) => (
    <RemoteKeyButton key={k} icon={icon} label={label} onPress={() => void pressKey(k)} supported={a.canKey(k)} {...(size ? { size } : {})} />
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={[type.heading, { color: colors.text }]}>{a.device.name}</Text>
          <StatusPill status={a.status} />
        </View>
        <RemoteKeyButton
          icon="power"
          label="Power"
          supported={a.can('power.off') || a.can('power.on')}
          onPress={() => router.push({ pathname: '/assistant', params: { text: a.status === 'connected' ? 'turn off the tv' : 'turn on the tv' } })}
        />
      </View>

      {a.device?.adapterId === 'mock' ? <DemoTvLog limit={3} /> : null}
      <DPad onKey={(k) => void pressKey(k)} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {key('back', 'arrow-undo', 'Back')}
        {key('home', 'home', 'Home')}
        {key('menu', 'menu', 'Menu')}
        <RemoteKeyButton icon="keypad" label="Keyboard" supported={a.can('text.input')} onPress={() => router.push('/keyboard')} />
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ alignItems: 'center', gap: space.sm }}>
            {key('volume_up', 'add', 'Volume up')}
            <Label muted>VOL</Label>
            {key('volume_down', 'remove', 'Volume down')}
          </View>
          <View style={{ gap: space.md, alignItems: 'center' }}>
            {key('mute', 'volume-mute', 'Mute')}
            {key('source', 'swap-horizontal', 'Source')}
          </View>
          <View style={{ alignItems: 'center', gap: space.sm }}>
            {key('channel_up', 'chevron-up', 'Channel up')}
            <Label muted>CH</Label>
            {key('channel_down', 'chevron-down', 'Channel down')}
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {key('rewind', 'play-back', 'Rewind', 56)}
        {key('play_pause', 'play', 'Play or pause', 56)}
        {key('stop', 'stop', 'Stop', 56)}
        {key('fast_forward', 'play-forward', 'Fast forward', 56)}
      </View>

      {a.can('input.select') ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' }}>
          {['hdmi1', 'hdmi2', 'hdmi3'].map((input) => (
            <RemoteKeyButton key={input} icon="tv-outline" label={input.toUpperCase()} size={52}
              onPress={() => void runIntent({ intent: 'select_input', input, device: { type: 'default' } })} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
