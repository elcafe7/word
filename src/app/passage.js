// One chapter as a token stream with verse bookkeeping (SPEC §6.2).
import { buildTokens, tokenizeParagraph } from '../engine/tokenizer.js';

/**
 * @param {{edition: string, book: string, chapter: number, verses: {v: number, text: string}[]}} chapterJson
 */
export function buildPassage(chapterJson) {
  const verses = chapterJson.verses;
  const { tokens, paraStarts, chapters } = buildTokens([{ title: '', paragraphs: verses.map((v) => v.text) }]);
  const verseNums = verses.map((v) => v.v);
  const verseLens = verses.map((v) => tokenizeParagraph(v.text).length);
  const verseStarts = [];
  let acc = 0;
  for (const n of verseLens) {
    verseStarts.push(acc);
    acc += n;
  }
  return {
    edition: chapterJson.edition, book: chapterJson.book, chapter: chapterJson.chapter,
    tokens, paraStarts, chapters, verseNums, verseStarts, verseLens,
  };
}

/** Largest verse i with tokens and verseStarts[i] ≤ tokenIndex (0 if none). */
export function verseIndexAt(passage, tokenIndex) {
  let found = -1;
  for (let i = 0; i < passage.verseStarts.length; i += 1) {
    if (passage.verseStarts[i] > tokenIndex) break;
    if (passage.verseLens[i] > 0) found = i;
  }
  if (found >= 0) return found;
  const first = passage.verseLens.findIndex((n) => n > 0);
  return first >= 0 ? first : 0;
}

/** Token index of `word` within verse number `verse` (empty verse → start of the next verse). */
export function tokenIndexFor(passage, verse, word = 0) {
  let i = passage.verseNums.indexOf(verse);
  if (i < 0) i = 0;
  const len = passage.verseLens[i];
  const start = passage.verseStarts[i];
  const t = len > 0 ? start + Math.min(Math.max(0, word), len - 1) : start;
  return Math.min(t, Math.max(0, passage.tokens.length - 1));
}
