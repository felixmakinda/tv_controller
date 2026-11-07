/**
 * Samsung Tizen (2016+) local remote protocol.
 *
 * Samsung does not publish this protocol for third parties. Every message here
 * is taken from maintained community implementations, verified against their
 * source on 2026-11-08 (see docs/technical-research.md §2):
 *   - github.com/xchwarze/samsung-tv-ws-api (samsungtvws)
 *   - Home Assistant core: homeassistant/components/samsungtv
 * Items marked UNVERIFIED are not used by either library and must be confirmed
 * on hardware before being relied on.
 */
import type { KnownApp, RemoteKey } from '@tvc/device-contracts';
import { base64Utf8 } from './base64';

export const PORT_HTTP = 8001;
export const PORT_HTTPS = 8002;
export const PORT_DIAL = 8080; // UNVERIFIED: community reports only
export const SSDP_REMOTE_RECEIVER = 'urn:samsung.com:device:RemoteControlReceiver:1';
export const SSDP_RENDERING_CONTROL = 'urn:schemas-upnp-org:service:RenderingControl:1';

export function controlUrl(host: string, opts: { clientName: string; secure: boolean; token?: string }): string {
  const scheme = opts.secure ? 'wss' : 'ws';
  const port = opts.secure ? PORT_HTTPS : PORT_HTTP;
  let url = `${scheme}://${host}:${port}/api/v2/channels/samsung.remote.control?name=${encodeURIComponent(base64Utf8(opts.clientName))}`;
  // samsungtvws only appends the token on the secure port.
  if (opts.secure && opts.token) url += `&token=${encodeURIComponent(opts.token)}`;
  return url;
}

export const infoUrl = (host: string) => `http://${host}:${PORT_HTTP}/api/v2/`;

/** Native key codes. All CONFIRMED in samsungtvws COMMANDS.md / HA unless noted. */
export const KEY_CODES: Partial<Record<RemoteKey, string>> = {
  up: 'KEY_UP',
  down: 'KEY_DOWN',
  left: 'KEY_LEFT',
  right: 'KEY_RIGHT',
  select: 'KEY_ENTER',
  back: 'KEY_RETURN',
  home: 'KEY_HOME',
  menu: 'KEY_MENU',
  volume_up: 'KEY_VOLUP',
  volume_down: 'KEY_VOLDOWN',
  mute: 'KEY_MUTE',
  channel_up: 'KEY_CHUP',
  channel_down: 'KEY_CHDOWN',
  play: 'KEY_PLAY',
  pause: 'KEY_PAUSE',
  stop: 'KEY_STOP',
  fast_forward: 'KEY_FF',
  rewind: 'KEY_REWIND',
  source: 'KEY_SOURCE',
  power: 'KEY_POWER',
  // play_pause: no toggle key exists — the session alternates KEY_PLAY/KEY_PAUSE (as HA does).
};

export type KeyCmd = 'Click' | 'Press' | 'Release';

export function keyMessage(code: string, cmd: KeyCmd = 'Click'): string {
  return JSON.stringify({
    method: 'ms.remote.control',
    params: { Cmd: cmd, DataOfCmd: code, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
  });
}

/** Base64 text goes in `Cmd` (CONFIRMED, samsungtvws remote.py). */
export function textMessage(text: string): string {
  return JSON.stringify({
    method: 'ms.remote.control',
    params: { Cmd: base64Utf8(text), DataOfCmd: 'base64', TypeOfRemote: 'SendInputString' },
  });
}

export function textEndMessage(): string {
  return JSON.stringify({ method: 'ms.remote.control', params: { TypeOfRemote: 'SendInputEnd' } });
}

/** samsungtvws sends this once per IME session: "some TVs require this". */
export function textReceivedMessage(): string {
  return JSON.stringify({ method: 'ms.channel.emit', params: { event: 'custom.remote.textReceived', to: 'broadcast' } });
}

export type LaunchType = 'DEEP_LINK' | 'NATIVE_LAUNCH';

export function launchAppMessage(appId: string, actionType: LaunchType, metaTag = ''): string {
  return JSON.stringify({
    method: 'ms.channel.emit',
    params: { event: 'ed.apps.launch', to: 'host', data: { appId, action_type: actionType, metaTag } },
  });
}

export function installedAppsMessage(): string {
  return JSON.stringify({ method: 'ms.channel.emit', params: { event: 'ed.installedApp.get', to: 'host' } });
}

/** Event names (CONFIRMED in samsungtvws event.py / HA bridge.py). */
export const EVENTS = {
  connect: 'ms.channel.connect',
  unauthorized: 'ms.channel.unauthorized',
  timeOut: 'ms.channel.timeOut',
  error: 'ms.error',
  imeStart: 'ms.remote.imeStart',
  imeEnd: 'ms.remote.imeEnd',
  appLaunch: 'ed.apps.launch',
  installedApps: 'ed.installedApp.get',
} as const;

export interface SamsungEvent {
  event?: string;
  data?: unknown;
  from?: string;
}

export function parseEvent(raw: string): SamsungEvent | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? (v as SamsungEvent) : null;
  } catch {
    return null;
  }
}

