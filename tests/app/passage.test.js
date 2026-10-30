import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPassage, tokenIndexFor, verseIndexAt } from '../../src/app/passage.js';

const john3 = JSON.parse(readFileSync('tests/fixtures/kjv-John-3.json', 'utf8'));

describe('buildPassage', () => {
  const p = buildPassage(john3);
  it('tokens and verse bookkeeping', () => {
    expect(p.verseNums.length).toBe(36);
    expect(p.verseStarts[0]).toBe(0);
    expect(p.tokens[p.verseStarts[15]]).toBe('For');
    expect(p.verseLens[15]).toBe(25);
    expect(p.paraStarts).toEqual(p.verseStarts);
    expect(p.tokens.length).toBe(p.verseLens.reduce((a, b) => a + b, 0));
  });
  it('verseIndexAt', () => {
    expect(verseIndexAt(p, 0)).toBe(0);
    expect(verseIndexAt(p, p.verseStarts[15] + 3)).toBe(15);
    expect(verseIndexAt(p, p.tokens.length - 1)).toBe(35);
  });
  it('tokenIndexFor clamps the word to the verse', () => {
    expect(tokenIndexFor(p, 16, 0)).toBe(p.verseStarts[15]);
    expect(tokenIndexFor(p, 16, 5)).toBe(p.verseStarts[15] + 5);
    expect(tokenIndexFor(p, 16, 99)).toBe(p.verseStarts[15] + 24);
  });
});

// Defensive: no shipped edition has an empty verse since Geneva 1599 (Verse 8ec8a9b).
describe('empty verse (synthetic, defensive)', () => {
  const p = buildPassage({ edition: 'gen', book: 'Revelation', chapter: 13, verses: [
    { v: 11, text: 'And I beheld another beast' }, { v: 12, text: '' }, { v: 13, text: 'And he doeth great wonders' },
  ] });
  it('empty verse has length 0 and the next verse’s start', () => {
    expect(p.verseLens).toEqual([5, 0, 5]);
    expect(p.verseStarts).toEqual([0, 5, 5]);
  });
  it('never reports the empty verse', () => {
    for (let i = 0; i < p.tokens.length; i += 1) expect(p.verseNums[verseIndexAt(p, i)]).not.toBe(12);
    expect(p.verseNums[verseIndexAt(p, 5)]).toBe(13);
  });
  it('seeking to the empty verse lands on the next one', () => {
    expect(tokenIndexFor(p, 12, 0)).toBe(5);
  });
});
