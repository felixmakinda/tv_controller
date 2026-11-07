import {
  capabilities,
  TVError,
  type Capability,
  type CommandOutcome,
  type ConnectionState,
  type DeviceSession,
  type DeviceState,
  type DiscoveredDevice,
  type DiscoverOptions,
  type KnownApp,
  type MessageSocket,
  type PairedDevice,
  type PairingPrompt,
  type RemoteKey,
  type Transports,
  type TVDeviceAdapter,
} from '@tvc/device-contracts';
import {
  APP_NAME_PATTERNS,
  controlUrl,
  EVENTS,
  FALLBACK_APP_IDS,
  infoUrl,
  installedAppsMessage,
  KEY_CODES,
  keyMessage,
  launchAppMessage,
  launchTypeFor,
  parseDeviceInfo,
  parseEvent,
  parseInstalledApps,
  PORT_DIAL,
  SSDP_REMOTE_RECEIVER,
  textEndMessage,
  textMessage,
  textReceivedMessage,
  tokenFromConnect,
  type InstalledApp,
  type SamsungEvent,
} from './protocol';

export interface SamsungAdapterOptions {
  transports: Transports;
  /** Shown on the TV's "Allow this device?" prompt. */
  clientName?: string;
  pairingTimeoutMs?: number;
  connectTimeoutMs?: number;
  /** Frame TVs: how long to hold KEY_POWER for a real power-off (HA uses 3s). */
  frameHoldMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait for the first event matching `pick`, ignoring startup noise (ms.channel.ready, clientConnect, …). */
function waitForEvent<T>(
  socket: MessageSocket,
  timeoutMs: number,
  pick: (e: SamsungEvent) => T | undefined,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      offMsg();
      offClose();
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new TVError('timeout', 'Timed out waiting for the TV.'))), timeoutMs);
    const offMsg = socket.onMessage((raw) => {
      const e = parseEvent(raw);
      if (!e) return;
      try {
        const v = pick(e);
        if (v !== undefined) finish(() => resolve(v));
      } catch (err) {
        finish(() => reject(err));
      }
    });
    const offClose = socket.onClose((info) =>
      finish(() => reject(new TVError('not_connected', `Connection closed${info.reason ? `: ${info.reason}` : ''}.`))),
    );
  });
}

function connectHandshake(socket: MessageSocket, timeoutMs: number): Promise<string | null> {
  return waitForEvent(socket, timeoutMs, (e) => {
    if (e.event === EVENTS.connect) return tokenFromConnect(e) ?? null;
    if (e.event === EVENTS.unauthorized) throw new TVError('pairing_rejected', 'The TV refused the connection.');
    if (e.event === EVENTS.timeOut) throw new TVError('pairing_timeout', 'Nobody answered the prompt on the TV.');
    return undefined;
  });
}

export class SamsungTizenAdapter implements TVDeviceAdapter {
  readonly id = 'samsung-tizen' as const;
  readonly displayName = 'Samsung Smart TV (Tizen)';
  private readonly t: Transports;
  private readonly clientName: string;
  private readonly pairingTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly frameHoldMs: number;

  constructor(opts: SamsungAdapterOptions) {
    this.t = opts.transports;
    this.clientName = opts.clientName ?? 'Universal Remote';
    this.pairingTimeoutMs = opts.pairingTimeoutMs ?? 45_000;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 8_000;
    this.frameHoldMs = opts.frameHoldMs ?? 3_000;
  }

  async discover(options: DiscoverOptions = {}): Promise<DiscoveredDevice[]> {
    if (!this.t.lan) return [];
    const responses = await this.t.lan.ssdpSearch(SSDP_REMOTE_RECEIVER, options.timeoutMs ?? 3_000);
    const hosts = [...new Set(responses.map((r) => r.address))];
    const found = await Promise.all(hosts.map((h) => this.probe(h).catch(() => null)));
    return found.filter((d): d is DiscoveredDevice => d !== null);
  }

  async probe(host: string): Promise<DiscoveredDevice | null> {
    let body: string;
    try {
      const res = await this.t.http.request(infoUrl(host), { timeoutMs: 2_500 });
      if (res.status !== 200) return null;
      body = await res.text();
    } catch {
      return null;
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return null;
    }
    const info = parseDeviceInfo(json);
    if (!info) return null;
    const details: Record<string, string> = {
      tokenAuth: String(info.tokenAuthSupport),
      frameTv: String(info.frameTv),
    };
    if (info.wifiMac) details.mac = info.wifiMac;
    if (info.os) details.os = info.os;
    return {
      adapterId: this.id,
      uniqueId: info.uniqueId,
      host,
      name: info.name,
      manufacturer: 'Samsung',
      ...(info.modelName ? { model: info.modelName } : {}),
      details,
    };
  }

