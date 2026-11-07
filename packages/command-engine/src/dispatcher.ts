import { CommandIntentSchema, type CommandIntent } from '@tvc/command-schemas';
import {
  canAttempt,
  isTVError,
  KEY_CAPABILITY,
  type Capability,
  type CommandOutcome,
  type DeviceSession,
  type DeviceState,
} from '@tvc/device-contracts';
import { resolveTargets, type DeviceRef, type TargetResolution } from './devices';

export interface MediaResult {
  id: string; // e.g. YouTube video id
  title: string;
  channel?: string;
  thumbnailUrl?: string;
}

/** Search is separate from playback: the YouTube Data API can search but cannot control a TV. */
export interface MediaSearchProvider {
  readonly app: 'youtube';
  search(query: string, options?: { mode?: 'video' | 'music'; limit?: number }): Promise<MediaResult[]>;
}

export interface DispatchContext {
  devices: readonly DeviceRef[];
  defaultDeviceId?: string;
  /** Connected session for a device, or undefined if offline. */
  getSession(deviceId: string): DeviceSession | undefined;
  /** Power-on is adapter-level (the TV is not reachable over its control channel). */
  powerOn(deviceId: string): Promise<CommandOutcome>;
  media?: MediaSearchProvider;
  policy?: ConfirmationPolicy;
  /** Delay between repeated key presses (ms). */
  repeatDelayMs?: number;
}

export interface ConfirmationPolicy {
  confirmPowerOff: boolean;
  confirmMultiDevice: boolean;
}

export const DEFAULT_POLICY: ConfirmationPolicy = { confirmPowerOff: true, confirmMultiDevice: true };

export type DeviceStatus = 'sent' | 'acknowledged' | 'confirmed' | 'failed' | 'unsupported' | 'offline';

export interface DeviceReport {
  deviceId: string;
  status: DeviceStatus;
  detail?: string;
  state?: DeviceState;
}

export type StepName = 'resolve_device' | 'search' | 'select_content' | 'send_command';
export interface StepReport {
  step: StepName;
  status: 'ok' | 'failed' | 'skipped';
  detail?: string;
}

export type ExecutionReport =
  | { outcome: 'needs_confirmation'; intent: CommandIntent; deviceIds: string[]; reason: string }
  | { outcome: 'needs_device'; intent: CommandIntent; resolution: Extract<TargetResolution, { ok: false }> }
  | { outcome: 'search_results'; intent: CommandIntent; results: MediaResult[]; steps: StepReport[] }
  | {
      outcome: 'completed' | 'partial' | 'failed';
      intent: CommandIntent;
      devices: DeviceReport[];
      steps: StepReport[];
      media?: MediaResult;
      /** Something the UI should offer next, e.g. the phone keyboard pre-filled with a query. */
      followUp?: { kind: 'type_text'; text: string };
    };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function requiredCapability(intent: CommandIntent): Capability | null {
  switch (intent.intent) {
    case 'remote_key': return KEY_CAPABILITY[intent.key];
    case 'power': return intent.action === 'on' ? 'power.on' : 'power.off';
    case 'volume_set': return 'volume.set';
    case 'volume_change': return 'volume.step';
    case 'launch_app': return 'app.launch';
    case 'select_input': return 'input.select';
    case 'type_text': return 'text.input';
    case 'play_media': return 'app.deepLink';
    case 'query_state': return 'state.read';
    case 'search': return null;
  }
}

export function confirmationReason(intent: CommandIntent, targetCount: number, policy: ConfirmationPolicy): string | null {
  if (policy.confirmMultiDevice && targetCount > 1) return `This will affect ${targetCount} TVs.`;
  if (policy.confirmPowerOff && intent.intent === 'power' && intent.action === 'off') return 'Turn the TV off?';
  return null;
}

/**
 * The single authorised path from an intent to a device. Validated intents in,
 * honest per-device reports out.
 */
