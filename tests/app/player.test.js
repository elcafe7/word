import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPlayer } from '../../src/app/player.js';
import { DEFAULT_SETTINGS } from '../../src/app/store.js';
import { createFakeClock, flush } from '../fake-clock.js';

const index = JSON.parse(readFileSync('tests/fixtures/index.mini.json', 'utf8'));
const FIX = {
  'kjv/John/3': 'kjv-John-3.json', 'kjv/John/4': 'kjv-John-4.json', 'kjv/Jude/1': 'kjv-Jude-1.json',
  'kjv/Rev/1': 'kjv-Rev-1.json', 'kjv/Rev/22': 'kjv-Rev-22.json',
};
const json = Object.fromEntries(Object.entries(FIX).map(([k, f]) => [k, JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))]));
// Synthetic chapter with an empty verse 12. No shipped edition has an empty verse since the
// Geneva 1599 rebuild (Verse 8ec8a9b); this keeps the defensive empty-verse path covered.
json['gen/Rev/13'] = { edition: 'gen', book: 'Revelation', chapter: 13, verses: [
  ...Array.from({ length: 10 }, (_, k) => ({ v: k + 1, text: `verse ${k + 1} words here.` })),
  { v: 11, text: 'And I beheld another beast coming up out of the earth;' }, { v: 12, text: '' },
  { v: 13, text: 'And he doeth great wonders,' },
] };

function setup({ settings = {}, fail = {} } = {}) {
  const clock = createFakeClock();
  const calls = [];
  const renders = [];
  const errors = [];
  const prefetches = [];
  const fetchFn = async (url) => {
    const k = url.replace(/^\/word\/data\//, '').replace(/\.json\?v=.*$/, '');
    calls.push({ k, t: clock.now() });
    if (fail[k]) return { ok: false, status: fail[k], json: async () => ({}) };
    if (!json[k]) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => structuredClone(json[k]) };
  };
  const player = createPlayer({
    index, base: '/word/', fetchFn, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    onRender: (s, reason) => renders.push({ ...s, reason, t: clock.now() }),
    onState: () => {},
    onError: (e) => errors.push(e),
    onPrefetch: (tag) => prefetches.push({ tag, t: clock.now() }),
  });
  const count = (k) => calls.filter((c) => c.k === k).length;
  /** run timers, letting promises settle between them */
  async function runUntil(pred, limit = 600000) {
    const stop = clock.now() + limit;
    while (!pred() && clock.now() < stop) {
      await flush(20);
      if (pred()) break;
      if (!clock.runUntil(() => true, 0) && clock.pending() === 0) { await flush(20); if (!clock.pending()) break; }
      clock.advance(1);
    }
    await flush(20);
    return pred();
  }
  return { clock, player, calls, renders, errors, prefetches, count, runUntil };
}

const st = (p) => p.getState();

