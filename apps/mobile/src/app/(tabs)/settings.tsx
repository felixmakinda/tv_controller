import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Button, Card, Label, Screen, SectionTitle, Title } from '@/components/ui';
import { YOUTUBE_KEY_SECRET } from '@/services/youtube';
import { useSettings, type SettingsState } from '@/store/settings';
import { secrets } from '@/store/storage';
import { useTheme } from '@/theme';

type BoolKey = 'onDeviceSpeech' | 'confirmPowerOff' | 'confirmMultiDevice';

export default function Settings() {
  const { colors, type, space, radius } = useTheme();
  const s = useSettings();
  const [ytKey, setYtKey] = useState('');
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    void secrets.get<string>(YOUTUBE_KEY_SECRET).then((k) => setHasKey(!!k));
  }, []);

  const toggle = (key: BoolKey, label: string, hint?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1 }}>
        <Label>{label}</Label>
        {hint ? <Label muted>{hint}</Label> : null}
      </View>
      <Switch value={s[key]} onValueChange={(v) => s.set(key, v)} />
    </View>
  );

  const choice = <K extends 'theme' | 'voiceLanguage'>(key: K, options: [SettingsState[K], string][]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {options.map(([value, label]) => {
        const on = s[key] === value;
        return (
          <Pressable key={String(value)} onPress={() => s.set(key, value)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.accent : colors.surfaceHigh }}>
            <Text style={[type.label, { color: on ? colors.accentText : colors.text }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Screen>
      <Title>Settings</Title>

      <SectionTitle>Appearance</SectionTitle>
      <Card>{choice('theme', [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']])}</Card>

      <SectionTitle>Voice</SectionTitle>
      <Card>
        {choice('voiceLanguage', [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-KE', 'English (Kenya)'], ['sw-KE', 'Kiswahili (preview)']])}
        {s.voiceLanguage === 'sw-KE' ? <Label muted>Speech is recognised in Kiswahili, but commands are only understood in English for now.</Label> : null}
        {toggle('onDeviceSpeech', 'On-device recognition', 'Keeps audio on the phone where supported. Turn off if recognition fails.')}
      </Card>

      <SectionTitle>Safety</SectionTitle>
      <Card>
        {toggle('confirmPowerOff', 'Confirm before turning a TV off')}
        {toggle('confirmMultiDevice', 'Confirm commands for several TVs')}
      </Card>

      <SectionTitle>YouTube search</SectionTitle>
      <Card>
        <Label muted>
          Needs a YouTube Data API key (free, ~100 searches/day). Stored only in this phone’s secure storage.
        </Label>
        <TextInput
          value={ytKey}
          onChangeText={setYtKey}
          placeholder={hasKey ? 'Key saved — enter a new one to replace' : 'Paste API key'}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          style={[type.body, { color: colors.text, backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, padding: space.md }]}
        />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="Save key" variant="primary" disabled={!ytKey.trim()} onPress={() => void secrets.set(YOUTUBE_KEY_SECRET, ytKey.trim()).then(() => { setYtKey(''); setHasKey(true); })} />
          {hasKey ? <Button label="Delete key" variant="danger" onPress={() => void secrets.remove(YOUTUBE_KEY_SECRET).then(() => setHasKey(false))} /> : null}
        </View>
      </Card>

      <SectionTitle>AI assistant</SectionTitle>
      <Card>
        <Label muted>Not enabled yet (Phase 3). Common commands are understood on the phone without AI.</Label>
      </Card>
    </Screen>
  );
}
