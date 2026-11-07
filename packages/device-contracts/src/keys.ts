import type { Capability } from './capabilities';

/** Protocol-neutral remote keys. Adapters translate these to native key codes. */
export const REMOTE_KEYS = [
  'up',
  'down',
  'left',
  'right',
  'select',
  'back',
  'home',
  'menu',
  'volume_up',
  'volume_down',
  'mute',
  'channel_up',
  'channel_down',
  'play_pause',
  'play',
  'pause',
  'stop',
  'fast_forward',
  'rewind',
  'source',
  'power', // toggle, where the protocol has no discrete on/off
] as const;

export type RemoteKey = (typeof REMOTE_KEYS)[number];

export type NavigationDirection = 'up' | 'down' | 'left' | 'right';

/** Which capability gates each key. Used by the UI and the dispatcher. */
export const KEY_CAPABILITY: Readonly<Record<RemoteKey, Capability>> = {
  up: 'navigation',
  down: 'navigation',
  left: 'navigation',
  right: 'navigation',
  select: 'navigation',
  back: 'navigation',
  home: 'navigation',
  menu: 'menu',
  volume_up: 'volume.step',
  volume_down: 'volume.step',
  mute: 'volume.mute',
  channel_up: 'channel.step',
  channel_down: 'channel.step',
  play_pause: 'media.playPause',
  play: 'media.playPause',
  pause: 'media.playPause',
  stop: 'media.transport',
  fast_forward: 'media.transport',
  rewind: 'media.transport',
  source: 'input.source',
  power: 'power.off',
};
