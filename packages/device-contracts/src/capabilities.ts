/**
 * Capabilities are declared explicitly per device. The UI and the command
 * dispatcher consult these before invoking anything, so an unsupported
 * operation is hidden/disabled instead of silently failing.
 */
export const CAPABILITIES = [
  'power.on',
  'power.off',
  'volume.step',
  'volume.set',
  'volume.mute',
  'channel.step',
  'navigation',
  'menu',
  'media.playPause',
  'media.transport', // fast-forward / rewind / stop
  'input.source', // cycle source key
  'input.select', // choose a specific input, e.g. HDMI 1
  'text.input',
  'app.launch',
  'app.deepLink', // launch an app directly at content (e.g. a YouTube video id)
  'state.read', // power / volume / foreground app readback
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * `unknown` is a first-class value: many TVs only reveal support at runtime
 * (e.g. Samsung text input only works while an IME field is focused).
 */
export type CapabilitySupport = 'supported' | 'unsupported' | 'unknown';

export type DeviceCapabilities = Readonly<Record<Capability, CapabilitySupport>>;

export function capabilities(
  supported: readonly Capability[],
  unknown: readonly Capability[] = [],
): DeviceCapabilities {
  const out = {} as Record<Capability, CapabilitySupport>;
  for (const c of CAPABILITIES) {
    out[c] = supported.includes(c) ? 'supported' : unknown.includes(c) ? 'unknown' : 'unsupported';
  }
  return out;
}

/** Treat `unknown` as "try it" — the adapter will report a real failure. */
export function canAttempt(caps: DeviceCapabilities, c: Capability): boolean {
  return caps[c] !== 'unsupported';
}
