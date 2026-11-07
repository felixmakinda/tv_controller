import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { dispatch, parseLocal, type ExecutionReport } from '@tvc/command-engine';
import { CommandIntentSchema, type CommandIntent } from '@tvc/command-schemas';
import type { RemoteKey } from '@tvc/device-contracts';
import { getAdapter } from '@/devices/registry';
import { getSession } from '@/devices/connection';
import { useDevices } from '@/store/devices';
import { useSettings } from '@/store/settings';
import { loadPaired } from '@/store/devices';
import { youtubeSearch } from '@/services/youtube';

export type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; text?: string; intent?: CommandIntent }
  | { phase: 'done'; text?: string; report: ExecutionReport }
  | { phase: 'not_understood'; text: string; fallback?: CommandIntent };

function context() {
  const { devices, defaultDeviceId } = useDevices.getState();
  const s = useSettings.getState();
  return {
    devices: devices.map((d) => ({ id: d.id, name: d.name, ...(d.room ? { room: d.room } : {}) })),
    ...(defaultDeviceId ? { defaultDeviceId } : {}),
    getSession,
    async powerOn(id: string) {
      const d = devices.find((x) => x.id === id);
      if (!d) throw new Error('Unknown device');
      return getAdapter(d.adapterId).powerOn(await loadPaired(d));
    },
    media: youtubeSearch,
    policy: { confirmPowerOff: s.confirmPowerOff, confirmMultiDevice: s.confirmMultiDevice },
  };
}

/** Execute a validated intent through the dispatcher — the only path to a TV. */
export async function runIntent(intent: CommandIntent, confirmed = false): Promise<ExecutionReport> {
  return dispatch(intent, context(), { confirmed });
}

/** Fast path for remote buttons. */
export async function pressKey(key: RemoteKey): Promise<ExecutionReport> {
  void Haptics.selectionAsync();
  return runIntent(CommandIntentSchema.parse({ intent: 'remote_key', key }));
}

export function useCommandRunner() {
  const [state, setState] = useState<RunState>({ phase: 'idle' });

  const runText = useCallback(async (text: string) => {
    const parsed = parseLocal(text, text);
    if (parsed.kind === 'empty') return setState({ phase: 'idle' });
    if (parsed.kind === 'needs_ai') {
      // Phase 3 will route this to the optional LLM interpreter. Until then, be explicit.
      return setState({ phase: 'not_understood', text, ...(parsed.fallback ? { fallback: parsed.fallback } : {}) });
    }
    setState({ phase: 'running', text, intent: parsed.intent });
    const report = await runIntent(parsed.intent);
    void Haptics.notificationAsync(
      report.outcome === 'failed' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
    );
    setState({ phase: 'done', text, report });
  }, []);

  const runParsed = useCallback(async (intent: CommandIntent, confirmed = false, text?: string) => {
    setState({ phase: 'running', ...(text ? { text } : {}), intent });
    const report = await runIntent(intent, confirmed);
    setState({ phase: 'done', ...(text ? { text } : {}), report });
  }, []);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, runText, runParsed, reset };
}
