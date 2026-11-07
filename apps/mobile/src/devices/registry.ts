import type { AdapterId, TVDeviceAdapter } from '@tvc/device-contracts';
import { SamsungTizenAdapter } from '@tvc/samsung-protocol';
import { transports } from '@/connectivity/transports';
import { MockAdapter } from './adapters/mock';

/**
 * Adapters available in this build. Adding a manufacturer = adding an entry
 * here; the command engine and UI do not change.
 */
const adapters: Partial<Record<AdapterId, TVDeviceAdapter>> = {
  'samsung-tizen': new SamsungTizenAdapter({ transports, clientName: 'Universal Remote' }),
  mock: new MockAdapter(),
};

export function getAdapter(id: AdapterId): TVDeviceAdapter {
  const a = adapters[id];
  if (!a) throw new Error(`No adapter for ${id}`);
  return a;
}

/** Real (non-simulated) adapters, in discovery order. */
export const realAdapters = (Object.values(adapters) as TVDeviceAdapter[]).filter((a) => a.id !== 'mock');
