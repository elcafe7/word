// Forgiving book/reference parsing for the passage picker (SPEC-speed-scale §9).
// Book aliases come from index.json (Verse's BOOK_ALIASES via build_data.py); EXTRA_ALIASES adds
// common forms Verse lacks. Nothing here guesses silently: only an exact alias or a prefix that
// fits exactly one book resolves; anything else returns suggestions.
import { normalize } from './books.js';

/** Extra normalized aliases (lowercase a–z0–9), keyed by book abbr. */
export const EXTRA_ALIASES = Object.freeze({
  Gen: ['gnz'],
  Exod: ['exd'],
  Judg: ['jdgs', 'jg'],
  Ps: ['pss', 'psm', 'pslm', 'psalter'],
  Prov: ['prv'],
  Eccl: ['eccles', 'qoh', 'qoheleth'],
  Song: ['songofsongs', 'songs', 'sng', 'canticleofcanticles', 'sol'],
  Ezek: ['ezekial'],
  Obad: ['obd'],
  Matt: ['mtt'],
  Mark: ['mr'],
  Luke: ['luk'],
  John: ['jhn'],
  Phil: ['philip'],
  Phlm: ['philem', 'phile', 'phlmn'],
  Jas: ['jm', 'jms'],
  Rev: ['apocalypse', 'revel', 'rvl'],
});

const ORDINALS = { 1: 1, 2: 2, 3: 3, i: 1, ii: 2, iii: 3, first: 1, second: 2, third: 3, '1st': 1, '2nd': 2, '3rd': 3 };

/**
 * Split raw text into a book part and an optional chapter/verse tail.
 * Accepts 3:16, 3.16, "3 16", 3:16-18 (range end ignored), chapter-only, or a bare reference.
 * @param {string} text
 * @returns {{bookText: string, chapter: number|null, verse: number|null}}
 */
export function splitReference(text) {
  const s = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const tail = /(?:^|(?<=[a-z.])\s*|\s+)(\d{1,3})(?:\s*[:.]\s*(\d{1,3})|\s+(\d{1,3}))?(?:\s*[-–]\s*\d{1,3})?\s*\.?$/u;
  const m = s.match(tail);
  if (m) {
    const bookText = s.slice(0, m.index).trim();
    // "1 john" / "2" alone: a lone leading number is a book prefix, not a chapter.
    if (!(bookText === '' && m[2] === undefined && m[3] === undefined && /^[123]$/.test(m[1]) && s === m[1])) {
      return { bookText, chapter: Number(m[1]), verse: m[2] ?? m[3] ? Number(m[2] ?? m[3]) : null };
    }
  }
  return { bookText: s, chapter: null, verse: null };
}

/**
 * Normalize a typed book name: periods/spaces/case ignored; number prefixes 1/2/3, I/II/III,
 * first/second/third, 1st/2nd/3rd → digit. Roman and word prefixes need a space or period after them.
 * @param {string} bookText
 * @returns {string}
 */
export function bookKey(bookText) {
  const s = String(bookText ?? '').toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  let m = s.match(/^(first|second|third|1st|2nd|3rd|iii|ii|i)\s+(.*)$/u);
  if (m && m[2]) return `${ORDINALS[m[1]]}${normalize(m[2])}`;
  m = s.match(/^([123])\s*(.*)$/u);
  if (m) return `${m[1]}${normalize(m[2])}`;
  return normalize(s);
}

/** @param {import('./books.js').Book} b */
function keysOf(b) {
  return [...new Set([...b.aliases, normalize(b.name), normalize(b.slug), ...(EXTRA_ALIASES[b.abbr] ?? [])])];
}

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

const byRank = (key) => (x, y) => {
  const nx = normalize(x.name);
  const ny = normalize(y.name);
  const rx = nx.startsWith(key) ? 0 : 1;
  const ry = ny.startsWith(key) ? 0 : 1;
  return rx - ry || x.n - y.n;
};

