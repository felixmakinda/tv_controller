import Storage from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';
import { createJSONStorage } from 'zustand/middleware';

/** Non-secret app state: SQLite-backed key-value store. */
export const sqliteStorage = createJSONStorage(() => ({
  getItem: (k: string) => Storage.getItem(k),
  setItem: (k: string, v: string) => Storage.setItem(k, v),
  removeItem: (k: string) => Storage.removeItem(k),
}));

/**
 * Secrets (TV pairing tokens, API keys) live only in the platform keystore.
 * SecureStore keys allow [A-Za-z0-9._-], so ids are sanitised.
 */
const key = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export const secrets = {
  async get<T>(k: string): Promise<T | null> {
    const v = await SecureStore.getItemAsync(key(k));
    return v ? (JSON.parse(v) as T) : null;
  },
  async set(k: string, v: unknown) {
    await SecureStore.setItemAsync(key(k), JSON.stringify(v));
  },
  async remove(k: string) {
    await SecureStore.deleteItemAsync(key(k));
  },
};