  /** Opening the control socket without a token makes the TV show "Allow?" — the reply carries the token. */
  async pair(device: DiscoveredDevice, prompt: PairingPrompt): Promise<PairedDevice> {
    const secure = device.details.tokenAuth === 'true';
    prompt.showInstruction(`Look at ${device.name} and choose “Allow” on the TV screen.`);
    const socket = await this.openSocket(device, secure, undefined, this.pairingTimeoutMs);
    try {
      const token = await connectHandshake(socket, this.pairingTimeoutMs);
      if (secure && !token) throw new TVError('protocol', 'The TV accepted but did not issue a token.');
      return { ...device, credentials: { ...(token ? { token } : {}), secure: String(secure) } };
    } finally {
      socket.close();
    }
  }

  async connect(device: PairedDevice): Promise<DeviceSession> {
    const secure = device.credentials.secure === 'true';
    const socket = await this.openSocket(device, secure, device.credentials.token, this.connectTimeoutMs);
    try {
      const newToken = await connectHandshake(socket, this.connectTimeoutMs);
      // TVs may rotate tokens; the session exposes the latest one for re-persisting.
      const creds = { ...device.credentials, ...(newToken ? { token: newToken } : {}) };
      return new SamsungSession({ ...device, credentials: creds }, socket, this.t, this.frameHoldMs);
    } catch (e) {
      socket.close();
      if (e instanceof TVError && e.code === 'pairing_rejected') {
        throw new TVError('unauthorized', 'The TV no longer accepts this phone. Pair it again.', e);
      }
      throw e;
    }
  }

  async powerOn(device: PairedDevice): Promise<CommandOutcome> {
    const mac = device.details.mac;
    if (!mac || !this.t.lan) throw new TVError('unsupported', 'Power-on needs the TV’s MAC address and Wake-on-LAN.');
    await this.t.lan.wakeOnLan(mac);
    return { status: 'sent', detail: 'Wake-on-LAN sent. Requires “Power On with Mobile” enabled on the TV.' };
  }

  private async openSocket(device: DiscoveredDevice, secure: boolean, token: string | undefined, timeoutMs: number) {
    const url = controlUrl(device.host, { clientName: this.clientName, secure, ...(token ? { token } : {}) });
    try {
      return await this.t.socket.open(url, { timeoutMs, ...(secure ? { pinKey: `samsung:${device.uniqueId}` } : {}) });
    } catch (e) {
      throw new TVError('unreachable', `Could not reach ${device.name} at ${device.host}.`, e);
    }
  }
}

const SUPPORTED: Capability[] = [
  'navigation', 'menu', 'volume.step', 'volume.mute', 'channel.step',
  'media.playPause', 'media.transport', 'input.source', 'power.off', 'app.launch',
];
/** Runtime-dependent or not yet hardware-verified. */
const UNKNOWN: Capability[] = ['text.input', 'app.deepLink', 'state.read', 'power.on'];

export class SamsungSession implements DeviceSession {
  readonly deviceId: string;
  readonly capabilities;
  private state: ConnectionState = 'connected';
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private imeListeners = new Set<(active: boolean) => void>();
  private imeActive = false;
  private imeAnnounced = false;
  private assumedPlaying = true;
  private apps: InstalledApp[] | null = null;

  constructor(
    readonly device: PairedDevice,
    private readonly socket: MessageSocket,
    private readonly t: Transports,
    private readonly frameHoldMs: number,
  ) {
    this.deviceId = device.uniqueId;
    this.capabilities = capabilities(SUPPORTED, device.details.mac ? UNKNOWN : UNKNOWN.filter((c) => c !== 'power.on'));
    socket.onMessage((raw) => this.onEvent(parseEvent(raw)));
    socket.onClose(() => this.setState('disconnected'));
  }

  get connectionState() {
    return this.state;
  }

  /** Latest credentials (token may have rotated during connect). */
  get credentials() {
    return this.device.credentials;
  }

  onConnectionStateChange(l: (s: ConnectionState) => void) {
    this.stateListeners.add(l);
    return () => this.stateListeners.delete(l);
  }

  onTextInputRequested(l: (active: boolean) => void) {
    this.imeListeners.add(l);
    return () => this.imeListeners.delete(l);
  }

  private setState(s: ConnectionState) {
    if (this.state === s) return;
    this.state = s;
    this.stateListeners.forEach((l) => l(s));
  }

  private onEvent(e: SamsungEvent | null) {
    if (!e?.event) return;
    if (e.event === EVENTS.imeStart || e.event === EVENTS.imeEnd) {
      this.imeActive = e.event === EVENTS.imeStart;
      if (!this.imeActive) this.imeAnnounced = false;
      this.imeListeners.forEach((l) => l(this.imeActive));
    }
  }

  private send(msg: string) {
    if (this.state !== 'connected') throw new TVError('not_connected', 'TV is not connected.');
    this.socket.send(msg);
  }

  async sendKey(key: RemoteKey): Promise<CommandOutcome> {
    if (key === 'play_pause') {
      const code = this.assumedPlaying ? 'KEY_PAUSE' : 'KEY_PLAY';
      this.assumedPlaying = !this.assumedPlaying;
      this.send(keyMessage(code));
      return { status: 'sent', detail: 'Samsung has no play/pause toggle; alternating play and pause.' };
    }
    if (key === 'play') this.assumedPlaying = true;
    if (key === 'pause') this.assumedPlaying = false;
    const code = KEY_CODES[key];
    if (!code) throw new TVError('unsupported', `Key ${key} is not available on Samsung TVs.`);
    this.send(keyMessage(code));
    // The protocol does not acknowledge key presses.
    return { status: 'sent' };
  }

