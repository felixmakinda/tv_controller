import type { DeviceSelector } from '@tvc/command-schemas';

export interface DeviceRef {
  id: string;
  name: string;
  room?: string;
}

export type TargetResolution =
  | { ok: true; deviceIds: string[] }
  | { ok: false; reason: 'no_devices' | 'no_default' | 'no_match' | 'ambiguous'; candidates: DeviceRef[] };

const clean = (s: string) =>
  s.toLowerCase().replace(/\b(the|my|tv|television|screen)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function resolveTargets(
  selector: DeviceSelector,
  devices: readonly DeviceRef[],
  defaultId?: string,
): TargetResolution {
  if (devices.length === 0) return { ok: false, reason: 'no_devices', candidates: [] };

  switch (selector.type) {
    case 'all':
      return { ok: true, deviceIds: devices.map((d) => d.id) };
    case 'default': {
      if (defaultId && devices.some((d) => d.id === defaultId)) return { ok: true, deviceIds: [defaultId] };
      if (devices.length === 1) return { ok: true, deviceIds: [devices[0]!.id] };
      return { ok: false, reason: 'no_default', candidates: [...devices] };
    }
    case 'named':
    case 'room': {
      const want = clean(selector.value);
      const byName = devices.filter((d) => clean(d.name) === want);
      const byRoom = devices.filter((d) => d.room && clean(d.room) === want);
      const exact = byName.length ? byName : byRoom;
      if (exact.length === 1) return { ok: true, deviceIds: [exact[0]!.id] };
      if (exact.length > 1) return { ok: false, reason: 'ambiguous', candidates: exact };
      const partial = devices.filter(
        (d) => (want && clean(d.name).includes(want)) || (d.room && want && clean(d.room).includes(want)),
      );
      if (partial.length === 1) return { ok: true, deviceIds: [partial[0]!.id] };
      return { ok: false, reason: partial.length ? 'ambiguous' : 'no_match', candidates: partial };
    }
  }
}
