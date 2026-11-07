import { CommandIntentSchema, type CommandIntent, type DeviceSelector } from '@tvc/command-schemas';
import type { KnownApp } from '@tvc/device-contracts';
import { NUMBER_PATTERN, parseNumber } from './numbers';

/**
 * Local, deterministic English parser. Handles the common commands with no
 * network and no AI. Anything it cannot handle confidently is returned as
 * `needs_ai` so an optional LLM interpreter can try; when AI is unavailable
 * the caller can offer `fallback` (usually a plain search) instead.
 */
export type LocalParse =
  | { kind: 'intent'; intent: CommandIntent; normalized: string }
  | { kind: 'needs_ai'; normalized: string; fallback?: CommandIntent }
  | { kind: 'empty' };

const APP_ALIASES: ReadonlyArray<[RegExp, KnownApp]> = [
  [/^(you ?tube|yt)$/, 'youtube'],
  [/^netflix$/, 'netflix'],
  [/^(amazon )?prime( video)?$/, 'prime_video'],
  [/^disney( plus|\+)?$/, 'disney_plus'],
  [/^spotify$/, 'spotify'],
  [/^showmax$/, 'showmax'],
];

export function matchApp(phrase: string): KnownApp | null {
  const p = phrase.trim().replace(/^the /, '').replace(/ app$/, '');
  for (const [re, app] of APP_ALIASES) if (re.test(p)) return app;
  return null;
}

const ROOM_WORDS = '(?:living ?room|lounge|sitting ?room|bedroom|master bedroom|kids room|guest ?room|kitchen|office|dining ?room|family ?room)';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(hey |ok |okay )?(remote |tv )?/, '')
    .replace(/^(actually|now|and|then|so)\s+/, '')
    .replace(/^(please |can you |could you |would you |i want you to |i'd like to |let's )+/, '')
    .replace(/\s+please$/, '')
    .trim();
}

/** Interpret a bare device phrase: "", "it", "the tv", "all tvs", "the bedroom tv", "the kitchen". */
function phraseToSelector(phrase: string | undefined): DeviceSelector | null {
  const p = (phrase ?? '').trim().replace(/^(?:the|my) /, '');
  if (p === '' || p === 'it' || /^(?:tv|television)$/.test(p)) return { type: 'default' };
  if (/^(?:all|every|each)(?: of)?(?: the)? (?:tvs?|televisions?|screens)(?: in the house)?$/.test(p)) return { type: 'all' };
  if (new RegExp(`^${ROOM_WORDS}$`).test(p)) return { type: 'room', value: p };
  const named = p.match(/^(.+?) (?:tv|television|screen)$/);
  if (named) return { type: 'named', value: named[1]! };
  return null;
}

/** Pull a trailing device phrase ("on the bedroom tv", "on all tvs") off the command. */
function extractDevice(text: string): { rest: string; device: DeviceSelector } {
  const all = text.match(/^(.*?)\s*(?:on |in )?(?:all|every|each)(?: of)?(?: the)? (?:tvs|tv|televisions|television|screens)(?: in the house)?$/);
  if (all) return { rest: all[1]!.trim(), device: { type: 'all' } };

  const named = text.match(/^(.*?)\s+(?:on|in) (?:the |my )?(.+?) (?:tv|television|screen)$/);
  if (named && named[1]) return { rest: named[1].trim(), device: { type: 'named', value: named[2]!.trim() } };

  const room = text.match(new RegExp(`^(.*?)\\s+(?:on|in) (?:the |my )?(${ROOM_WORDS})$`));
  if (room && room[1]) return { rest: room[1].trim(), device: { type: 'room', value: room[2]!.trim() } };

  // "on the tv" adds nothing.
  return { rest: text.replace(/\s+(?:on|in) (?:the |my )?(?:tv|television)$/, '').trim(), device: { type: 'default' } };
}

function amountWords(s: string | undefined): number {
  if (!s) return 3;
  if (/(a (little )?bit|a little|slightly|a touch)/.test(s)) return 2;
  if (/a lot|way|much/.test(s)) return 8;
  const n = s.match(new RegExp(NUMBER_PATTERN));
  const v = n ? parseNumber(n[1]!) : null;
  return v && v > 0 ? Math.min(v, 20) : 3;
}

type Builder = (m: RegExpMatchArray, device: DeviceSelector) => unknown;
const N = NUMBER_PATTERN;

