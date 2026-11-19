import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { booksForEdition, findBook, loadIndex, nextChapter, nextVerse, prevChapter, prevVerse, rankBooks } from '../../src/app/books.js';

const mini = JSON.parse(readFileSync('tests/fixtures/index.mini.json', 'utf8'));
const full = JSON.parse(readFileSync('public/data/index.json', 'utf8'));

describe('findBook', () => {
  it.each([
    ['ps', 'Psalm'], ['Psalms', 'Psalm'], ['PSA', 'Psalm'], ['song of solomon', 'Song of Solomon'], ['canticles', 'Song of Solomon'],
    ['1jn', '1 John'], ['1 John', '1 John'], ['Revelations', 'Revelation'], ['John', 'John'], ['gen', 'Genesis'],
  ])('%s → %s', (q, name) => expect(findBook(mini, q)?.name).toBe(name));
  it('returns null for unknown books and empty text', () => {
    expect(findBook(mini, 'Hezekiah')).toBeNull();
    expect(findBook(mini, '')).toBeNull();
    expect(findBook(mini, '--')).toBeNull();
  });
});

describe('rankBooks', () => {
  it('matches Verse /api/books?q=jo on the real index', () => {
    expect(rankBooks(full, 'jo').map((b) => b.name)).toEqual(['Job', 'Joel', 'John', 'Jonah', 'Joshua', '1 John', '2 John', '3 John']);
  });
  it('ps → Psalm first; empty query → []', () => {
    expect(rankBooks(full, 'ps')[0].name).toBe('Psalm');
    expect(rankBooks(full, '')).toEqual([]);
  });
  it('caps at 8', () => {
    expect(rankBooks(full, 'e').length).toBe(8);
  });
});

describe('canonical order', () => {
  it('next/prev chapter cross book boundaries and stop at the ends', () => {
    expect(nextChapter(full, 'John', 3)).toEqual({ abbr: 'John', chapter: 4 });
    expect(nextChapter(full, 'Mal', 4)).toEqual({ abbr: 'Matt', chapter: 1 });
    expect(nextChapter(full, 'Rev', 22)).toBeNull();
    expect(prevChapter(full, 'Matt', 1)).toEqual({ abbr: 'Mal', chapter: 4 });
    expect(prevChapter(full, 'Gen', 1)).toBeNull();
  });
  it('next/prev verse', () => {
    expect(nextVerse(full, 'John', 3, 36)).toEqual({ abbr: 'John', chapter: 4, verse: 1 });
    expect(prevVerse(full, 'Ps', 23, 1)).toEqual({ abbr: 'Ps', chapter: 22, verse: 31 });
    expect(prevVerse(full, 'Gen', 1, 1)).toBeNull();
    expect(nextVerse(full, 'Rev', 22, 21)).toBeNull();
  });
});

describe('Apocrypha books (between the Testaments)', () => {
  const editionIndex = (id) => ({ ...full, books: booksForEdition(full, id), apocrypha: undefined });

  it('loadIndex accepts the 66 plus an edition\'s Apocrypha', async () => {
    const ix = editionIndex('gen');
    const out = await loadIndex(async () => ({ ok: true, status: 200, json: async () => ix }), '/word/');
    expect(out.books.length).toBe(66 + full.apocrypha.gen.length);
  });

  it.each([
    ['gen', 'Tob', 'Tobit', 7],
    ['kj16', '1Esd', '1 Esdras', 14],
  ])('%s: Malachi → first Apocrypha (%s), last Apocrypha → Matthew, Revelation 22:21 is the end', (id, firstAbbr, firstName, nApoc) => {
    const ix = editionIndex(id);
    const apoc = full.apocrypha[id];
    const last = apoc[apoc.length - 1];
    expect(ix.books.length).toBe(66 + nApoc);
    expect(ix.books[39].name).toBe(firstName); // after Malachi (index 38)
    expect(ix.books[39 + nApoc].abbr).toBe('Matt');
    expect(ix.books.at(-1).abbr).toBe('Rev');
    expect(findBook(ix, 'sirach')?.name).toBe('Ecclesiasticus');
    expect(nextVerse(ix, 'Mal', 4, 6)).toEqual({ abbr: firstAbbr, chapter: 1, verse: 1 });
    expect(prevVerse(ix, firstAbbr, 1, 1)).toEqual({ abbr: 'Mal', chapter: 4, verse: 6 });
    expect(nextVerse(ix, last.abbr, last.verses.length, last.verses.at(-1))).toEqual({ abbr: 'Matt', chapter: 1, verse: 1 });
    expect(prevVerse(ix, 'Matt', 1, 1)).toEqual({ abbr: last.abbr, chapter: last.verses.length, verse: last.verses.at(-1) });
    expect(nextVerse(ix, 'Rev', 22, 21)).toBeNull();
    expect(nextChapter(ix, 'Rev', 22)).toBeNull();
  });

  it('the shared index and the Oxford KJV stay the Protestant 66', () => {
    expect(booksForEdition(full, 'kjv').map((b) => b.abbr)).toEqual(full.books.map((b) => b.abbr));
    expect(nextVerse(full, 'Mal', 4, 6)).toEqual({ abbr: 'Matt', chapter: 1, verse: 1 });
    expect(nextVerse(full, 'Rev', 22, 21)).toBeNull();
  });
});

describe('loadIndex', () => {
  it('fetches index.json with no-cache and a cache-buster', async () => {
    const calls = [];
    const ix = await loadIndex(async (url, init) => {
      calls.push([url, init]);
      return { ok: true, status: 200, json: async () => full };
    }, '/word/');
    expect(ix.books.length).toBe(66);
    expect(calls[0][0]).toMatch(/^\/word\/data\/index\.json\?v=\w+$/);
    expect(calls[0][1]).toEqual({ cache: 'no-cache' });
  });
  it('rejects non-200, network errors and bad JSON', async () => {
    await expect(loadIndex(async () => ({ ok: false, status: 500 }), '/word/')).rejects.toMatchObject({ kind: 'http' });
    await expect(loadIndex(async () => { throw new TypeError('x'); }, '/word/')).rejects.toMatchObject({ kind: 'network' });
    await expect(loadIndex(async () => ({ ok: true, json: async () => { throw new SyntaxError('x'); } }), '/word/')).rejects.toMatchObject({ kind: 'json' });
    await expect(loadIndex(async () => ({ ok: true, json: async () => ({}) }), '/word/')).rejects.toMatchObject({ kind: 'json' });
  });
});
