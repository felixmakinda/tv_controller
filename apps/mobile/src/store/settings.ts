import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sqliteStorage } from './storage';

export interface SettingsState {
  theme: 'system' | 'dark' | 'light';
  voiceLanguage: 'en-US' | 'en-GB' | 'en-KE' | 'sw-KE';
  /** Prefer on-device speech recognition (no audio leaves the phone, where supported). */
  onDeviceSpeech: boolean;
  confirmPowerOff: boolean;
  confirmMultiDevice: boolean;
  set<K extends keyof Omit<SettingsState, 'set'>>(key: K, value: SettingsState[K]): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      voiceLanguage: 'en-US',
      onDeviceSpeech: true,
      confirmPowerOff: true,
      confirmMultiDevice: true,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
    }),
    { name: 'settings', storage: sqliteStorage, version: 1 },
  ),
);
