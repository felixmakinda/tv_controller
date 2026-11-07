import { describe, expect, it, vi } from 'vitest';
import { CommandIntentSchema, type CommandIntent } from '@tvc/command-schemas';
import { capabilities, TVError, type DeviceSession } from '@tvc/device-contracts';
import { dispatch, type DispatchContext } from './dispatcher';
import { resolveTargets } from './devices';

const intent = (v: unknown) => CommandIntentSchema.parse(v) as CommandIntent;

function fakeSession(id: string, caps = capabilities(['navigation', 'volume.step', 'power.off', 'app.launch', 'app.deepLink'])) {
  const calls: string[] = [];
  const s: DeviceSession = {
    deviceId: id,
    capabilities: caps,
    connectionState: 'connected',
    onConnectionStateChange: () => () => {},
    sendKey: vi.fn(async (k) => { calls.push(`key:${k}`); return { status: 'sent' as const }; }),
    powerOff: vi.fn(async () => { calls.push('powerOff'); return { status: 'sent' as const }; }),
    setVolume: vi.fn(async () => { throw new TVError('unsupported', 'no'); }),
    selectInput: vi.fn(async () => ({ status: 'sent' as const })),
    sendText: vi.fn(async () => ({ status: 'sent' as const })),
    launchApp: vi.fn(async (a) => { calls.push(`launch:${a}`); return { status: 'acknowledged' as const }; }),
    openContent: vi.fn(async (a, c) => { calls.push(`open:${a}:${c}`); return { status: 'sent' as const }; }),
    getState: vi.fn(async () => ({ power: 'on' as const })),
    disconnect: vi.fn(async () => {}),
  };
  return { s, calls };
}

const devices = [
  { id: 'a', name: 'Living Room TV', room: 'Living Room' },
  { id: 'b', name: 'Bedroom TV', room: 'Bedroom' },
];

function ctx(sessions: Record<string, DeviceSession | undefined>, extra: Partial<DispatchContext> = {}): DispatchContext {
  return {
    devices,
    defaultDeviceId: 'a',
    getSession: (id) => sessions[id],
    powerOn: async () => ({ status: 'sent' }),
    repeatDelayMs: 0,
    ...extra,
  };
}

describe('resolveTargets', () => {
  it('matches by name ignoring "tv"', () => {
    expect(resolveTargets({ type: 'named', value: 'living room' }, devices)).toEqual({ ok: true, deviceIds: ['a'] });
  });
  it('matches by room', () => {
    expect(resolveTargets({ type: 'room', value: 'bedroom' }, devices)).toEqual({ ok: true, deviceIds: ['b'] });
  });
  it('no default with multiple devices asks the user', () => {
    expect(resolveTargets({ type: 'default' }, devices)).toMatchObject({ ok: false, reason: 'no_default' });
  });
  it('no match', () => {
    expect(resolveTargets({ type: 'named', value: 'garage' }, devices)).toMatchObject({ ok: false, reason: 'no_match' });
  });
});

