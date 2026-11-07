import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, Text, View } from 'react-native';
import type { DeviceStatus, ExecutionReport, MediaResult } from '@tvc/command-engine';
import { useDevices } from '@/store/devices';
import { useTheme } from '@/theme';
import { Button, Label } from './ui';

const STATUS_TEXT: Record<DeviceStatus, string> = {
  confirmed: 'Done',
  acknowledged: 'TV accepted the command',
  sent: 'Sent to TV',
  failed: 'Failed',
  unsupported: 'Not supported on this TV',
  offline: 'TV offline',
};

const STEP_TEXT = {
  resolve_device: 'Chose TV',
  search: 'Searched',
  select_content: 'Picked',
  send_command: 'Sent command',
} as const;

export function describeIntent(i: ExecutionReport['intent']): string {
  switch (i.intent) {
    case 'remote_key': return `Press ${i.key.replace('_', ' ')}${i.repeat > 1 ? ` ×${i.repeat}` : ''}`;
    case 'power': return `Turn ${i.action}`;
    case 'volume_set': return `Set volume to ${i.level}`;
    case 'volume_change': return `Volume ${i.direction} ${i.steps} steps`;
    case 'launch_app': return `Open ${i.app.replace('_', ' ')}`;
    case 'select_input': return `Switch to ${i.input.toUpperCase()}`;
    case 'type_text': return `Type “${i.text}”`;
    case 'search': return `Search ${i.app ?? 'YouTube'} for “${i.query}”`;
    case 'play_media': return `Play “${i.query}” on ${i.app}`;
    case 'query_state': return 'Check what’s on';
  }
}

export function ReportView({
  report, onConfirm, onPick,
}: { report: ExecutionReport; onConfirm?: () => void; onPick?: (m: MediaResult) => void }) {
  const { colors, type, space, radius } = useTheme();
  const devices = useDevices((s) => s.devices);
  const name = (id: string) => devices.find((d) => d.id === id)?.name ?? id;

  if (report.outcome === 'needs_confirmation') {
    return (
      <View style={{ gap: space.md }}>
        <Label>{report.reason}</Label>
        <Label muted>{report.deviceIds.map(name).join(', ')}</Label>
        {onConfirm ? <Button label="Confirm" variant="primary" icon="checkmark" onPress={onConfirm} /> : null}
      </View>
    );
  }
  if (report.outcome === 'needs_device') {
    const r = report.resolution;
    const msg = r.reason === 'no_devices' ? 'Add a TV first (Devices tab).'
      : r.reason === 'no_default' ? 'Which TV? Choose a default TV in Devices.'
      : r.reason === 'ambiguous' ? `More than one TV matches: ${r.candidates.map((c) => c.name).join(', ')}.`
      : 'I couldn’t find a TV with that name.';
    return <Label>{msg}</Label>;
  }
  if (report.outcome === 'search_results') {
    return (
      <View style={{ gap: space.sm }}>
        <Label muted>{report.results.length ? 'Tap a result to play it on the TV' : 'No results.'}</Label>
        {report.results.map((m) => (
          <Pressable key={m.id} onPress={() => onPick?.(m)} accessibilityRole="button" style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            {m.thumbnailUrl ? <Image source={{ uri: m.thumbnailUrl }} style={{ width: 96, height: 54, borderRadius: radius.sm }} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={[type.label, { color: colors.text }]} numberOfLines={2}>{m.title}</Text>
              {m.channel ? <Text style={[type.caption, { color: colors.textMuted }]}>{m.channel}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
    );
  }

  const tone = report.outcome === 'completed' ? colors.success : report.outcome === 'partial' ? colors.warning : colors.danger;
  return (
    <View style={{ gap: space.sm }}>
      {report.steps.filter((s) => s.step !== 'resolve_device').map((s) => (
        <Row key={s.step} ok={s.status === 'ok'} text={`${STEP_TEXT[s.step]}${s.detail ? `: ${s.detail}` : ''}`} />
      ))}
      {report.devices.map((d) => (
        <View key={d.deviceId} style={{ gap: 2 }}>
          <Text style={[type.label, { color: tone }]}>{name(d.deviceId)} — {STATUS_TEXT[d.status]}</Text>
          {d.detail ? <Text style={[type.caption, { color: colors.textMuted }]}>{d.detail}</Text> : null}
          {d.state ? (
            <Text style={[type.caption, { color: colors.textMuted }]}>
              {[d.state.power && `Power: ${d.state.power}`, d.state.volume !== undefined && `Volume: ${d.state.volume}`, d.state.foregroundAppId && `App: ${d.state.foregroundAppId}`].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Row({ ok, text }: { ok: boolean; text: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={16} color={ok ? colors.success : colors.danger} />
      <Text style={[type.label, { color: colors.textMuted, flex: 1 }]}>{text}</Text>
    </View>
  );
}