/** Ordered: first match wins. Each produces a candidate that is then schema-validated. */
const RULES: ReadonlyArray<[RegExp, Builder]> = [
  // Power
  [/^(?:turn|switch|power) (on|off)(?: (?:the )?(?:tv|television|it))?$/, (m, device) => ({ intent: 'power', action: m[1], device })],
  [/^(?:turn|switch|power) (?:the )?(?:tv|television|it) (on|off)$/, (m, device) => ({ intent: 'power', action: m[1], device })],
  [/^(?:shut down|shutdown|sleep)$/, (_m, device) => ({ intent: 'power', action: 'off', device })],

  // Volume — absolute
  [new RegExp(`^(?:set |change |put |turn )?(?:the )?volume (?:to |at )?${N}(?: percent)?$`), (m, device) => ({ intent: 'volume_set', level: parseNumber(m[1]!), device })],
  [new RegExp(`^(?:increase|decrease|raise|lower|turn up|turn down) (?:the )?volume to ${N}$`), (m, device) => ({ intent: 'volume_set', level: parseNumber(m[1]!), device })],
  // Volume — relative
  [/^(?:turn (?:it |the volume |the tv )?up|volume up|increase (?:the )?volume|raise (?:the )?volume|louder|turn up (?:the )?volume)(?: (.+))?$/, (m, device) => ({ intent: 'volume_change', direction: 'up', steps: amountWords(m[1]), device })],
  [/^(?:turn (?:it |the volume |the tv )?down|volume down|decrease (?:the )?volume|lower (?:the )?volume|reduce (?:the )?volume|quieter|softer|turn down (?:the )?volume)(?: (.+))?$/, (m, device) => ({ intent: 'volume_change', direction: 'down', steps: amountWords(m[1]), device })],
  [/^(?:mute|unmute|silence|toggle mute)(?: (?:the )?(?:tv|sound|audio|volume))?$/, (_m, device) => ({ intent: 'remote_key', key: 'mute', device })],

  // Playback
  [/^(?:pause|pause (?:it|this|the (?:video|movie|show|music|song))|hold on)$/, (_m, device) => ({ intent: 'remote_key', key: 'pause', device })],
  [/^(?:resume|continue|unpause|play|keep playing|resume (?:playback|it|the video))$/, (_m, device) => ({ intent: 'remote_key', key: 'play', device })],
  [/^stop(?: (?:it|playback|playing|the video))?$/, (_m, device) => ({ intent: 'remote_key', key: 'stop', device })],
  [/^(?:fast forward|forward|skip ahead)$/, (_m, device) => ({ intent: 'remote_key', key: 'fast_forward', device })],
  [/^(?:rewind|go back a bit)$/, (_m, device) => ({ intent: 'remote_key', key: 'rewind', device })],

  // Navigation
  [/^(?:go )?back$/, (_m, device) => ({ intent: 'remote_key', key: 'back', device })],
  [/^(?:go )?home(?: screen)?$|^go to (?:the )?home(?: screen)?$/, (_m, device) => ({ intent: 'remote_key', key: 'home', device })],
  [/^(?:open (?:the )?)?menu$/, (_m, device) => ({ intent: 'remote_key', key: 'menu', device })],
  [/^(?:ok|okay|select|enter|choose (?:it|this|that))$/, (_m, device) => ({ intent: 'remote_key', key: 'select', device })],
  [new RegExp(`^(?:go |move |press )?(up|down|left|right)(?: ${N} times?)?$`), (m, device) => ({ intent: 'remote_key', key: m[1], repeat: m[2] ? parseNumber(m[2]) : 1, device })],

  // Channels
  [/^(?:channel up|next channel)$/, (_m, device) => ({ intent: 'remote_key', key: 'channel_up', device })],
  [/^(?:channel down|previous channel)$/, (_m, device) => ({ intent: 'remote_key', key: 'channel_down', device })],

  // Inputs
  [new RegExp(`^(?:switch|change|go|set)(?: (?:the )?(?:input|source))? to (?:input )?hdmi ?${N}$|^(?:input |source )?hdmi ?${N}$`), (m, device) => ({ intent: 'select_input', input: `hdmi${parseNumber((m[1] ?? m[2])!)}`, device })],
  [/^(?:change (?:the )?(?:input|source)|source|input)$/, (_m, device) => ({ intent: 'remote_key', key: 'source', device })],

  // State
  [/^(?:what(?:'s| is) (?:playing|on)|what am i watching)$/, (_m, device) => ({ intent: 'query_state', device })],

  // Text
  [/^type (.+)$/, (m, device) => ({ intent: 'type_text', text: m[1], device })],
];

export function parseLocal(input: string, originalCase?: string): LocalParse {
  const normalized = normalize(input);
  if (!normalized) return { kind: 'empty' };

  // Power first: in "turn on the bedroom tv" the "on" is the verb, not a device preposition.
  const power = normalized.match(/^(?:turn|switch|power) (on|off)(?: (.+))?$/);
  if (power) {
    const sel = phraseToSelector(power[2]);
    if (sel) return ok({ intent: 'power', action: power[1], device: sel }, normalized);
  }

  const { rest, device } = extractDevice(normalized);

  for (const [re, build] of RULES) {
    const m = rest.match(re);
    if (!m) continue;
    let candidate = build(m, device) as Record<string, unknown>;
    // Keep user's casing for typed text.
    if (candidate.intent === 'type_text' && originalCase) {
      const om = originalCase.trim().match(/^type\s+(.+?)[.!?]?$/i);
      if (om) candidate = { ...candidate, text: om[1] };
    }
    const r = CommandIntentSchema.safeParse(candidate);
    if (r.success) return { kind: 'intent', intent: r.data, normalized };
  }

  // Open an app
  const open = rest.match(/^(?:open|launch|start|go to|switch to|put on) (.+)$/);
  if (open) {
    const app = matchApp(open[1]!);
    if (app) return ok({ intent: 'launch_app', app, device }, normalized);
  }

  // Search: "search (youtube) for X (on youtube)"
  const search = rest.match(/^(?:search|look up|find)(?: (you ?tube|netflix))?(?: for)? (.+?)(?: on (you ?tube|netflix))?$/);
  if (search && !/^(?:me |something|some )/.test(search[2]!)) {
    const app = matchApp(search[1] ?? search[3] ?? '') ?? undefined;
    return ok({ intent: 'search', query: search[2], ...(app ? { app } : {}), device }, normalized);
  }

  // "youtube arsenal highlights" / "netflix money heist"
  const appFirst = rest.match(/^(you ?tube|netflix) (?!app$)(.+)$/);
  if (appFirst) {
    const app = matchApp(appFirst[1]!)!;
    return ok({ intent: 'search', query: appFirst[2]!.replace(/^(?:for|search(?: for)?) /, ''), app, device }, normalized);
  }

  // Play specific content: "play X (on youtube)", "i want to watch X", "listen to X"
  const play = rest.match(
    /^(?:(?:i (?:want|would like|wanna) to|let me|can i|i'd like to) )?(?:play|put on|put|show me|watch|see|listen to|hear)(?: me)? (.+?)(?: on (you ?tube|netflix))?$/,
  );
  if (play) {
    const query = play[1]!.replace(/^(?:some|a few|a|an|the) /, '').trim();
    const app = matchApp(play[2] ?? '') ?? 'youtube';
    const vague = /^(something|anything|good|nice|relaxing|appropriate|whatever)\b/.test(query);
    const isMusic = /\b(music|songs?|album|playlist|mix)\b|\bby\b/.test(query) || /^(?:.* )?(?:listen to|hear) /.test(rest);
    const intent = { intent: 'play_media', query, app, ...(isMusic ? { mode: 'music' } : {}), device };
    if (!vague && query.length > 0) return ok(intent, normalized);
    return needsAi(normalized, intent);
  }

  // Vague requests ("find me some relaxing music") — let AI pick; fall back to a search.
  const vague = rest.match(/^(?:find|get|recommend|suggest)(?: me)? (?:some |something )?(.+)$/);
  if (vague) return needsAi(normalized, { intent: 'search', query: vague[1], app: 'youtube', device });

  // Anything else that doesn't look like a TV-control phrase is most likely
  // something to watch ("arsenal highlights") — offer a YouTube search.
  // Control-like phrases we didn't understand get no guess.
  if (!CONTROL_VERBS.test(rest) && rest.split(' ').length <= 10) {
    return needsAi(normalized, { intent: 'search', query: rest, app: 'youtube', device });
  }
  return { kind: 'needs_ai', normalized };
}

const CONTROL_VERBS = /^(?:turn|switch|power|set|change|increase|decrease|raise|lower|reduce|mute|unmute|pause|resume|stop|go|move|press|open|launch|start|close|exit|quit|select|skip|rewind|forward|volume|channel|input|source|hdmi)\b/;

function ok(candidate: unknown, normalized: string): LocalParse {
  const r = CommandIntentSchema.safeParse(candidate);
  return r.success ? { kind: 'intent', intent: r.data, normalized } : { kind: 'needs_ai', normalized };
}

function needsAi(normalized: string, fallback: unknown): LocalParse {
  const r = CommandIntentSchema.safeParse(fallback);
  return r.success ? { kind: 'needs_ai', normalized, fallback: r.data } : { kind: 'needs_ai', normalized };
}
