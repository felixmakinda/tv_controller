import { AppState } from 'react-native';
import { isTVError, type DeviceSession } from '@tvc/device-contracts';
import { create } from 'zustand';
import { loadPaired, saveCredentials, useDevices, type SavedDevice } from '@/store/devices';
import { getAdapter } from './registry';

export type LinkStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'unauthorized';

interface ConnectionStore {
  status: Record<string, LinkStatus>;
  lastError: Record<string, string | undefined>;
  /** Bumps when a session object changes, so hooks re-read capabilities. */
  version: number;
  textInputActive: Record<string, boolean>;
}

export const useConnections = create<ConnectionStore>(() => ({ status: {}, lastError: {}, version: 0, textInputActive: {} }));

const sessions = new Map<string, DeviceSession>();
const retries = new Map<string, { attempt: number; timer?: ReturnType<typeof setTimeout> }>();
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

function setStatus(id: string, status: LinkStatus, error?: string) {
  useConnections.setState((s) => ({
    status: { ...s.status, [id]: status },
    lastError: { ...s.lastError, [id]: error },
    version: s.version + 1,
  }));
}

export function getSession(id: string): DeviceSession | undefined {
  return sessions.get(id);
}

export async function connectDevice(device: SavedDevice): Promise<void> {
  const current = sessions.get(device.id);
  if (current?.connectionState === 'connected') return;
  const r = retries.get(device.id);
  if (r?.timer) clearTimeout(r.timer);

  setStatus(device.id, r && r.attempt > 0 ? 'reconnecting' : 'connecting');
  try {
    const paired = await loadPaired(device);
    const session = await getAdapter(device.adapterId).connect(paired);
    sessions.set(device.id, session);
    retries.delete(device.id);

    // Samsung may rotate tokens on connect; persist the latest.
    const latest = (session as { credentials?: Record<string, string> }).credentials;
    if (latest && JSON.stringify(latest) !== JSON.stringify(paired.credentials)) {
      await saveCredentials(device.id, latest);
    }

    session.onConnectionStateChange((s) => {
      if (s === 'disconnected') {
        sessions.delete(device.id);
        scheduleReconnect(device.id);
      }
    });
    session.onTextInputRequested?.((active) =>
      useConnections.setState((st) => ({ textInputActive: { ...st.textInputActive, [device.id]: active } })),
    );
    setStatus(device.id, 'connected');
  } catch (e) {
    if (isTVError(e) && e.code === 'unauthorized') {
      setStatus(device.id, 'unauthorized', e.message);
      return; // needs re-pairing; don't hammer the TV
    }
    setStatus(device.id, 'offline', e instanceof Error ? e.message : String(e));
    scheduleReconnect(device.id);
  }
}

function scheduleReconnect(id: string) {
  if (AppState.currentState !== 'active') {
    setStatus(id, 'offline');
    return; // resumed on foreground
  }
  const r = retries.get(id) ?? { attempt: 0 };
  const delay = BACKOFF_MS[Math.min(r.attempt, BACKOFF_MS.length - 1)]!;
  r.attempt += 1;
  r.timer = setTimeout(() => {
    const d = useDevices.getState().devices.find((x) => x.id === id);
    if (d) void connectDevice(d);
  }, delay);
  retries.set(id, r);
  if (useConnections.getState().status[id] !== 'offline') setStatus(id, 'reconnecting');
}

export async function disconnectDevice(id: string) {
  const r = retries.get(id);
  if (r?.timer) clearTimeout(r.timer);
  retries.delete(id);
  const s = sessions.get(id);
  sessions.delete(id);
  await s?.disconnect();
  setStatus(id, 'idle');
}

/** Connect all saved devices; re-run when the app returns to the foreground or the network changes. */
export function startConnectionManager() {
  const connectAll = () => useDevices.getState().devices.forEach((d) => void connectDevice(d));
  connectAll();
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      retries.forEach((r) => (r.attempt = 0));
      connectAll();
    }
  });
  const unsubDevices = useDevices.subscribe((s, prev) => {
    const added = s.devices.filter((d) => !prev.devices.some((p) => p.id === d.id));
    added.forEach((d) => void connectDevice(d));
    prev.devices.filter((p) => !s.devices.some((d) => d.id === p.id)).forEach((p) => void disconnectDevice(p.id));
  });
  return () => {
    sub.remove();
    unsubDevices();
  };
}
