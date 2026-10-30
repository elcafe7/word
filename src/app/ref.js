// URL paths ↔ passages (SPEC §6.5).
import { findBook } from './books.js';

export const EDITION_IDS = ['kjv', 'kj16', 'gen'];

/** Edition shown on a first visit and used when no valid edition is known: Geneva Bible (1599). */
/* global __WORD_OFFLINE__, __WORD_OFFLINE_EDITION__ */
export const DEFAULT_EDITION = typeof __WORD_OFFLINE__ !== 'undefined' && __WORD_OFFLINE__ ? __WORD_OFFLINE_EDITION__ : 'gen';

/**
 * @returns {{edition: string|null, abbr: string, chapter: number, verse: number}|{error: 'bad-ref'}|null}
 */
export function parsePath(pathname, base, index) {
  let rest = String(pathname ?? '');
  const bare = base.replace(/\/$/, '');
  if (rest.startsWith(base)) rest = rest.slice(base.length);
  else if (rest === bare) rest = '';
  else return null;
  let segs;
  try {
    segs = rest.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  } catch {
    return { error: 'bad-ref' };
  }
  if (segs.length === 0) return null;
  if (segs.length > 2) return { error: 'bad-ref' };
  let edition = null;
  if (segs.length === 2) {
    const e = segs[0].toLowerCase();
    edition = EDITION_IDS.includes(e) ? e : null;
  }
  const m = /^(.+)-(\d+)-(\d+)$/.exec(segs[segs.length - 1]);
  if (!m) return { error: 'bad-ref' };
  const book = findBook(index, m[1].replace(/-/g, ' '));
  const chapter = Number(m[2]);
  const verse = Number(m[3]);
  if (!book || chapter < 1 || chapter > book.verses.length || verse < 1 || verse > book.verses[chapter - 1]) {
    return { error: 'bad-ref' };
  }
  return { edition, abbr: book.abbr, chapter, verse };
}

/** Canonical path, e.g. /word/kjv/John-3-16 */
export function formatPath(base, edition, book, chapter, verse) {
  return `${base}${edition}/${book.slug}-${chapter}-${verse}`;
}

/** "John 3:16" */
export function display(book, chapter, verse) {
  const name = typeof book === 'string' ? book : book.name;
  return `${name} ${chapter}:${verse}`;
}