describe('dispatch', () => {
  it('repeats volume steps', async () => {
    const { s, calls } = fakeSession('a');
    const r = await dispatch(intent({ intent: 'volume_change', direction: 'down', steps: 2 }), ctx({ a: s }));
    expect(r.outcome).toBe('completed');
    expect(calls).toEqual(['key:volume_down', 'key:volume_down']);
  });

  it('requires confirmation for power off, then executes', async () => {
    const { s, calls } = fakeSession('a');
    const i = intent({ intent: 'power', action: 'off' });
    expect((await dispatch(i, ctx({ a: s }))).outcome).toBe('needs_confirmation');
    expect(calls).toEqual([]);
    expect((await dispatch(i, ctx({ a: s }), { confirmed: true })).outcome).toBe('completed');
    expect(calls).toEqual(['powerOff']);
  });

  it('turn off all TVs reports partial when one is offline', async () => {
    const { s } = fakeSession('a');
    const r = await dispatch(intent({ intent: 'power', action: 'off', device: { type: 'all' } }), ctx({ a: s, b: undefined }), { confirmed: true });
    expect(r.outcome).toBe('partial');
    if (r.outcome === 'partial') {
      expect(r.devices.find((d) => d.deviceId === 'b')?.status).toBe('offline');
    }
  });

  it('blocks unsupported capabilities without calling the TV', async () => {
    const { s } = fakeSession('a');
    const r = await dispatch(intent({ intent: 'volume_set', level: 20 }), ctx({ a: s }));
    expect(r.outcome).toBe('failed');
    expect(s.setVolume).not.toHaveBeenCalled();
    if (r.outcome === 'failed') expect(r.devices[0]?.status).toBe('unsupported');
  });

  it('play_media: search → select → open content, with separate step statuses', async () => {
    const { s, calls } = fakeSession('a');
    const media = { app: 'youtube' as const, search: vi.fn(async () => [{ id: 'vid123', title: 'Sauti Sol - Suzanna' }]) };
    const r = await dispatch(intent({ intent: 'play_media', query: 'suzanna by sauti sol' }), ctx({ a: s }, { media }));
    expect(r.outcome).toBe('completed');
    expect(calls).toEqual(['open:youtube:vid123']);
    if (r.outcome === 'completed') {
      expect(r.steps.map((x) => `${x.step}:${x.status}`)).toEqual([
        'resolve_device:ok', 'search:ok', 'select_content:ok', 'send_command:ok',
      ]);
      // A deep link that was merely sent must not be reported as confirmed playback.
      expect(r.devices[0]?.status).toBe('sent');
    }
  });

  it('play_media with no results never touches the TV', async () => {
    const { s, calls } = fakeSession('a');
    const media = { app: 'youtube' as const, search: vi.fn(async () => []) };
    const r = await dispatch(intent({ intent: 'play_media', query: 'zzzz' }), ctx({ a: s }, { media }));
    expect(r.outcome).toBe('failed');
    expect(calls).toEqual([]);
  });

  it('Netflix (no catalogue API): opens the app and hands the query to the phone keyboard', async () => {
    const { s, calls } = fakeSession('a');
    const media = { app: 'youtube' as const, search: vi.fn(async () => []) };
    const r = await dispatch(intent({ intent: 'play_media', query: 'stranger things', app: 'netflix' }), ctx({ a: s }, { media }));
    expect(media.search).not.toHaveBeenCalled();
    expect(calls).toEqual(['launch:netflix']);
    expect(r).toMatchObject({ outcome: 'completed', followUp: { kind: 'type_text', text: 'stranger things' } });
    if (r.outcome === 'completed') expect(r.devices[0]?.status).toBe('acknowledged');
  });

  it('Netflix follow-up is withheld when the app could not be opened', async () => {
    const { s } = fakeSession('a', capabilities(['navigation']));
    const r = await dispatch(intent({ intent: 'search', query: 'x', app: 'netflix' }), ctx({ a: s }));
    expect(r.outcome).toBe('failed');
    expect(r).not.toHaveProperty('followUp');
  });

  it('YouTube without an API key falls back to: open YouTube + phone keyboard', async () => {
    const { s: sess, calls } = fakeSession('a');
    const r = await dispatch(intent({ intent: 'search', query: 'arsenal highlights' }), ctx({ a: sess }));
    expect(calls).toEqual(['launch:youtube']);
    expect(r).toMatchObject({ outcome: 'completed', followUp: { kind: 'type_text', text: 'arsenal highlights' } });
  });

  it('play_media without a provider never claims playback', async () => {
    const { s: sess } = fakeSession('a');
    const r = await dispatch(intent({ intent: 'play_media', query: 'x' }), ctx({ a: sess }));
    expect(r).not.toHaveProperty('media');
    if (r.outcome === 'completed') expect(r.devices[0]?.status).toBe('acknowledged'); // app launch only
  });

  it('ambiguous default asks for a device', async () => {
    const r = await dispatch(intent({ intent: 'remote_key', key: 'home' }), ctx({}, { defaultDeviceId: undefined }));
    expect(r.outcome).toBe('needs_device');
  });

  it('adapter errors become failed reports, not throws', async () => {
    const { s } = fakeSession('a');
    s.sendKey = vi.fn(async () => { throw new Error('socket closed'); });
    const r = await dispatch(intent({ intent: 'remote_key', key: 'home' }), ctx({ a: s }));
    expect(r.outcome).toBe('failed');
    if (r.outcome === 'failed') expect(r.devices[0]).toMatchObject({ status: 'failed', detail: 'socket closed' });
  });
});
