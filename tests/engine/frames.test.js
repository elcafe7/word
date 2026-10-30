import { describe, expect, it } from 'vitest';
import { extractWordFrame, frameEnd } from '../../src/engine/frames.js';

const tokens = ['For', 'God', 'so', 'loved', 'the', 'world,', 'that', 'he', 'gave', 'his', 'only', 'Son.', 'For', 'God', 'sent'];
const paras = [0, 12];

describe('frameEnd', () => {
  it('size 1 is one word', () => {
    expect(frameEnd(tokens, 0, 1, paras)).toBe(1);
  });
  it('size 3 groups up to three words', () => {
    expect(frameEnd(tokens, 0, 3, paras)).toBe(3);
  });
  it('stops after punctuation', () => {
    expect(frameEnd(tokens, 4, 3, paras)).toBe(6);
  });
  it('never crosses a paragraph start', () => {
    expect(frameEnd(tokens, 10, 3, paras)).toBe(12);
    expect(frameEnd(tokens, 11, 3, [0, 12])).toBe(12);
  });
  it('stops at the end of the tokens', () => {
    expect(frameEnd(tokens, 14, 3, paras)).toBe(15);
  });
  it('treats duplicate paragraph starts (empty paragraphs) correctly', () => {
    expect(frameEnd(['a', 'b', 'c'], 0, 3, [0, 2, 2])).toBe(2);
  });
  it('accepts a pre-sorted object', () => {
    expect(frameEnd(tokens, 10, 3, { sorted: [0, 12] })).toBe(12);
  });
});

describe('extractWordFrame', () => {
  it('centers the window', () => {
    const r = extractWordFrame(tokens, 7, 5);
    expect(r).toEqual({ start: 5, end: 10, words: tokens.slice(5, 10) });
  });
  it('clamps at the start and end', () => {
    expect(extractWordFrame(tokens, 0, 5).start).toBe(0);
    expect(extractWordFrame(tokens, 14, 5)).toMatchObject({ start: 10, end: 15 });
  });
  it('shrinks when there are fewer tokens than requested', () => {
    expect(extractWordFrame(['a', 'b'], 1, 15)).toEqual({ start: 0, end: 2, words: ['a', 'b'] });
  });
});
