import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { CommandIntentSchema } from '@tvc/command-schemas';
import { MicButton } from '@/components/MicButton';
import { describeIntent, ReportView } from '@/components/ReportView';
import { Button, Card, Label, Screen, SectionTitle } from '@/components/ui';
import { useCommandRunner } from '@/commands/useCommandRunner';
import { useActiveDevice } from '@/hooks/useActiveDevice';
import { useTheme } from '@/theme';
import { useSpeech } from '@/voice/useSpeech';

export default function Assistant() {
  const { colors, type, space } = useTheme();
  const params = useLocalSearchParams<{ text?: string; listen?: string }>();
  const active = useActiveDevice();
  const { state, runText, runParsed, reset } = useCommandRunner();
  const speech = useSpeech((final) => void runText(final));
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (params.text) void runText(params.text);
    else if (params.listen) void speech.start();
  }, [params.text, params.listen, runText, speech]);

  const listening = speech.phase === 'listening';
  const report = state.phase === 'done' ? state.report : undefined;
  const followUp = report && 'devices' in report ? report.followUp : undefined;
  const heard = listening ? speech.partial : 'text' in state ? state.text : undefined;

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: space.md }}>
        <MicButton
          listening={listening}
          size={88}
          onPress={() => {
            if (listening) speech.stop();
            else {
              reset();
              void speech.start();
            }
          }}
        />
        <Label muted>{listening ? 'Listening… tap to stop' : speech.error ?? 'Tap the mic and speak'}</Label>
        {listening ? <Button label="Cancel" icon="close" onPress={speech.cancel} /> : null}
      </View>

      {heard ? (
        <Card>
          <SectionTitle>You</SectionTitle>
          <Text style={[type.heading, { color: colors.text }]}>{heard}</Text>
        </Card>
      ) : null}

      {state.phase === 'running' && state.intent ? (
        <Card>
          <SectionTitle>Doing</SectionTitle>
          <Label>{describeIntent(state.intent)}</Label>
          <Label muted>on {active.device?.name ?? 'your TV'}…</Label>
        </Card>
      ) : null}

      {state.phase === 'not_understood' ? (
        <Card>
          <SectionTitle>Assistant</SectionTitle>
          <Label>I can’t handle that one yet without the AI interpreter (coming in Phase 3).</Label>
          {state.fallback ? (
            <Button
              label={describeIntent(state.fallback)}
              icon="search"
              variant="primary"
              onPress={() => void runParsed(state.fallback!, false, state.text)}
            />
          ) : null}
        </Card>
      ) : null}

      {state.phase === 'done' ? (
        <Card>
          <SectionTitle>{describeIntent(state.report.intent)}</SectionTitle>
          <ReportView
            report={state.report}
            onConfirm={() => void runParsed(state.report.intent, true, state.text)}
            onPick={(m) =>
              void runParsed(
                CommandIntentSchema.parse({ intent: 'play_media', query: m.title, app: 'youtube', device: state.report.intent.device }),
                false,
                m.title,
              )
            }
          />
          {followUp ? (
            <Button
              label={`Type “${followUp.text}” on the TV`}
              icon="keypad"
              variant="primary"
              onPress={() => router.push({ pathname: '/keyboard', params: { text: followUp.text, hint: 'search' } })}
            />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