/**
 * @typedef {{
 *   kind: 'empty'|'resolved'|'ambiguous'|'fuzzy'|'none',
 *   book: import('./books.js').Book|null,
 *   suggestions: import('./books.js').Book[],
 *   chapter: number|null, verse: number|null,
 *   error: string|null
 * }} ParseResult
 */

/**
 * @param {import('./books.js').Index} index
 * @param {string} text
 * @param {{abbr: string}|null} [current] used for a bare "3:16"
 * @returns {ParseResult}
 */
export function parseQuery(index, text, current = null) {
  const { bookText, chapter, verse } = splitReference(text);
  const out = { kind: 'none', book: null, suggestions: [], chapter, verse, error: null };
  if (!bookText && chapter === null) return { ...out, kind: 'empty' };
  let key = bookKey(bookText);
  if (!key) {
    const b = current ? index.books.find((x) => x.abbr === current.abbr) : null;
    if (!b) return out;
    return finish(index, { ...out, kind: 'resolved', book: b, suggestions: [b] });
  }
  // An ordinal on its own ("I", "ii", "second") means "a numbered book": suggest, never resolve.
  const ord = bookText.replace(/\./g, '').trim();
  if (Object.hasOwn(ORDINALS, ord)) {
    const d = String(ORDINALS[ord]);
    const list = index.books.filter((b) => b.abbr.startsWith(d));
    if (ord === 'i') list.unshift(...index.books.filter((b) => b.abbr === 'Isa'));
    return { ...out, kind: 'ambiguous', suggestions: list.slice(0, 8) };
  }
  const exact = index.books.filter((b) => keysOf(b).includes(key));
  if (exact.length === 1) return finish(index, { ...out, kind: 'resolved', book: exact[0], suggestions: exact });
  const pre = index.books.filter((b) => keysOf(b).some((k) => k.startsWith(key)));
  if (pre.length === 1 && key.replace(/^[123]/, '').length >= 1 && key.length >= 2) return finish(index, { ...out, kind: 'resolved', book: pre[0], suggestions: pre });
  if (pre.length > 0) return { ...out, kind: 'ambiguous', suggestions: pre.sort(byRank(key)).slice(0, 8) };
  if (key.length >= 3) {
    const tol = key.length >= 6 ? 2 : 1;
    const fz = index.books
      .map((b) => ({ b, d: Math.min(...keysOf(b).map((k) => lev(key, k.slice(0, Math.max(key.length, k.length <= key.length + 1 ? k.length : key.length))))) }))
      .filter((x) => x.d <= tol)
      .sort((x, y) => x.d - y.d || x.b.n - y.b.n)
      .slice(0, 8)
      .map((x) => x.b);
    if (fz.length) return { ...out, kind: 'fuzzy', suggestions: fz };
  }
  return out;
}

/** Apply chapter/verse checks to a resolved book. Single-chapter books read "Jude 5" as verse 5. */
function finish(index, r) {
  const b = r.book;
  let { chapter, verse } = r;
  if (chapter !== null && verse === null && b.verses.length === 1 && chapter > 1) {
    verse = chapter;
    chapter = 1;
  }
  let error = null;
  if (chapter !== null && (chapter < 1 || chapter > b.verses.length)) {
    error = `${b.name} has ${b.verses.length} chapter${b.verses.length === 1 ? '' : 's'}.`;
  } else if (chapter !== null && verse !== null && (verse < 1 || verse > b.verses[chapter - 1])) {
    error = `${b.name} ${chapter} has ${b.verses[chapter - 1]} verses.`;
  }
  return { ...r, chapter, verse, error };
}

/**
 * Validate a chapter/verse against a book (for a suggestion picked from an ambiguous list).
 * @returns {{chapter: number, verse: number}|null}
 */
export function refFor(book, chapter, verse) {
  if (chapter === null) return null;
  let c = chapter;
  let v = verse;
  if (v === null && book.verses.length === 1 && c > 1) {
    v = c;
    c = 1;
  }
  if (c < 1 || c > book.verses.length) return null;
  v = v ?? 1;
  if (v < 1 || v > book.verses[c - 1]) return null;
  return { chapter: c, verse: v };
}