/** Token may arrive as a number or string. */
export function tokenFromConnect(e: SamsungEvent): string | undefined {
  const t = (e.data as { token?: unknown } | undefined)?.token;
  return t === undefined || t === null ? undefined : String(t);
}

export interface InstalledApp {
  appId: string;
  name: string;
  appType?: number;
}

export function parseInstalledApps(e: SamsungEvent): InstalledApp[] {
  const list = (e.data as { data?: unknown } | undefined)?.data;
  if (!Array.isArray(list)) return [];
  return list.flatMap((a) => {
    const o = a as { appId?: unknown; name?: unknown; app_type?: unknown };
    return typeof o.appId === 'string' && typeof o.name === 'string'
      ? [{ appId: o.appId, name: o.name, ...(typeof o.app_type === 'number' ? { appType: o.app_type } : {}) }]
      : [];
  });
}

/** samsungtvws: app_type 2 → DEEP_LINK, otherwise NATIVE_LAUNCH. */
export const launchTypeFor = (appType?: number): LaunchType => (appType === 2 ? 'DEEP_LINK' : 'NATIVE_LAUNCH');

/**
 * Fallback Tizen app ids, used only when the TV doesn't answer
 * ed.installedApp.get (some 2020+ models ignore it).
 * YouTube is CONFIRMED (samsungtvws APPLICATIONS.md); others are community-listed
 * and can differ by region/model generation.
 */
export const FALLBACK_APP_IDS: Partial<Record<KnownApp, string>> = {
  youtube: '111299001912',
  netflix: '3201907018807',
  prime_video: '3201910019365',
  disney_plus: '3201901017640',
  spotify: '3201606009684',
};

export const APP_NAME_PATTERNS: Record<KnownApp, RegExp> = {
  youtube: /^youtube$/i,
  netflix: /^netflix$/i,
  prime_video: /prime video/i,
  disney_plus: /disney/i,
  spotify: /^spotify/i,
  showmax: /^showmax/i,
};

export interface SamsungDeviceInfo {
  uniqueId: string;
  name: string;
  modelName?: string;
  model?: string;
  os?: string;
  wifiMac?: string;
  tokenAuthSupport: boolean;
  frameTv: boolean;
  powerState?: string;
}

/** Parse GET :8001/api/v2/. Returns null if it isn't a Samsung TV response. */
export function parseDeviceInfo(json: unknown): SamsungDeviceInfo | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  const d = root.device as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') return null;
  const str = (v: unknown) => (typeof v === 'string' && v.length ? v : undefined);
  const uniqueId = str(d.duid) ?? str(d.udn) ?? str(root.id) ?? str(d.id) ?? str(d.wifiMac);
  if (!uniqueId) return null;
  const isSamsung = /samsung/i.test(String(root.type ?? '')) || str(d.OS) === 'Tizen' || 'TokenAuthSupport' in d;
  if (!isSamsung) return null;
  const info: SamsungDeviceInfo = {
    uniqueId,
    name: str(d.name) ?? str(root.name) ?? 'Samsung TV',
    tokenAuthSupport: String(d.TokenAuthSupport) === 'true',
    frameTv: String(d.FrameTVSupport) === 'true',
  };
  const modelName = str(d.modelName);
  const model = str(d.model);
  const os = str(d.OS);
  const wifiMac = str(d.wifiMac);
  const powerState = str(d.PowerState); // newer models only
  if (modelName) info.modelName = modelName;
  if (model) info.model = model;
  if (os) info.os = os;
  if (wifiMac) info.wifiMac = wifiMac;
  if (powerState) info.powerState = powerState;
  return info;
}