  async powerOff(): Promise<CommandOutcome> {
    if (this.device.details.frameTv === 'true') {
      // A short press only toggles Art Mode on The Frame.
      this.send(keyMessage('KEY_POWER', 'Press'));
      await sleep(this.frameHoldMs);
      this.send(keyMessage('KEY_POWER', 'Release'));
    } else {
      this.send(keyMessage('KEY_POWER'));
    }
    return { status: 'sent' };
  }

  async setVolume(): Promise<CommandOutcome> {
    // Planned: UPnP RenderingControl SetVolume via the SSDP-discovered LOCATION (what HA does).
    throw new TVError('unsupported', 'Setting an exact volume is not implemented for Samsung yet.');
  }

  async selectInput(): Promise<CommandOutcome> {
    // Only KEY_SOURCE/KEY_HDMI are documented; KEY_HDMI1–4 are not.
    throw new TVError('unsupported', 'Choosing a specific input is not supported on Samsung over Wi-Fi.');
  }

  async sendText(text: string, options: { submit?: boolean } = {}): Promise<CommandOutcome> {
    if (!this.imeAnnounced) {
      this.send(textReceivedMessage());
      this.imeAnnounced = true;
    }
    this.send(textMessage(text));
    if (options.submit) this.send(textEndMessage());
    return {
      status: 'sent',
      ...(this.imeActive ? {} : { detail: 'No text field appears to be open on the TV.' }),
    };
  }

  async launchApp(app: string): Promise<CommandOutcome> {
    const resolved = await this.resolveApp(app);
    if (!resolved) throw new TVError('unsupported', `${app} is not installed on this TV.`);
    const ack = this.waitAck(3_000);
    this.send(launchAppMessage(resolved.appId, launchTypeFor(resolved.appType)));
    return (await ack) ? { status: 'acknowledged' } : { status: 'sent' };
  }

  /**
   * Opening a specific video is UNVERIFIED on Samsung (neither samsungtvws nor
   * HA does it). Strategy: DIAL first (community reports), then ed.apps.launch
   * with a metaTag. Results are reported as `sent`, never `confirmed`.
   */
  async openContent(app: string, contentRef: string): Promise<CommandOutcome> {
    if (app !== 'youtube') throw new TVError('unsupported', `Deep links for ${app} are not supported on Samsung.`);
    try {
      const res = await this.t.http.request(`http://${this.device.host}:${PORT_DIAL}/ws/apps/YouTube`, {
        method: 'POST',
        body: `v=${encodeURIComponent(contentRef)}`,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        timeoutMs: 4_000,
      });
      if (res.status === 200 || res.status === 201) {
        return { status: 'acknowledged', detail: 'YouTube accepted the launch request (DIAL).' };
      }
    } catch {
      // fall through
    }
    const appId = (await this.resolveApp('youtube'))?.appId ?? FALLBACK_APP_IDS.youtube!;
    this.send(launchAppMessage(appId, 'DEEP_LINK', `v=${contentRef}`));
    return { status: 'sent', detail: 'Deep link sent; playback could not be confirmed.' };
  }

  async getState(): Promise<DeviceState> {
    try {
      const res = await this.t.http.request(`http://${this.device.host}:8001/api/v2/`, { timeoutMs: 2_500 });
      const info = parseDeviceInfo(JSON.parse(await res.text()));
      const p = info?.powerState;
      return { power: p === 'on' ? 'on' : p === 'standby' ? 'standby' : 'unknown' };
    } catch {
      return { power: 'unknown' };
    }
  }

  async disconnect(): Promise<void> {
    this.socket.close();
    this.setState('disconnected');
  }

  private waitAck(timeoutMs: number): Promise<boolean> {
    return waitForEvent(this.socket, timeoutMs, (e) => (e.event === EVENTS.appLaunch ? e.data === 200 : undefined)).catch(
      () => false,
    );
  }

  private async resolveApp(app: string): Promise<InstalledApp | null> {
    const known = app as KnownApp;
    if (!(known in APP_NAME_PATTERNS)) return { appId: app, name: app }; // already a native id
    if (this.apps === null) {
      const reply = waitForEvent(this.socket, 3_000, (e) => (e.event === EVENTS.installedApps ? parseInstalledApps(e) : undefined));
      this.send(installedAppsMessage());
      // Some 2020+ models ignore this request.
      this.apps = await reply.catch(() => []);
    }
    const match = this.apps.find((a) => APP_NAME_PATTERNS[known].test(a.name));
    if (match) return match;
    const fallback = FALLBACK_APP_IDS[known];
    return fallback && this.apps.length === 0 ? { appId: fallback, name: known } : null;
  }
}
