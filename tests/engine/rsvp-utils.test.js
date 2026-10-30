import { describe, expect, it } from 'vitest';
import { clamp, letterCount, nextAbove, stripClosers, uniqueSorted } from '../../src/engine/rsvp-utils.js';

describe('rsvp-utils', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it('stripClosers removes trailing quotes and brackets', () => {
    expect(stripClosers('life.’”')).toBe('life.');
    expect(stripClosers('(him)')).toBe('(him');
  });
  it('letterCount counts letters and digits including non-ASCII', () => {
    expect(letterCount('wing’d,')).toBe(5);
    expect(letterCount('þ')).toBe(1);
    expect(letterCount('&')).toBe(0);
  });
  it('uniqueSorted', () => {
    expect(uniqueSorted([5, 0, 5, 2])).toEqual([0, 2, 5]);
  });
  it('nextAbove', () => {
    expect(nextAbove([0, 3, 7], 0)).toBe(3);
    expect(nextAbove([0, 3, 7], 3)).toBe(7);
    expect(nextAbove([0, 3, 7], 7)).toBe(Infinity);
  });
});
