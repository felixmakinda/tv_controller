import { z } from 'zod';

/**
 * Structured intents. Both the local parser and any LLM interpreter MUST
 * produce values that pass `CommandIntentSchema`. Nothing else reaches the
 * dispatcher, so an LLM can only ever request these operations.
 */

export const DeviceSelectorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('default') }),
  z.object({ type: z.literal('named'), value: z.string().min(1).max(80) }),
  z.object({ type: z.literal('room'), value: z.string().min(1).max(80) }),
  z.object({ type: z.literal('all') }),
]);
export type DeviceSelector = z.infer<typeof DeviceSelectorSchema>;

export const RemoteKeySchema = z.enum([
  'up', 'down', 'left', 'right', 'select', 'back', 'home', 'menu',
  'volume_up', 'volume_down', 'mute', 'channel_up', 'channel_down',
  'play_pause', 'play', 'pause', 'stop', 'fast_forward', 'rewind', 'source', 'power',
]);

export const KnownAppSchema = z.enum(['youtube', 'netflix', 'prime_video', 'disney_plus', 'spotify', 'showmax']);

const selector = { device: DeviceSelectorSchema.default({ type: 'default' }) };

export const CommandIntentSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('remote_key'),
    key: RemoteKeySchema,
    repeat: z.number().int().min(1).max(20).default(1),
    ...selector,
  }),
  z.object({ intent: z.literal('power'), action: z.enum(['on', 'off']), ...selector }),
  z.object({ intent: z.literal('volume_set'), level: z.number().int().min(0).max(100), ...selector }),
  z.object({
    intent: z.literal('volume_change'),
    direction: z.enum(['up', 'down']),
    steps: z.number().int().min(1).max(20).default(3),
    ...selector,
  }),
  z.object({ intent: z.literal('launch_app'), app: KnownAppSchema, ...selector }),
  z.object({
    intent: z.literal('select_input'),
    input: z.string().regex(/^(hdmi[1-4]|av|tv)$/),
    ...selector,
  }),
  z.object({ intent: z.literal('type_text'), text: z.string().min(1).max(500), ...selector }),
  z.object({
    intent: z.literal('search'),
    query: z.string().min(1).max(200),
    app: KnownAppSchema.optional(),
    ...selector,
  }),
  z.object({
    intent: z.literal('play_media'),
    query: z.string().min(1).max(200),
    app: KnownAppSchema.default('youtube'),
    mode: z.enum(['video', 'music']).optional(),
    ...selector,
  }),
  z.object({ intent: z.literal('query_state'), ...selector }),
]);

export type CommandIntent = z.infer<typeof CommandIntentSchema>;
export type IntentKind = CommandIntent['intent'];

export type ParseResult =
  | { ok: true; intent: CommandIntent }
  | { ok: false; error: string };

/** Validate untrusted (e.g. LLM) output. */
export function validateIntent(value: unknown): ParseResult {
  const r = CommandIntentSchema.safeParse(value);
  return r.success ? { ok: true, intent: r.data } : { ok: false, error: z.prettifyError(r.error) };
}
