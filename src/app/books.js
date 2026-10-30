// Library index: loading, book lookup, canonical order.

/* global __BUILD_ID__ */
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

/**
 * @typedef {{n: number, name: string, abbr: string, slug: string, testament: string, aliases: string[], verses: number[]}} Book
 * @typedef {{id: string, name: string, short: string, attribution: string}} Edition
 * @typedef {{schema: number, dataVersion: string, editions: Edition[], books: Book[]}} Index
 */

export class LoadError extends Error {
  /** @param {'network'|'http'|'rate'|'json'} kind @param {number} [status] */
  constructor(kind, status = 0) {
    super(`load failed: ${kind}${status ? ` ${status}` : ''}`);
    this.kind = kind;
    this.status = status;
  }
}

/** GET a JSON URL; throws LoadError. */
export async function fetchJson(fetchFn, url, init) {
  let res;
  try {
    res = await fetchFn(url, init);
  } catch (e) {
    if (e && e.status === 429) throw new LoadError('rate', 429);
    throw new LoadError('network');
  }
  if (!res || !res.ok) {
    const status = res ? res.status : 0;
    throw new LoadError(status === 429 ? 'rate' : 'http', status);
  }
  try {
    return await res.json();
  } catch {
    throw new LoadError('json');
  }
}

/**
 * @param {typeof fetch} fetchFn
 * @param {string} base e.g. "/word/"
 * @returns {Promise<Index>}
 */
export async function loadIndex(fetchFn, base) {
  const ix = await fetchJson(fetchFn, `${base}data/index.json?v=${BUILD_ID}`, { cache: 'no-cache' });
  if (!ix || !Array.isArray(ix.books) || ix.books.length !== 66 || !Array.isArray(ix.editions)) {
    throw new LoadError('json');
  }
  return ix;
}

export function normalize(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** @param {Index} index @param {string} text @returns {Book|null} */
export function findBook(index, text) {
  const q = normalize(text);
  if (!q) return null;
  return index.books.find((b) => b.aliases.includes(q)) ?? index.books.find((b) => normalize(b.name) === q) ?? null;
}

/** Verse's suggestion rule: prefix → 0, substring → 1; then name length, then name. Max 8. */
export function rankBooks(index, query) {
  const q = normalize(query);
  if (!q) return [];
  return index.books
    .map((b) => {
      const n = normalize(b.name);
      return { b, r: n.startsWith(q) ? 0 : n.includes(q) ? 1 : 2 };
    })
    .filter((x) => x.r < 2)
    .sort((x, y) => x.r - y.r || x.b.name.length - y.b.name.length || (x.b.name < y.b.name ? -1 : x.b.name > y.b.name ? 1 : 0))
    .slice(0, 8)
    .map((x) => x.b);
}

/** @param {Index} index @param {string} abbr */
export function bookByAbbr(index, abbr) {
  return index.books.find((b) => b.abbr === abbr) ?? null;
}

/** @param {Index} index @param {string} id */
export function editionById(index, id) {
  return index.editions.find((e) => e.id === id) ?? null;
}

/** Next chapter in canonical order, or null after Revelation 22. */
export function nextChapter(index, abbr, ch) {
  const b = bookByAbbr(index, abbr);
  if (!b) return null;
  if (ch < b.verses.length) return { abbr, chapter: ch + 1 };
  const nb = index.books.find((x) => x.n === b.n + 1);
  return nb ? { abbr: nb.abbr, chapter: 1 } : null;
}

/** Previous chapter in canonical order, or null before Genesis 1. */
export function prevChapter(index, abbr, ch) {
  const b = bookByAbbr(index, abbr);
  if (!b) return null;
  if (ch > 1) return { abbr, chapter: ch - 1 };
  const pb = index.books.find((x) => x.n === b.n - 1);
  return pb ? { abbr: pb.abbr, chapter: pb.verses.length } : null;
}

/** Previous verse reference (by verse numbers), or null at Genesis 1:1. */
export function prevVerse(index, abbr, ch, v) {
  if (v > 1) return { abbr, chapter: ch, verse: v - 1 };
  const p = prevChapter(index, abbr, ch);
  if (!p) return null;
  return { ...p, verse: bookByAbbr(index, p.abbr).verses[p.chapter - 1] };
}

/** Next verse reference, or null at Revelation 22:21. */
export function nextVerse(index, abbr, ch, v) {
  const b = bookByAbbr(index, abbr);
  if (b && v < b.verses[ch - 1]) return { abbr, chapter: ch, verse: v + 1 };
  const n = nextChapter(index, abbr, ch);
  return n ? { ...n, verse: 1 } : null;
}
