import { describe, expect, it } from 'vitest';
import { parseLocal } from './parser';

const intentOf = (s: string) => {
  const r = parseLocal(s, s);
  if (r.kind !== 'intent') throw new Error(`expected intent for "${s}", got ${r.kind}`);
  return r.intent;
};

describe('parseLocal — simple commands stay local', () => {
  it.each([
    ['Volume up', { intent: 'volume_change', direction: 'up', steps: 3 }],
    ['Increase volume', { intent: 'volume_change', direction: 'up' }],
    ['Lower the volume a little', { intent: 'volume_change', direction: 'down', steps: 2 }],
    ['turn it down a lot', { intent: 'volume_change', direction: 'down', steps: 8 }],
    ['Set volume to 20', { intent: 'volume_set', level: 20 }],
    ['volume twenty five', { intent: 'volume_set', level: 25 }],
    ['Increase the volume to 25.', { intent: 'volume_set', level: 25 }],
    ['Pause', { intent: 'remote_key', key: 'pause' }],
    ['Pause what I am watching', undefined],
    ['Resume', { intent: 'remote_key', key: 'play' }],
    ['mute', { intent: 'remote_key', key: 'mute' }],
    ['go back', { intent: 'remote_key', key: 'back' }],
    ['Home', { intent: 'remote_key', key: 'home' }],
    ['down 3 times', { intent: 'remote_key', key: 'down', repeat: 3 }],
    ['Open Netflix', { intent: 'launch_app', app: 'netflix' }],
    ['launch the YouTube app', { intent: 'launch_app', app: 'youtube' }],
    ['Switch to HDMI 2', { intent: 'select_input', input: 'hdmi2' }],
    ['hdmi one', { intent: 'select_input', input: 'hdmi1' }],
    ['Turn off the TV', { intent: 'power', action: 'off', device: { type: 'default' } }],
    ['turn the tv on', { intent: 'power', action: 'on' }],
    ["What's playing?", { intent: 'query_state' }],
  ])('%s', (text, expected) => {
    if (expected === undefined) return; // documented gap, see below
    expect(intentOf(text)).toMatchObject(expected);
  });
});

describe('parseLocal — device selection', () => {
  it('turn off all TVs', () => {
    expect(intentOf('Turn off all TVs')).toMatchObject({ intent: 'power', action: 'off', device: { type: 'all' } });
  });
  it('turn off every tv', () => {
    expect(intentOf('turn off every TV')).toMatchObject({ device: { type: 'all' } });
  });
  it('turn on the living room tv', () => {
    expect(intentOf('turn on the living room tv')).toMatchObject({ intent: 'power', action: 'on', device: { type: 'named', value: 'living room' } });
  });
  it('open youtube in the bedroom', () => {
    expect(intentOf('open youtube in the bedroom')).toMatchObject({ intent: 'launch_app', app: 'youtube', device: { type: 'room', value: 'bedroom' } });
  });
  it('"on youtube" is an app, not a device', () => {
    expect(intentOf('Play Suzanna by Sauti Sol on YouTube')).toMatchObject({ device: { type: 'default' }, app: 'youtube' });
  });
});

describe('parseLocal — media', () => {
  it('play a specific song', () => {
    expect(intentOf('Play Suzanna by Sauti Sol')).toMatchObject({ intent: 'play_media', app: 'youtube', query: 'suzanna by sauti sol', mode: 'music' });
  });
  it('put music on a named tv', () => {
    expect(intentOf('Put some Sauti Sol music on the living room TV')).toMatchObject({
      intent: 'play_media', query: 'sauti sol music', mode: 'music', device: { type: 'named', value: 'living room' },
    });
  });
  it('actually, play ... (correction phrasing)', () => {
    expect(intentOf('Actually, play Suzanna by Sauti Sol')).toMatchObject({ intent: 'play_media', query: 'suzanna by sauti sol' });
  });
  it('search', () => {
    expect(intentOf('Search for Arsenal highlights')).toMatchObject({ intent: 'search', query: 'arsenal highlights' });
  });
  it('search on youtube', () => {
    expect(intentOf('search arsenal highlights on youtube')).toMatchObject({ intent: 'search', app: 'youtube', query: 'arsenal highlights' });
  });
  it('play on netflix', () => {
    expect(intentOf('Play Stranger Things on Netflix')).toMatchObject({ intent: 'play_media', app: 'netflix', query: 'stranger things' });
  });
  it('search netflix for', () => {
    expect(intentOf('search netflix for money heist')).toMatchObject({ intent: 'search', app: 'netflix', query: 'money heist' });
  });
  it('type keeps original casing', () => {
    expect(intentOf('type Hello World')).toMatchObject({ intent: 'type_text', text: 'Hello World' });
  });
});

describe('parseLocal — hands off to AI', () => {
  it('vague request gets AI + search fallback', () => {
    const r = parseLocal('Find me some relaxing music');
    expect(r.kind).toBe('needs_ai');
    if (r.kind === 'needs_ai') expect(r.fallback).toMatchObject({ intent: 'search', query: 'relaxing music' });
  });
  it('play something good', () => {
    const r = parseLocal('Play some good Kenyan music');
    expect(r.kind).toBe('needs_ai');
    if (r.kind === 'needs_ai') expect(r.fallback).toMatchObject({ intent: 'play_media', query: 'good kenyan music' });
  });
  it('plain text becomes a YouTube search fallback', () => {
    const r = parseLocal('Arsenal highlights');
    expect(r).toMatchObject({ kind: 'needs_ai', fallback: { intent: 'search', app: 'youtube', query: 'arsenal highlights' } });
  });
  it('unknown control phrases get no guessed search', () => {
    const r = parseLocal('switch the subtitles to french');
    expect(r.kind).toBe('needs_ai');
    if (r.kind === 'needs_ai') expect(r.fallback).toBeUndefined();
  });
  it('i want to watch …', () => {
    expect(intentOf('I want to watch Arsenal highlights')).toMatchObject({ intent: 'play_media', query: 'arsenal highlights' });
  });
  it('listen to … is music', () => {
    expect(intentOf('listen to Sauti Sol')).toMatchObject({ intent: 'play_media', query: 'sauti sol', mode: 'music' });
  });
  it('app-first phrasing', () => {
    expect(intentOf('YouTube arsenal highlights')).toMatchObject({ intent: 'search', app: 'youtube', query: 'arsenal highlights' });
    expect(intentOf('netflix money heist')).toMatchObject({ intent: 'search', app: 'netflix', query: 'money heist' });
    expect(intentOf('open youtube')).toMatchObject({ intent: 'launch_app', app: 'youtube' });
  });
  it('empty', () => {
    expect(parseLocal('   ').kind).toBe('empty');
  });
  it('compound sentences are not guessed at locally', () => {
    // "Pause what I'm watching" isn't in the rule set — better to defer than misfire.
    expect(parseLocal("Pause what I'm watching").kind).toBe('needs_ai');
  });
});
