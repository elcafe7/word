import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EDITION, display, EDITION_IDS, formatPath, parsePath } from '../../src/app/ref.js';
import { bookByAbbr } from '../../src/app/books.js';

const index = JSON.parse(readFileSync('tests/fixtures/index.mini.json', 'utf8'));
const B = '/word/';

describe('parsePath', () => {
  it.each([
    ['/word/kjv/John-3-16', { edition: 'kjv', abbr: 'John', chapter: 3, verse: 16 }],
    ['/word/KJ16/1-John-2-23', { edition: 'kj16', abbr: '1John', chapter: 2, verse: 23 }],
    ['/word/gen/Ps-23-1', { edition: 'gen', abbr: 'Ps', chapter: 23, verse: 1 }],
    ['/word/John-3-16', { edition: null, abbr: 'John', chapter: 3, verse: 16 }],
    ['/word/esv/John-3-16', { edition: null, abbr: 'John', chapter: 3, verse: 16 }],
    ['/word/gen/Song-of-Solomon-2-1', { edition: 'gen', abbr: 'Song', chapter: 2, verse: 1 }],
  ])('%s', (p, want) => expect(parsePath(p, B, index)).toEqual(want));

  it.each(['/word/kjv/Hezekiah-1-1', '/word/kjv/John-22-1', '/word/kjv/John-3-37', '/word/kjv/John-3', '/word/a/b/c-1-1', '/word/kjv/John-0-1'])(
    '%s → bad-ref', (p) => expect(parsePath(p, B, index)).toEqual({ error: 'bad-ref' }),
  );

  it('no passage → null', () => {
    expect(parsePath('/word/', B, index)).toBeNull();
    expect(parsePath('/word', B, index)).toBeNull();
    expect(parsePath('/other/', B, index)).toBeNull();
  });
});

describe('formatPath / display', () => {
  it('round-trips through parsePath', () => {
    for (const [ed, abbr, ch, v] of [['kjv', 'John', 3, 16], ['kj16', '1John', 2, 23], ['gen', 'Song', 2, 1], ['kjv', 'Ps', 23, 1], ['kjv', 'Rev', 22, 21]]) {
      const p = formatPath(B, ed, bookByAbbr(index, abbr), ch, v);
      expect(parsePath(p, B, index)).toEqual({ edition: ed, abbr, chapter: ch, verse: v });
    }
    expect(formatPath(B, 'kjv', bookByAbbr(index, 'Ps'), 23, 1)).toBe('/word/kjv/Psalm-23-1');
    expect(formatPath(B, 'gen', bookByAbbr(index, 'Song'), 2, 1)).toBe('/word/gen/Song-of-Solomon-2-1');
  });
  it('display', () => {
    expect(display(bookByAbbr(index, 'John'), 3, 16)).toBe('John 3:16');
    expect(display('1 John', 2, 23)).toBe('1 John 2:23');
  });
});

describe('other bases (apocalypse.press /word-test/ migration build)', () => {
  const T = '/word-test/';
  it('parses and formats under /word-test/', () => {
    expect(parsePath('/word-test/kjv/John-3-16', T, index)).toEqual({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 16 });
    expect(parsePath('/word-test/', T, index)).toBeNull();
    expect(parsePath('/word-test', T, index)).toBeNull();
    expect(formatPath(T, 'gen', bookByAbbr(index, 'Ps'), 23, 1)).toBe('/word-test/gen/Psalm-23-1');
  });
  it('a /word/ path is not a passage under /word-test/ and vice versa', () => {
    expect(parsePath('/word/kjv/John-3-16', T, index)).toBeNull();
    expect(parsePath('/word-test/kjv/John-3-16', B, index)).toBeNull();
  });
});

describe('DEFAULT_EDITION', () => {
  it('is Geneva (gen), a known edition id', () => {
    expect(DEFAULT_EDITION).toBe('gen');
    expect(EDITION_IDS).toContain(DEFAULT_EDITION);
  });
});
