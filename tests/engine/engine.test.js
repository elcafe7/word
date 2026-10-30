import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/engine.js';
import { buildTokens } from '../../src/engine/tokenizer.js';
import { createFakeClock } from '../fake-clock.js';

function setup(paragraphs, extra = {}) {
  const clock = createFakeClock();
  const { tokens, paraStarts } = buildTokens([{ title: '', paragraphs }]);
  const log = { words: [], states: [], ends: 0 };
  const engine = createEngine({
    tokens, paraStarts, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    onWord: (i, end) => log.words.push({ i, end, t: clock.now() }),
    onStateChange: (p) => log.states.push(p),
    onChapterEnd: () => { log.ends += 1; },
    wpm: 300, frameSize: 1, mults: { comma: 1.5, sentence: 2, para: 2.5 }, ...extra,
  });
  return { clock, engine, log, tokens };
}

describe('createEngine', () => {
  it('starts paused at the given index without rendering', () => {
    const { engine, log } = setup(['a b c'], { index: 1 });
    expect(engine.isPlaying()).toBe(false);
    expect(engine.getIndex()).toBe(1);
    expect(engine.getFrameEnd()).toBe(2);
    expect(log.words).toEqual([]);
  });

  it('play shows the current frame immediately and advances by timers', () => {
    const { clock, engine, log } = setup(['one two three four']);
    engine.play();
    expect(log.words[0]).toEqual({ i: 0, end: 1, t: 0 });
    expect(log.states).toEqual([true]);
    clock.advance(400); // 200 / 0.5
    expect(log.words[1]).toEqual({ i: 1, end: 2, t: 400 });
    clock.advance(200 / 0.55);
    expect(log.words[2].i).toBe(2);
  });

  it('ramp: ten ramped words then full speed', () => {
    const { clock, engine, log } = setup([Array.from({ length: 14 }, (_, k) => `w${k}`).join(' ')]);
    engine.play();
    clock.runUntil(() => log.words.length === 14);
    const gaps = log.words.slice(1).map((w, k) => +(w.t - log.words[k].t).toFixed(3));
    expect(gaps[0]).toBeCloseTo(400);
    expect(gaps[9]).toBeCloseTo(210.5, 1); // 200 / 0.95, rounded to 0.1 ms
    expect(gaps[10]).toBeCloseTo(200);
    expect(gaps[12]).toBeCloseTo(200);
  });

  it('pause stops timers and keeps the index; play restarts the ramp', () => {
    const { clock, engine, log } = setup(['a b c d e f']);
    engine.play();
    clock.advance(1000);
    engine.pause();
    const at = engine.getIndex();
    expect(clock.pending()).toBe(0);
    clock.advance(5000);
    expect(engine.getIndex()).toBe(at);
    engine.play();
    expect(log.words.at(-1).i).toBe(at);
    expect(log.states).toEqual([true, false, true]);
    const t0 = clock.now();
    clock.advance(400);
    expect(log.words.at(-1)).toMatchObject({ i: at + 1, t: t0 + 400 });
  });

  it('chapter end fires after the last frame, keeps the last frame and stops', () => {
    const { clock, engine, log, tokens } = setup(['a b', 'c.']);
    engine.play();
    clock.runUntil(() => log.ends === 1);
    expect(engine.isPlaying()).toBe(false);
    expect(engine.getIndex()).toBe(tokens.length - 1);
    expect(log.states.at(-1)).toBe(false);
  });

  it('verse-end pause: last word of a paragraph gets the para multiplier', () => {
    const { clock, engine, log } = setup(['a b c d e f g h i j k', 'l m']);
    engine.play();
    clock.runUntil(() => log.words.length === 12);
    expect(log.words[11].t - log.words[10].t).toBeCloseTo(500); // 200 * 2.5, past the ramp
  });

  it('frame size 3 never crosses a paragraph', () => {
    const { clock, engine, log } = setup(['a b c d', 'e f g', 'h']);
    engine.setFrameSize(3);
    expect(log.words).toEqual([{ i: 0, end: 3, t: 0 }]); // paused: re-renders the current frame
    log.words.length = 0;
    engine.play();
    clock.runUntil(() => log.ends === 1);
    expect(log.words.map((w) => [w.i, w.end])).toEqual([[0, 3], [3, 4], [4, 7], [7, 8]]);
  });

  it('seek while paused renders the new frame; while playing it continues from there', () => {
    const { clock, engine, log } = setup(['a b c d e f']);
    engine.seek(3);
    expect(log.words.at(-1)).toEqual({ i: 3, end: 4, t: 0 });
    expect(engine.isPlaying()).toBe(false);
    engine.play();
    clock.advance(10);
    engine.seek(1);
    expect(log.words.at(-1).i).toBe(1);
    clock.advance(400);
    expect(log.words.at(-1).i).toBe(2);
  });

  it('seek clamps to the token range', () => {
    const { engine } = setup(['a b c']);
    engine.seek(99);
    expect(engine.getIndex()).toBe(2);
    engine.seek(-4);
    expect(engine.getIndex()).toBe(0);
  });

  it('setWpm applies from the next frame', () => {
    const { clock, engine, log } = setup([Array.from({ length: 20 }, (_, k) => `w${k}`).join(' ')]);
    engine.play();
    clock.runUntil(() => log.words.length === 12);
    engine.setWpm(600);
    const t = log.words.at(-1).t;
    clock.advance(200); // current frame still at old speed
    expect(log.words.at(-1).t).toBe(t + 200);
    clock.advance(100);
    expect(log.words.at(-1).t).toBeCloseTo(t + 300);
  });

  it('setMults changes pauses', () => {
    const { clock, engine, log } = setup(['a b c d e f g h i j k,', 'l']);
    engine.setMults({ comma: 3 });
    expect(engine.getMults()).toEqual({ comma: 3, sentence: 2, para: 2.5 });
    engine.play();
    clock.runUntil(() => log.words.length === 12);
    expect(log.words[11].t - log.words[10].t).toBeCloseTo(600);
  });

  it('toggle, destroy and empty token arrays are safe', () => {
    const { clock, engine } = setup(['a b']);
    engine.toggle();
    expect(engine.isPlaying()).toBe(true);
    engine.toggle();
    expect(engine.isPlaying()).toBe(false);
    engine.play();
    engine.destroy();
    expect(clock.pending()).toBe(0);
    engine.play();
    expect(engine.isPlaying()).toBe(false);
    const empty = setup(['']);
    empty.engine.play();
    expect(empty.engine.isPlaying()).toBe(false);
  });
});
