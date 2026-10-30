import { describe, expect, it } from 'vitest';
import { getActualORPIndex, pickPivot, splitFrame } from '../../src/engine/frames.js';

describe('getActualORPIndex', () => {
  it.each([
    ['a', 0], ['For', 1], ['God', 1], ['world,', 1], ['begotten', 2], ['everlasting', 3], ['acknowledgeth', 3], ['circumcisionisms', 4],
  ])('%s → %i', (w, i) => expect(getActualORPIndex(w)).toBe(i));
  it('skips leading punctuation', () => {
    expect(getActualORPIndex('“For')).toBe(2);
    expect(getActualORPIndex('(but)')).toBe(2);
  });
  it('returns 0 for a word with no letters', () => {
    expect(getActualORPIndex('&')).toBe(0);
  });
});

describe('pickPivot', () => {
  it('picks the longest word, first on ties', () => {
    expect(pickPivot(['For'])).toBe(0);
    expect(pickPivot(['God', 'so', 'loved'])).toBe(2);
    expect(pickPivot(['the', 'and'])).toBe(0);
  });
});

describe('splitFrame', () => {
  it('single word', () => {
    expect(splitFrame(['For'])).toEqual({ before: 'F', orp: 'o', after: 'r' });
  });
  it('multi-word keeps spaces around the pivot', () => {
    expect(splitFrame(['God', 'so', 'loved'])).toEqual({ before: 'God so l', orp: 'o', after: 'ved' });
    expect(splitFrame(['beginning', 'God'])).toEqual({ before: 'be', orp: 'g', after: 'inning God' });
  });
  it('empty', () => {
    expect(splitFrame([])).toEqual({ before: '', orp: '', after: '' });
  });
});