export async function dispatch(
  intent: CommandIntent,
  ctx: DispatchContext,
  options: { confirmed?: boolean } = {},
): Promise<ExecutionReport> {
  const steps: StepReport[] = [];

  const resolution = resolveTargets(intent.device, ctx.devices, ctx.defaultDeviceId);
  if (!resolution.ok) return { outcome: 'needs_device', intent, resolution };
  const targets = resolution.deviceIds;
  steps.push({ step: 'resolve_device', status: 'ok' });

  const reason = confirmationReason(intent, targets.length, ctx.policy ?? DEFAULT_POLICY);
  if (reason && !options.confirmed) return { outcome: 'needs_confirmation', intent, deviceIds: targets, reason };

  // No searchable catalogue for this app — Netflix (no public API), or YouTube
  // without an API key: open the app, then hand the query to the phone keyboard
  // so the user only has to focus the TV's search box. Nothing is claimed
  // beyond "app opened".
  if (intent.intent === 'search' || intent.intent === 'play_media') {
    const app = intent.app ?? 'youtube';
    if (!ctx.media || ctx.media.app !== app) {
      const launch = CommandIntentSchema.parse({ intent: 'launch_app', app, device: intent.device });
      const reports = await Promise.all(targets.map((id) => runOnDevice(launch, id, ctx, undefined)));
      steps.push({ step: 'send_command', status: reports.some((r) => isSuccess(r.status)) ? 'ok' : 'failed', detail: `Open ${app}` });
      const r = finish(intent, steps, reports);
      return r.outcome === 'failed' ? r : { ...r, followUp: { kind: 'type_text', text: intent.query } };
    }
  }

  // Search returns results to the user instead of acting on the TV.
  if (intent.intent === 'search' && ctx.media) {
    try {
      const results = await ctx.media.search(intent.query, { limit: 10 });
      steps.push({ step: 'search', status: 'ok', detail: `${results.length} results` });
      return { outcome: 'search_results', intent, results, steps };
    } catch (e) {
      steps.push({ step: 'search', status: 'failed', detail: errMsg(e) });
      return finish(intent, steps, []);
    }
  }

  // Resolve media once, before touching any device.
  let media: MediaResult | undefined;
  if (intent.intent === 'play_media' && ctx.media) {
    try {
      const results = await ctx.media.search(intent.query, { mode: intent.mode, limit: 5 });
      steps.push({ step: 'search', status: 'ok', detail: `${results.length} results` });
      media = results[0];
    } catch (e) {
      steps.push({ step: 'search', status: 'failed', detail: errMsg(e) });
      return finish(intent, steps, []);
    }
    if (!media) {
      steps.push({ step: 'select_content', status: 'failed', detail: `Nothing found for “${intent.query}”.` });
      return finish(intent, steps, []);
    }
    steps.push({ step: 'select_content', status: 'ok', detail: media.title });
  }

  const reports = await Promise.all(targets.map((id) => runOnDevice(intent, id, ctx, media)));
  steps.push({
    step: 'send_command',
    status: reports.some((r) => isSuccess(r.status)) ? 'ok' : 'failed',
  });
  return finish(intent, steps, reports, media);
}

function isSuccess(s: DeviceStatus) {
  return s === 'sent' || s === 'acknowledged' || s === 'confirmed';
}

type DeviceRun = Extract<ExecutionReport, { devices: DeviceReport[] }>;

function finish(intent: CommandIntent, steps: StepReport[], devices: DeviceReport[], media?: MediaResult): DeviceRun {
  const ok = devices.filter((d) => isSuccess(d.status)).length;
  const failedStep = steps.some((s) => s.status === 'failed');
  const outcome = ok === 0 || (devices.length === 0 && failedStep) ? 'failed' : ok === devices.length ? 'completed' : 'partial';
  return { outcome, intent, devices, steps, ...(media ? { media } : {}) };
}

async function runOnDevice(
  intent: CommandIntent,
  deviceId: string,
  ctx: DispatchContext,
  media: MediaResult | undefined,
): Promise<DeviceReport> {
  const fromOutcome = (o: CommandOutcome): DeviceReport => ({ deviceId, status: o.status, ...(o.detail ? { detail: o.detail } : {}) });

  try {
    if (intent.intent === 'power' && intent.action === 'on') {
      return fromOutcome(await ctx.powerOn(deviceId));
    }

    const session = ctx.getSession(deviceId);
    if (!session || session.connectionState !== 'connected') {
      return { deviceId, status: 'offline', detail: 'TV is not connected.' };
    }
    const cap = requiredCapability(intent);
    if (cap && !canAttempt(session.capabilities, cap)) {
      return { deviceId, status: 'unsupported', detail: `This TV does not support ${cap}.` };
    }

    switch (intent.intent) {
      case 'remote_key': {
        let last: CommandOutcome = { status: 'sent' };
        for (let i = 0; i < intent.repeat; i++) {
          if (i > 0) await sleep(ctx.repeatDelayMs ?? 150);
          last = await session.sendKey(intent.key);
        }
        return fromOutcome(last);
      }
      case 'volume_change': {
        let last: CommandOutcome = { status: 'sent' };
        for (let i = 0; i < intent.steps; i++) {
          if (i > 0) await sleep(ctx.repeatDelayMs ?? 150);
          last = await session.sendKey(intent.direction === 'up' ? 'volume_up' : 'volume_down');
        }
        return fromOutcome(last);
      }
      case 'power': return fromOutcome(await session.powerOff());
      case 'volume_set': return fromOutcome(await session.setVolume(intent.level));
      case 'launch_app': return fromOutcome(await session.launchApp(intent.app));
      case 'select_input': return fromOutcome(await session.selectInput(intent.input));
      case 'type_text': return fromOutcome(await session.sendText(intent.text));
      case 'play_media': return fromOutcome(await session.openContent(intent.app, media!.id));
      case 'query_state': return { deviceId, status: 'confirmed', state: await session.getState() };
      case 'search': return { deviceId, status: 'unsupported' }; // handled earlier
    }
  } catch (e) {
    if (isTVError(e) && e.code === 'unsupported') return { deviceId, status: 'unsupported', detail: e.message };
    if (isTVError(e) && e.code === 'not_connected') return { deviceId, status: 'offline', detail: e.message };
    return { deviceId, status: 'failed', detail: errMsg(e) };
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
