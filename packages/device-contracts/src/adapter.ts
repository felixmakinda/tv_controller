import type { DeviceCapabilities } from './capabilities';
import type { RemoteKey } from './keys';

export type AdapterId = 'samsung-tizen' | 'android-tv' | 'lg-webos' | 'roku-ecp' | 'mock';

export interface DiscoveredDevice {
  adapterId: AdapterId;
  /** Stable identifier from the device (UDN / duid / serial), not the IP. */
  uniqueId: string;
  host: string;
  name: string;
  manufacturer?: string;
  model?: string;
  /** Protocol-specific facts (e.g. MAC for Wake-on-LAN, OS version). */
  details: Record<string, string>;
}

/** What the app persists. `credentials` goes to secure storage, never plain storage. */
export interface PairedDevice extends DiscoveredDevice {
  credentials: Record<string, string>;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'unauthorized';

/**
 * How far we got. Many TV protocols are fire-and-forget, so `sent` is the
 * honest best case for them; never report `confirmed` without readback.
 */
export type OutcomeStatus = 'sent' | 'acknowledged' | 'confirmed';

export interface CommandOutcome {
  status: OutcomeStatus;
  detail?: string;
}

export interface DeviceState {
  power?: 'on' | 'standby' | 'unknown';
  volume?: number;
  muted?: boolean;
  foregroundAppId?: string;
}

export interface PairingPrompt {
  /** Show "Accept the request on your TV" style instructions. */
  showInstruction(message: string): void;
  /** For PIN-based protocols (Android TV): ask the user for the code shown on the TV. */
  requestPin?(message: string): Promise<string>;
}

export interface DeviceSession {
  readonly deviceId: string;
  readonly capabilities: DeviceCapabilities;
  readonly connectionState: ConnectionState;
  onConnectionStateChange(listener: (s: ConnectionState) => void): () => void;
  /** Fires when the TV opens/closes an on-screen keyboard (where the protocol reports it). */
  onTextInputRequested?(listener: (active: boolean) => void): () => void;

  sendKey(key: RemoteKey): Promise<CommandOutcome>;
  powerOff(): Promise<CommandOutcome>;
  setVolume(level: number): Promise<CommandOutcome>;
  /** Choose a specific input, e.g. "hdmi1". */
  selectInput(input: string): Promise<CommandOutcome>;
  sendText(text: string, options?: { submit?: boolean }): Promise<CommandOutcome>;
  launchApp(appId: string): Promise<CommandOutcome>;
  /** Open content inside an app, e.g. a YouTube video. */
  openContent(appId: string, contentRef: string): Promise<CommandOutcome>;
  getState(): Promise<DeviceState>;
  disconnect(): Promise<void>;
}

export interface DiscoverOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TVDeviceAdapter {
  readonly id: AdapterId;
  readonly displayName: string;

  discover(options?: DiscoverOptions): Promise<DiscoveredDevice[]>;
  /** Manual-IP fallback: identify the device at `host`, or null if it is not this protocol. */
  probe(host: string): Promise<DiscoveredDevice | null>;
  /** Run the protocol's pairing flow and return credentials to persist. */
  pair(device: DiscoveredDevice, prompt: PairingPrompt): Promise<PairedDevice>;
  connect(device: PairedDevice): Promise<DeviceSession>;
  /**
   * Power-on usually cannot go through the control channel (the TV is off),
   * so it is separate from the session. Return null outcome if unsupported.
   */
  powerOn(device: PairedDevice): Promise<CommandOutcome>;
}

/** Well-known app identifiers the command engine uses; adapters map them to native ids. */
export type KnownApp = 'youtube' | 'netflix' | 'prime_video' | 'disney_plus' | 'spotify' | 'showmax';