describe('player', () => {
  it('(a) John 3:16 → 3:17 timing at 300 and 900 WPM, frame size 1 and 3', async () => {
    // 3:16 has 25 words; 3 commas, sentence end + verse end (×2.5). Words 0–9 are ramped (÷0.5 … ÷0.95).
    // 300 WPM: ramp 400+363.6+333.3+307.7+285.7+400(world, ×1.5)+250+235.3+222.2+210.5 = 3008.3;
    //          rest 15×200 + 100 (Son,) + 100 (perish,) + 300 (life. ×2.5) = 3500 → 6508.3 ms.
    for (const [wpm, size, want] of [[300, 1, 6508.3], [300, 3, 6508.3], [900, 1, 2169.4], [900, 3, 2169.4]]) {
      const s = setup({ settings: { wpm, frameSize: size } });
      await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 16, word: 0 });
      s.player.play();
      const t0 = s.clock.now();
      s.clock.runUntil(() => st(s.player).verse === 17);
      const first17 = s.renders.find((r) => r.verse === 17);
      expect(Math.abs(first17.t - t0 - want), `wpm ${wpm} size ${size}: ${first17.t - t0}`).toBeLessThanOrEqual(1);
    }
  });

  it('(b) back(): within a verse, to the previous verse, across chapters', async () => {
    const s = setup();
    // SPEC §6.4: i − s ≥ 2 → start of this verse; otherwise the previous verse. T4(b)'s "word 1 → 3:16 word 0"
    // contradicts §6.4 (and T9's keyboard case); §6.4 is followed — see DECISIONS.md D-6.
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 16, word: 1 });
    await s.player.back();
    expect(st(s.player)).toMatchObject({ verse: 15, word: 0 });
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 16, word: 2 });
    await s.player.back();
    expect(st(s.player)).toMatchObject({ verse: 16, word: 0 });
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 16, word: 0 });
    await s.player.back();
    expect(st(s.player)).toMatchObject({ chapter: 3, verse: 15, word: 0 });
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 16, word: 4 });
    await s.player.back();
    expect(st(s.player)).toMatchObject({ verse: 16, word: 0 });
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 4, verse: 1, word: 0 });
    const before = s.count('kjv/John/3');
    await s.player.back();
    await s.runUntil(() => st(s.player).chapter === 3);
    expect(st(s.player)).toMatchObject({ abbr: 'John', chapter: 3, verse: 36, word: 0 });
    expect(s.count('kjv/John/3')).toBeGreaterThanOrEqual(before); // served from cache or fetched
  });

  it('(b2) back() at John 4:1 fetches John 3 when not cached', async () => {
    const s = setup();
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 4, verse: 1, word: 0 });
    expect(s.count('kjv/John/3')).toBe(0);
    await s.player.back();
    expect(s.count('kjv/John/3')).toBe(1);
    expect(st(s.player)).toMatchObject({ chapter: 3, verse: 36, word: 0 });
  });

  it('(c) forward() at John 3:36 → John 4:1; within a chapter → next verse', async () => {
    const s = setup();
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 16, word: 3 });
    await s.player.forward();
    expect(st(s.player)).toMatchObject({ verse: 17, word: 0 });
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 36, word: 0 });
    await s.player.forward();
    expect(st(s.player)).toMatchObject({ abbr: 'John', chapter: 4, verse: 1, word: 0 });
  });

  it('(d) prefetch starts at 80% and not before; exactly one fetch of John 4', async () => {
    const s = setup({ settings: { wpm: 900 } });
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 1, word: 0 });
    s.player.play();
    const len = st(s.player).tokensLen;
    const threshold = Math.ceil(0.8 * len);
    let maxEndBefore = 0;
    await s.runUntil(() => {
      const r = s.renders.at(-1);
      if (s.count('kjv/John/4') === 0) maxEndBefore = Math.max(maxEndBefore, r.frameEnd);
      return r.chapter === 4;
    });
    expect(maxEndBefore).toBeLessThan(threshold);
    const pf = s.prefetches[0];
    const [, i, n] = /@(\d+)\/(\d+)$/.exec(pf.tag).map(Number);
    expect(pf.tag.startsWith('kjv/John/4@')).toBe(true);
    expect(n).toBe(len);
    const startedAt = s.renders.find((r) => r.chapter === 3 && r.index === i);
    expect(startedAt.frameEnd).toBeGreaterThanOrEqual(threshold);
    expect(s.count('kjv/John/4')).toBe(1);
    expect(st(s.player)).toMatchObject({ chapter: 4, verse: 1, playing: true });
  });

  it('(e) Jude 1:25 rolls over into Revelation 1:1', async () => {
    const s = setup({ settings: { wpm: 900 } });
    await s.player.open({ edition: 'kjv', abbr: 'Jude', chapter: 1, verse: 25, word: 0 });
    s.player.play();
    await s.runUntil(() => st(s.player).abbr === 'Rev');
    expect(st(s.player)).toMatchObject({ abbr: 'Rev', chapter: 1, verse: 1, word: 0, playing: true });
  });

  it('(f) Revelation 22:21 end → ended; forward no-op; play restarts at 22:21', async () => {
    const s = setup({ settings: { wpm: 900 } });
    await s.player.open({ edition: 'kjv', abbr: 'Rev', chapter: 22, verse: 21, word: 0 });
    const start = st(s.player).index;
    s.player.play();
    await s.runUntil(() => st(s.player).ended);
    const end = st(s.player);
    expect(end).toMatchObject({ ended: true, playing: false, verse: 21 });
    expect(end.frameEnd).toBe(end.tokensLen);
    await s.player.forward();
    expect(st(s.player).index).toBe(end.index);
    s.player.play();
    expect(st(s.player)).toMatchObject({ index: start, playing: true, ended: false });
  });

  it('(g) frame size 3 never spans two verses across John 3', async () => {
    const s = setup({ settings: { wpm: 900, frameSize: 3 } });
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 1, word: 0 });
    const starts = json['kjv/John/3'].verses.reduce((acc, v) => { acc.push((acc.at(-1) ?? 0) + (acc.len ?? 0)); acc.len = v.text.split(' ').length; return acc; }, []);
    s.player.play();
    await s.runUntil(() => st(s.player).chapter === 4);
    const frames = s.renders.filter((r) => r.chapter === 3);
    expect(frames.length).toBeGreaterThan(200);
    for (const f of frames) {
      expect(f.frameEnd - f.index).toBeLessThanOrEqual(3);
      expect(starts.some((b) => b > f.index && b < f.frameEnd)).toBe(false);
    }
  });

  it('(h) verse pause never shorter than sentence pause', async () => {
    const s = setup({ settings: { verseMult: 1.0, sentenceMult: 2.0 } });
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 16, word: 0 });
    expect(s.player.getEngineMults()).toEqual({ comma: 1.5, sentence: 2.0, para: 2.0 });
    s.player.applySettings({ verseMult: 3.5 });
    expect(s.player.getEngineMults().para).toBe(3.5);
  });

  it('(i) an empty verse is never reported; seeking to it lands on the next verse', async () => {
    const s = setup({ settings: { wpm: 900 } });
    await s.player.open({ edition: 'gen', abbr: 'Rev', chapter: 13, verse: 12, word: 0 });
    expect(st(s.player).verse).toBe(13);
    await s.player.open({ edition: 'gen', abbr: 'Rev', chapter: 13, verse: 11, word: 0 });
    s.player.play();
    s.clock.advance(20000);
    await s.runUntil(() => !st(s.player).playing, 20000);
    expect(s.renders.some((r) => r.abbr === 'Rev' && r.chapter === 13 && r.verse === 12)).toBe(false);
    expect(s.renders.some((r) => r.verse === 13)).toBe(true);
  });

  it('(j) 429 → onError kind "rate", player paused; retry opens paused', async () => {
    const s = setup({ settings: { wpm: 900 }, fail: { 'kjv/John/4': 429 } });
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 36, word: 0 });
    s.player.play();
    await s.runUntil(() => s.errors.length > 0);
    expect(s.errors[0]).toMatchObject({ kind: 'rate', status: 429, abbr: 'John', chapter: 4 });
    expect(st(s.player)).toMatchObject({ playing: false, chapter: 3, verse: 36 });
    expect(st(s.player).frameEnd).toBe(st(s.player).tokensLen);
  });

  it('(j2) other HTTP errors → kind "http"; retry after recovery seeks paused', async () => {
    const fail = { 'kjv/John/4': 500 };
    const s = setup({ settings: { wpm: 900 }, fail });
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 36, word: 0 });
    s.player.play();
    await s.runUntil(() => s.errors.length > 0);
    expect(s.errors[0].kind).toBe('http');
    delete fail['kjv/John/4'];
    await s.errors[0].retry();
    expect(st(s.player)).toMatchObject({ chapter: 4, verse: 1, word: 0, playing: false });
  });

  it('chapter cache is LRU with at most 4 entries', async () => {
    const s = setup();
    for (const [abbr, ch] of [['John', 3], ['John', 4], ['Jude', 1], ['Rev', 1], ['Rev', 22]]) {
      await s.player.open({ edition: 'kjv', abbr, chapter: ch, verse: 1, word: 0 });
    }
    await s.player.open({ edition: 'kjv', abbr: 'Rev', chapter: 1, verse: 1, word: 0 });
    expect(s.count('kjv/Rev/1')).toBe(1);
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 1, word: 0 });
    expect(s.count('kjv/John/3')).toBe(2); // evicted
  });

  it('setEdition keeps book/chapter/verse at word 0, paused', async () => {
    const s = setup();
    json['kj16/John/3'] = { ...json['kjv/John/3'], edition: 'kj16' };
    await s.player.open({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 16, word: 4 });
    s.player.play();
    await s.player.setEdition('kj16');
    expect(st(s.player)).toMatchObject({ edition: 'kj16', abbr: 'John', chapter: 3, verse: 16, word: 0, playing: false });
  });
});
