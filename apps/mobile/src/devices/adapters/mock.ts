import {
  capabilities,
  type CommandOutcome,
  type ConnectionState,
  type DeviceSession,
  type DeviceState,
  type DiscoveredDevice,
  type PairedDevice,
  type RemoteKey,
  type TVDeviceAdapter,
} from '@tvc/device-contracts';

/**
 * SIMULATED device for UI development without hardware. It is always labelled
 * "Demo" in the UI and never claims to control a real TV.
 */
export const MOCK_DEVICE: DiscoveredDevice = {
  adapterId: 'mock',
  uniqueId: 'demo-tv',
  host: 'simulated',
  name: 'Demo TV',
  manufacturer: 'Simulated',
  model: 'Demo',
  details: {},
};

export type MockLogEntry = { at: number; action: string };
const log: MockLogEntry[] = [];
const logListeners = new Set<() => void>();
let logVersion = 0;
export const mockLog = {
  entries: () => log,
  /** Changes on every new entry (snapshot for useSyncExternalStore). */
  version: () => logVersion,
  subscribe(l: () => void) {
    logListeners.add(l);
    return () => {
      logListeners.delete(l);
    };
  },
};
function record(action: string) {
  log.unshift({ at: Date.now(), action });
  log.length = Math.min(log.length, 30);
  logVersion += 1;
  logListeners.forEach((l) => l());
}

class MockSession implements DeviceSession {
  readonly deviceId = MOCK_DEVICE.uniqueId;
  readonly capabilities = capabilities(
    ['power.on', 'power.off', 'volume.step', 'volume.set', 'volume.mute', 'channel.step', 'navigation', 'menu',
      'media.playPause', 'media.transport', 'input.source', 'input.select', 'text.input', 'app.launch', 'app.deepLink', 'state.read'],
  );
  connectionState: ConnectionState = 'connected';
  private state: DeviceState = { power: 'on', volume: 15, muted: false, foregroundAppId: 'home' };
  private listeners = new Set<(s: ConnectionState) => void>();

  onConnectionStateChange(l: (s: ConnectionState) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private ok(action: string): CommandOutcome {
    record(action);
    return { status: 'confirmed', detail: 'Simulated' };
  }
  async sendKey(key: RemoteKey) {
    if (key === 'volume_up') this.state.volume = Math.min(100, (this.state.volume ?? 0) + 1);
    if (key === 'volume_down') this.state.volume = Math.max(0, (this.state.volume ?? 0) - 1);
    if (key === 'mute') this.state.muted = !this.state.muted;
    return this.ok(`key ${key}`);
  }
  async powerOff() { this.state.power = 'standby'; return this.ok('power off'); }
  async setVolume(level: number) { this.state.volume = level; return this.ok(`volume ${level}`); }
  async selectInput(input: string) { return this.ok(`input ${input}`); }
  async sendText(text: string) { return this.ok(`text “${text}”`); }
  async launchApp(app: string) { this.state.foregroundAppId = app; return this.ok(`launch ${app}`); }
  async openContent(app: string, ref: string) { this.state.foregroundAppId = app; return this.ok(`open ${app} ${ref}`); }
  async getState() { return { ...this.state }; }
  async disconnect() {
    this.connectionState = 'disconnected';
    this.listeners.forEach((l) => l('disconnected'));
  }
}

export class MockAdapter implements TVDeviceAdapter {
  readonly id = 'mock' as const;
  readonly displayName = 'Demo (simulated)';
  async discover() { return [MOCK_DEVICE]; }
  async probe() { return null; }
  async pair(device: DiscoveredDevice): Promise<PairedDevice> { return { ...device, credentials: {} }; }
  async connect(): Promise<DeviceSession> { return new MockSession(); }
  async powerOn(): Promise<CommandOutcome> { record('power on'); return { status: 'confirmed', detail: 'Simulated' }; }
}
