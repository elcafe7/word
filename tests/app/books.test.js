import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findBook, loadIndex, nextChapter, nextVerse, prevChapter, prevVerse, rankBooks } from '../../src/app/books.js';

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
