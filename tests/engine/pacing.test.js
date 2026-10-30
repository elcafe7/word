import { describe, expect, it } from 'vitest';
import { RAMP_WORDS, frameDelay, punctuationKind, rampSpeed } from '../../src/engine/pacing.js';

const mults = { comma: 1.5, sentence: 2, para: 2.5 };

describe('punctuationKind', () => {
  it.each([
    ['life.', 'sentence'], ['Amen.', 'sentence'], ['me?', 'sentence'], ['LORD!', 'sentence'], ['said,”', 'comma'],
    ['world,', 'comma'], ['want;', 'comma'], ['Sonne:', 'comma'], ['saved.’', 'sentence'], ['God', null], ['wing’d', null],
  ])('%s → %s', (w, k) => expect(punctuationKind(w)).toBe(k));
});

describe('rampSpeed', () => {
  it('ramps from 0.5 to 1 over RAMP_WORDS words', () => {
    expect(RAMP_WORDS).toBe(10);
    expect(rampSpeed(0)).toBe(0.5);
    expect(rampSpeed(5)).toBeCloseTo(0.75);
    expect(rampSpeed(9)).toBeCloseTo(0.95);
    expect(rampSpeed(10)).toBe(1);
    expect(rampSpeed(500)).toBe(1);
  });
});

describe('frameDelay', () => {
  it('plain word at full speed = 60000 / wpm', () => {
    expect(frameDelay({ words: ['God'], wpm: 300, mults, paraEnd: false, rampStep: 10 })).toBe(200);
  });
  it('comma and sentence multipliers', () => {
    expect(frameDelay({ words: ['world,'], wpm: 300, mults, paraEnd: false, rampStep: 10 })).toBe(300);
    expect(frameDelay({ words: ['life.'], wpm: 300, mults, paraEnd: false, rampStep: 10 })).toBe(400);
  });
  it('paragraph end uses the larger of para and punctuation', () => {
    expect(frameDelay({ words: ['life.'], wpm: 300, mults, paraEnd: true, rampStep: 10 })).toBe(500);
    expect(frameDelay({ words: ['life.'], wpm: 300, mults: { ...mults, para: 1 }, paraEnd: true, rampStep: 10 })).toBe(400);
  });
  it('first word after play is shown at half speed', () => {
    expect(frameDelay({ words: ['God'], wpm: 300, mults, paraEnd: false, rampStep: 0 })).toBe(400);
  });
  it('multi-word frames sum per-word times, pause only on the last', () => {
    expect(frameDelay({ words: ['God', 'so', 'loved'], wpm: 300, mults, paraEnd: false, rampStep: 10 })).toBe(600);
    expect(frameDelay({ words: ['the', 'world,'], wpm: 600, mults, paraEnd: false, rampStep: 10 })).toBe(250);
  });
});
