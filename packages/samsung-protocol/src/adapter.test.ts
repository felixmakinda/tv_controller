import { describe, expect, it, vi } from 'vitest';
import type { HttpClient, LanTransport, MessageSocket, SocketFactory, Transports } from '@tvc/device-contracts';
import { SamsungTizenAdapter } from './adapter';
import { base64Utf8 } from './base64';
import { controlUrl, parseDeviceInfo } from './protocol';

/**
 * A scripted fake TV. Message shapes mirror the fixtures in samsungtvws /
 * Home Assistant tests. This validates our logic against those shapes — it
 * does NOT prove compatibility with real hardware.
 */
class FakeTv implements MessageSocket {
  sent: unknown[] = [];
  private msg = new Set<(d: string) => void>();
  private closeL = new Set<(i: { reason?: string }) => void>();
  constructor(private readonly onSend: (m: Record<string, unknown>, tv: FakeTv) => void = () => {}) {}
  send(data: string) {
    const m = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(m);
    this.onSend(m, this);
  }
  close() { this.closeL.forEach((l) => l({ reason: 'closed' })); }
  onMessage(l: (d: string) => void) { this.msg.add(l); return () => this.msg.delete(l); }
  onClose(l: (i: { reason?: string }) => void) { this.closeL.add(l); return () => this.closeL.delete(l); }
  emit(v: unknown) { const s = JSON.stringify(v); setTimeout(() => this.msg.forEach((l) => l(s)), 1); }
}

const INFO = {
  device: {
    name: 'Living Room', modelName: 'QE55Q80B', OS: 'Tizen', TokenAuthSupport: 'true',
    wifiMac: 'aa:bb:cc:dd:ee:ff', duid: 'uuid:1234', FrameTVSupport: 'false', networkType: 'wireless',
  },
  id: 'uuid:1234', type: 'Samsung SmartTV', name: 'Living Room',
};

function transports(tv: FakeTv, opts: { http?: HttpClient; lan?: LanTransport } = {}) {
  const urls: string[] = [];
  const socket: SocketFactory = {
    open: vi.fn(async (url, o) => {
      urls.push(`${url}|pin=${o?.pinKey ?? ''}`);
      // Startup noise before connect, as real TVs do.
      tv.emit({ event: 'ms.channel.ready' });
      return tv;
    }),
  };
  const http: HttpClient = opts.http ?? {
    request: vi.fn(async (url: string) => ({
      status: url.endsWith('/api/v2/') ? 200 : 404,
      text: async () => JSON.stringify(INFO),
    })),
  };
  const t: Transports = { socket, http, ...(opts.lan ? { lan: opts.lan } : {}) };
  return { t, urls };
}

describe('protocol helpers', () => {
  it('base64 handles UTF-8', () => {
    expect(base64Utf8('Universal Remote')).toBe('VW5pdmVyc2FsIFJlbW90ZQ==');
    expect(base64Utf8('café ✓')).toBe('Y2Fmw6kg4pyT');
  });
  it('control URL appends the token only on the secure port', () => {
    expect(controlUrl('10.0.0.5', { clientName: 'X', secure: true, token: '42' })).toBe(
      'wss://10.0.0.5:8002/api/v2/channels/samsung.remote.control?name=WA%3D%3D&token=42',
    );
    expect(controlUrl('10.0.0.5', { clientName: 'X', secure: false, token: '42' })).not.toContain('token');
  });
  it('parses device info and rejects non-Samsung JSON', () => {
    expect(parseDeviceInfo(INFO)).toMatchObject({ uniqueId: 'uuid:1234', tokenAuthSupport: true, wifiMac: 'aa:bb:cc:dd:ee:ff' });
    expect(parseDeviceInfo({ foo: 1 })).toBeNull();
  });
});

