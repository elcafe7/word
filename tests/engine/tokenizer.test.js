import { describe, expect, it } from 'vitest';
import { buildTokens, tokenizeParagraph } from '../../src/engine/tokenizer.js';

describe('tokenizeParagraph', () => {
  it('splits on any whitespace and drops empties', () => {
    expect(tokenizeParagraph('  In the\tbeginning\nGod  ')).toEqual(['In', 'the', 'beginning', 'God']);
  });
  it('returns [] for empty, null and whitespace-only text', () => {
    expect(tokenizeParagraph('')).toEqual([]);
    expect(tokenizeParagraph(null)).toEqual([]);
    expect(tokenizeParagraph('   ')).toEqual([]);
  });
  it('keeps punctuation attached', () => {
    expect(tokenizeParagraph('world, that he gaue')).toEqual(['world,', 'that', 'he', 'gaue']);
  });
});

describe('buildTokens', () => {
  it('flattens paragraphs and records their starts', () => {
    const r = buildTokens([{ title: '', paragraphs: ['a b c', 'd e', 'f'] }]);
    expect(r.tokens).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(r.paraStarts).toEqual([0, 3, 5]);
    expect(r.chapters).toEqual([{ title: '', start: 0 }]);
  });
  it('gives an empty paragraph the same start as the next one', () => {
    const r = buildTokens([{ paragraphs: ['a b', '', 'c'] }]);
    expect(r.paraStarts).toEqual([0, 2, 2]);
  });
  it('handles several chapters', () => {
    const r = buildTokens([{ title: 'One', paragraphs: ['a'] }, { title: 'Two', paragraphs: ['b c'] }]);
    expect(r.chapters).toEqual([{ title: 'One', start: 0 }, { title: 'Two', start: 1 }]);
  });
});
