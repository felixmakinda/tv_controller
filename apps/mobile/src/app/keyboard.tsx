import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Switch, TextInput, View } from 'react-native';
import { getSession } from '@/devices/connection';
import { Button, Card, Label, Screen } from '@/components/ui';
import { pressKey } from '@/commands/useCommandRunner';
import { useActiveDevice } from '@/hooks/useActiveDevice';
import { useTheme } from '@/theme';

/**
 * Phone keyboard → TV text field. Text is never logged or persisted; the
 * password toggle only masks it on screen.
 */
export default function Keyboard() {
  const { colors, type, space, radius } = useTheme();
  const params = useLocalSearchParams<{ text?: string; hint?: string }>();
  const active = useActiveDevice();
  const [text, setText] = useState(params.text ?? '');
  const [secret, setSecret] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const send = async (submit: boolean) => {
    const session = active.device ? getSession(active.device.id) : undefined;
    if (!session) return setStatus('TV is not connected.');
    try {
      const r = await session.sendText(text, { submit });
      setStatus(r.detail ?? (submit ? 'Sent and submitted.' : 'Sent.'));
      if (submit) setText('');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      {params.hint === 'search' ? (
        <Card>
          <Label>On the TV, open the app’s search box (D-pad if needed), then tap Send.</Label>
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: active.textInputActive ? colors.success : colors.warning }} />
        <Label>
          {active.textInputActive ? 'TV reports a text field is open — ready.' : 'TV hasn’t reported an open text field yet.'}
        </Label>
      </View>
      {!active.textInputActive ? (
        <Label muted>Select the search box on the TV with the remote and press OK. The dot turns green when the TV accepts phone typing.</Label>
      ) : null}
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        secureTextEntry={secret}
        autoCorrect={!secret}
        autoCapitalize="none"
        placeholder="Type here"
        placeholderTextColor={colors.textMuted}
        onSubmitEditing={() => void send(true)}
        returnKeyType="send"
        style={[type.body, { color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, borderWidth: 1, borderColor: colors.border }]}
        accessibilityLabel="Text to send to the TV"
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label muted>Password (hide text)</Label>
        <Switch value={secret} onValueChange={setSecret} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
        <Button label="Send" icon="send" variant="primary" onPress={() => void send(false)} disabled={!text} />
        <Button label="Send & search" icon="return-down-forward" onPress={() => void send(true)} disabled={!text} />
        <Button label="Paste" icon="clipboard" onPress={() => void Clipboard.getStringAsync().then((s) => setText((t) => t + s))} />
        <Button label="TV Enter" icon="checkmark" onPress={() => void pressKey('select')} />
      </View>
      {status ? <Label style={{ color: colors.text }}>{status}</Label> : null}
    </Screen>
  );
}