describe('SamsungTizenAdapter', () => {
  it('discovers via SSDP then probes each host once', async () => {
    const tv = new FakeTv();
    const lan: LanTransport = {
      ssdpSearch: vi.fn(async () => [
        { address: '10.0.0.5', headers: {} },
        { address: '10.0.0.5', headers: {} },
      ]),
      wakeOnLan: vi.fn(),
    };
    const { t } = transports(tv, { lan });
    const found = await new SamsungTizenAdapter({ transports: t }).discover();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ host: '10.0.0.5', uniqueId: 'uuid:1234', details: { mac: 'aa:bb:cc:dd:ee:ff' } });
  });

  it('pairs over wss with a pinned cert and captures the numeric token', async () => {
    const tv = new FakeTv();
    const { t, urls } = transports(tv);
    const adapter = new SamsungTizenAdapter({ transports: t });
    const dev = (await adapter.probe('10.0.0.5'))!;
    const show = vi.fn();
    const p = adapter.pair(dev, { showInstruction: show });
    tv.emit({ event: 'ms.channel.connect', from: 'host', data: { token: 12345678 } });
    const paired = await p;
    expect(paired.credentials).toEqual({ token: '12345678', secure: 'true' });
    expect(urls[0]).toMatch(/^wss:\/\/10\.0\.0\.5:8002\/.*\|pin=samsung:uuid:1234$/);
    expect(show).toHaveBeenCalled();
  });

  it('reports a rejected pairing', async () => {
    const tv = new FakeTv();
    const { t } = transports(tv);
    const adapter = new SamsungTizenAdapter({ transports: t });
    const dev = (await adapter.probe('10.0.0.5'))!;
    const p = adapter.pair(dev, { showInstruction: () => {} });
    tv.emit({ event: 'ms.channel.unauthorized' });
    await expect(p).rejects.toMatchObject({ code: 'pairing_rejected' });
  });

  async function connected(onSend?: ConstructorParameters<typeof FakeTv>[0], details: Record<string, string> = {}) {
    const tv = new FakeTv(onSend);
    const { t } = transports(tv);
    const adapter = new SamsungTizenAdapter({ transports: t, frameHoldMs: 1 });
    const dev = (await adapter.probe('10.0.0.5'))!;
    const p = adapter.connect({ ...dev, details: { ...dev.details, ...details }, credentials: { token: '1', secure: 'true' } });
    tv.emit({ event: 'ms.channel.connect', data: {} });
    return { tv, session: await p };
  }

  it('sends key presses in the documented shape', async () => {
    const { tv, session } = await connected();
    expect(await session.sendKey('volume_up')).toEqual({ status: 'sent' });
    expect(tv.sent.at(-1)).toEqual({
      method: 'ms.remote.control',
      params: { Cmd: 'Click', DataOfCmd: 'KEY_VOLUP', Option: 'false', TypeOfRemote: 'SendRemoteKey' },
    });
  });

  it('play_pause alternates PAUSE/PLAY since no toggle key exists', async () => {
    const { tv, session } = await connected();
    await session.sendKey('play_pause');
    await session.sendKey('play_pause');
    const codes = tv.sent.map((m) => (m as { params: { DataOfCmd: string } }).params.DataOfCmd);
    expect(codes).toEqual(['KEY_PAUSE', 'KEY_PLAY']);
  });

  it('text: announces once, base64 in Cmd, ends on submit', async () => {
    const { tv, session } = await connected();
    tv.emit({ event: 'ms.remote.imeStart' });
    await new Promise((r) => setTimeout(r, 5));
    const r = await session.sendText('Sauti Sol', { submit: true });
    expect(r.status).toBe('sent');
    expect(r.detail).toBeUndefined();
    expect(tv.sent).toEqual([
      { method: 'ms.channel.emit', params: { event: 'custom.remote.textReceived', to: 'broadcast' } },
      { method: 'ms.remote.control', params: { Cmd: base64Utf8('Sauti Sol'), DataOfCmd: 'base64', TypeOfRemote: 'SendInputString' } },
      { method: 'ms.remote.control', params: { TypeOfRemote: 'SendInputEnd' } },
    ]);
  });

  it('text without an open IME warns instead of claiming success', async () => {
    const { session } = await connected();
    expect((await session.sendText('x')).detail).toMatch(/No text field/);
  });

  it('launches an app using the id from the installed-app list and reads the ack', async () => {
    const { session, tv } = await connected((m, fake) => {
      const ev = (m.params as { event?: string }).event;
      if (ev === 'ed.installedApp.get') {
        fake.emit({ event: 'ed.installedApp.get', data: { data: [{ appId: 'NFX-ID', name: 'Netflix', app_type: 2 }] } });
      }
      if (ev === 'ed.apps.launch') fake.emit({ event: 'ed.apps.launch', data: 200 });
    });
    expect(await session.launchApp('netflix')).toEqual({ status: 'acknowledged' });
    expect(tv.sent.at(-1)).toMatchObject({ params: { event: 'ed.apps.launch', data: { appId: 'NFX-ID', action_type: 'DEEP_LINK' } } });
  });

  it('reports an app missing from the installed list as unsupported', async () => {
    const { session } = await connected((m, fake) => {
      if ((m.params as { event?: string }).event === 'ed.installedApp.get') {
        fake.emit({ event: 'ed.installedApp.get', data: { data: [{ appId: 'x', name: 'YouTube' }] } });
      }
    });
    await expect(session.launchApp('netflix')).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('Frame TV power-off holds the key instead of clicking', async () => {
    const { tv, session } = await connected(undefined, { frameTv: 'true' });
    await session.powerOff();
    expect(tv.sent.map((m) => (m as { params: { Cmd: string } }).params.Cmd)).toEqual(['Press', 'Release']);
  });

  it('exact volume and HDMI selection are honestly unsupported', async () => {
    const { session } = await connected();
    expect(session.capabilities['volume.set']).toBe('unsupported');
    expect(session.capabilities['input.select']).toBe('unsupported');
    await expect(session.setVolume(20)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('marks the session disconnected when the socket drops, and refuses to send', async () => {
    const { tv, session } = await connected();
    const states: string[] = [];
    session.onConnectionStateChange((s) => states.push(s));
    tv.close();
    expect(states).toEqual(['disconnected']);
    await expect(session.sendKey('home')).rejects.toMatchObject({ code: 'not_connected' });
  });

  it('power on uses Wake-on-LAN with the MAC', async () => {
    const tv = new FakeTv();
    const lan: LanTransport = { ssdpSearch: vi.fn(async () => []), wakeOnLan: vi.fn(async () => {}) };
    const { t } = transports(tv, { lan });
    const adapter = new SamsungTizenAdapter({ transports: t });
    const dev = (await adapter.probe('10.0.0.5'))!;
    const r = await adapter.powerOn({ ...dev, credentials: {} });
    expect(lan.wakeOnLan).toHaveBeenCalledWith('aa:bb:cc:dd:ee:ff');
    expect(r.status).toBe('sent');
  });
});
