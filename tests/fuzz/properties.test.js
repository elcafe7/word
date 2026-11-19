// Property-based ("fuzz") tests with fast-check for the code that handles typed or
// stored input: reference parsing, tokenizing, percent clamping. They run in the
// normal `npm test`, with a fixed seed so a CI failure reproduces; set
// FAST_CHECK_RUNS to run many more cases locally. This is also what the OpenSSF
// Scorecard "Fuzzing" check looks for in a JavaScript project.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clampPct, PCT_MAX, PCT_MIN } from '../../src/app/tune.js';
import { bookKey, splitReference } from '../../src/app/refparse.js';
import { parsePath } from '../../src/app/ref.js';
import { buildTokens, tokenizeParagraph } from '../../src/engine/tokenizer.js';
import { clamp, letterCount, stripClosers } from '../../src/engine/rsvp-utils.js';

const numRuns = Number(process.env.FAST_CHECK_RUNS) || 500;
const opts = { seed: 20261119, numRuns };

// Two-book stand-in for public/data/index.json (that file is generated, not committed).
const index = {
  books: [
    { abbr: 'Gen', name: 'Genesis', slug: 'Genesis', aliases: ['gen', 'genesis'], verses: [31, 25] },
    { abbr: 'John', name: 'John', slug: 'John', aliases: ['jn', 'john'], verses: [51, 25, 36] },
  ],
};

describe('fuzz: typed references', () => {
  it('splitReference never throws and returns sane numbers', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        const r = splitReference(text);
        expect(typeof r.bookText).toBe('string');
        for (const n of [r.chapter, r.verse]) {
          expect(n === null || (Number.isInteger(n) && n >= 0 && n <= 999)).toBe(true);
        }
      }),
      opts,
    );
  });

  it('bookKey never throws and returns a lower-case string', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        const k = bookKey(text);
        expect(typeof k).toBe('string');
        expect(k).toBe(k.toLowerCase());
      }),
      opts,
    );
  });

  it('parsePath only returns a valid verse, an error, or null', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (rest) => {
        const r = parsePath(`/word/${rest}`, '/word/', index);
        if (r === null || 'error' in r) return;
        const book = index.books.find((b) => b.abbr === r.abbr);
        expect(book).toBeTruthy();
        expect(r.chapter).toBeGreaterThanOrEqual(1);
        expect(r.chapter).toBeLessThanOrEqual(book.verses.length);
        expect(r.verse).toBeGreaterThanOrEqual(1);
        expect(r.verse).toBeLessThanOrEqual(book.verses[r.chapter - 1]);
      }),
      opts,
    );
  });
});

describe('fuzz: tokenizing and numbers', () => {
  it('tokens are non-empty, hold no whitespace, and keep every non-space character', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        const tokens = tokenizeParagraph(text);
        for (const t of tokens) expect(/^\S+$/u.test(t)).toBe(true);
        expect(tokens.join('')).toBe(text.replace(/\s+/g, ''));
      }),
      opts,
    );
  });

  it('buildTokens paragraph starts are sorted and inside the token list', () => {
    fc.assert(
      fc.property(fc.array(fc.array(fc.string(), { maxLength: 5 }), { maxLength: 5 }), (chapters) => {
        const built = buildTokens(chapters.map((paragraphs) => ({ paragraphs })));
        expect(built.paraStarts).toEqual([...built.paraStarts].sort((x, y) => x - y));
        for (const s of built.paraStarts) expect(s).toBeLessThanOrEqual(built.tokens.length);
      }),
      opts,
    );
  });

  it('clampPct always lands on a whole number inside the allowed range', () => {
    fc.assert(
      fc.property(fc.anything(), (v) => {
        const n = clampPct(v);
        expect(Number.isInteger(n) && n >= PCT_MIN && n <= PCT_MAX).toBe(true);
      }),
      opts,
    );
  });

  it('clamp stays between its bounds', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), fc.integer({ min: -1000, max: 0 }), fc.integer({ min: 0, max: 1000 }), (v, lo, hi) => {
        const n = clamp(v, lo, hi);
        expect(n >= lo && n <= hi).toBe(true);
      }),
      opts,
    );
  });

  it('letterCount and stripClosers never throw and never grow the input', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (w) => {
        expect(letterCount(w)).toBeLessThanOrEqual([...w].length);
        expect(stripClosers(w).length).toBeLessThanOrEqual(w.length);
      }),
      opts,
    );
  });
});
