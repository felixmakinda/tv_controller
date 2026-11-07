import { canAttempt, KEY_CAPABILITY, type Capability, type RemoteKey } from '@tvc/device-contracts';
import { getSession, useConnections, type LinkStatus } from '@/devices/connection';
import { useDevices, type SavedDevice } from '@/store/devices';

export interface ActiveDevice {
  device?: SavedDevice;
  status: LinkStatus;
  error?: string;
  can(c: Capability): boolean;
  canKey(k: RemoteKey): boolean;
  textInputActive: boolean;
}

export function useActiveDevice(): ActiveDevice {
  const device = useDevices((s) => s.devices.find((d) => d.id === s.defaultDeviceId) ?? s.devices[0]);
  const status = useConnections((s) => (device ? s.status[device.id] ?? 'idle' : 'idle'));
  const error = useConnections((s) => (device ? s.lastError[device.id] : undefined));
  const textInputActive = useConnections((s) => (device ? !!s.textInputActive[device.id] : false));
  useConnections((s) => s.version); // re-render when sessions change
  const session = device ? getSession(device.id) : undefined;
  const can = (c: Capability) => !!session && canAttempt(session.capabilities, c);
  return {
    ...(device ? { device } : {}),
    status,
    ...(error ? { error } : {}),
    can,
    canKey: (k) => can(KEY_CAPABILITY[k]),
    textInputActive,
  };
}
