import type { AdapterId, DiscoveredDevice, PairedDevice } from '@tvc/device-contracts';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { secrets, sqliteStorage } from './storage';
import { forgetCertificatePin } from '@/connectivity/transports';

export interface SavedDevice {
  /** `${adapterId}:${uniqueId}` */
  id: string;
  adapterId: AdapterId;
  uniqueId: string;
  host: string;
  name: string;
  room?: string;
  manufacturer?: string;
  model?: string;
  details: Record<string, string>;
  addedAt: number;
}

export const deviceKey = (d: Pick<DiscoveredDevice, 'adapterId' | 'uniqueId'>) => `${d.adapterId}:${d.uniqueId}`;
const credKey = (id: string) => `cred.${id}`;

interface DevicesState {
  devices: SavedDevice[];
  defaultDeviceId?: string;
  add(paired: PairedDevice, opts?: { name?: string; room?: string }): Promise<SavedDevice>;
  update(id: string, patch: Partial<Pick<SavedDevice, 'name' | 'room' | 'host'>>): void;
  remove(id: string): Promise<void>;
  setDefault(id: string): void;
}

export const useDevices = create<DevicesState>()(
  persist(
    (set, get) => ({
      devices: [],
      async add(paired, opts = {}) {
        const { credentials, ...rest } = paired;
        const id = deviceKey(paired);
        await secrets.set(credKey(id), credentials);
        const saved: SavedDevice = {
          ...rest,
          id,
          name: opts.name?.trim() || paired.name,
          ...(opts.room ? { room: opts.room } : {}),
          addedAt: Date.now(),
        };
        set((s) => ({
          devices: [...s.devices.filter((d) => d.id !== id), saved],
          defaultDeviceId: s.defaultDeviceId ?? id,
        }));
        return saved;
      },
      update(id, patch) {
        set((s) => ({ devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
      },
      async remove(id) {
        const d = get().devices.find((x) => x.id === id);
        await secrets.remove(credKey(id));
        if (d) forgetCertificatePin(`samsung:${d.uniqueId}`);
        set((s) => {
          const devices = s.devices.filter((x) => x.id !== id);
          return { devices, defaultDeviceId: s.defaultDeviceId === id ? devices[0]?.id : s.defaultDeviceId };
        });
      },
      setDefault(id) {
        set({ defaultDeviceId: id });
      },
    }),
    {
      name: 'devices',
      storage: sqliteStorage,
      version: 1,
      partialize: (s) => ({ devices: s.devices, defaultDeviceId: s.defaultDeviceId }),
    },
  ),
);

export async function loadPaired(d: SavedDevice): Promise<PairedDevice> {
  const credentials = (await secrets.get<Record<string, string>>(credKey(d.id))) ?? {};
  const { id: _id, room: _room, addedAt: _a, ...rest } = d;
  return { ...rest, credentials };
}

export async function saveCredentials(id: string, credentials: Record<string, string>) {
  await secrets.set(credKey(id), credentials);
}
