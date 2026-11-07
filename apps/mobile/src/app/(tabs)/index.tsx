import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { CommandIntent } from '@tvc/command-schemas';
import { DPad } from '@/components/DPad';
import { MicButton } from '@/components/MicButton';
import { Card, Label, RemoteKeyButton, Screen, SectionTitle, StatusPill, Title, type IconName } from '@/components/ui';
import { pressKey, runIntent } from '@/commands/useCommandRunner';
import { useActiveDevice } from '@/hooks/useActiveDevice';
import { useTheme } from '@/theme';

export default function Home() {
  const { colors, space, radius, type } = useTheme();
  const active = useActiveDevice();
  const [text, setText] = useState('');

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    router.push({ pathname: '/assistant', params: { text: t } });
  };

  const quick: { label: string; icon: IconName; intent: CommandIntent['intent']; app?: string; show: boolean }[] = [
    { label: 'YouTube', icon: 'logo-youtube', intent: 'launch_app', app: 'youtube', show: active.can('app.launch') },
    { label: 'Netflix', icon: 'film-outline', intent: 'launch_app', app: 'netflix', show: active.can('app.launch') },
    { label: 'Keyboard', icon: 'keypad-outline', intent: 'type_text', show: active.can('text.input') },
    { label: 'Source', icon: 'swap-horizontal', intent: 'remote_key', show: active.canKey('source') },
  ];

  return (
    <Screen>
      <Pressable onPress={() => router.push('/devices')} accessibilityRole="button" style={{ alignItems: 'center', gap: 4, paddingTop: space.md }}>
        <Title>{active.device?.name ?? 'No TV yet'}</Title>
        {active.device ? <StatusPill status={active.status} /> : <Label muted>Tap to add your TV</Label>}
        {active.device?.adapterId === 'mock' ? <Label muted>Simulated device</Label> : null}
      </Pressable>

      <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.lg }}>
        <Text style={[type.heading, { color: colors.textMuted }]}>What would you like to watch?</Text>
        <MicButton listening={false} onPress={() => router.push({ pathname: '/assistant', params: { listen: '1' } })} />
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space.lg, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            placeholder="Search or type a command"
            placeholderTextColor={colors.textMuted}
            returnKeyType="go"
            style={[type.body, { flex: 1, color: colors.text, paddingVertical: 14, paddingHorizontal: space.sm }]}
            accessibilityLabel="Type a command"
          />
        </View>
      </View>

      {active.device ? (
        <>
          <SectionTitle>Quick actions</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {quick.filter((q) => q.show).map((q) => (
              <Pressable
                key={q.label}
                accessibilityRole="button"
                accessibilityLabel={q.label}
                onPress={() => {
                  if (q.intent === 'type_text') return router.push('/keyboard');
                  if (q.intent === 'remote_key') return void pressKey('source');
                  void runIntent({ intent: 'launch_app', app: q.app as 'youtube', device: { type: 'default' } });
                }}
                style={({ pressed }) => ({ flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceHigh : colors.surface })}
              >
                <Ionicons name={q.icon} size={22} color={colors.text} />
                <Label>{q.label}</Label>
              </Pressable>
            ))}
          </View>

          <SectionTitle>Remote</SectionTitle>
          <Card style={{ alignItems: 'center', gap: space.lg }}>
            <DPad onKey={(k) => void pressKey(k)} size={210} />
            <View style={{ flexDirection: 'row', gap: space.xl }}>
              <RemoteKeyButton icon="arrow-undo" label="Back" onPress={() => void pressKey('back')} supported={active.canKey('back')} />
              <RemoteKeyButton icon="home" label="Home" onPress={() => void pressKey('home')} supported={active.canKey('home')} />
              <RemoteKeyButton icon="play" label="Play or pause" onPress={() => void pressKey('play_pause')} supported={active.canKey('play_pause')} />
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
