// Word RSVP engine — original code written for Word (not derived from any third-party RSVP project).
import { clamp, isWordChar, letterCount, nextAbove, uniqueSorted } from './rsvp-utils.js';
import { punctuationKind } from './pacing.js';

/**
 * Index (UTF-16) of the optimal recognition point letter in a word.
 * Counts only letters/digits: 1 → 1st, 2–5 → 2nd, 6–9 → 3rd, 10–13 → 4th, longer → 5th.
 * @param {string} word
 */
export function getActualORPIndex(word) {
  const s = String(word);
  const positions = [];
  for (let i = 0; i < s.length; i += 1) if (isWordChar(s[i])) positions.push(i);
  if (!positions.length) return 0;
  const n = positions.length;
  const k = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
  return positions[k];
}

/**
 * Which word of a multi-word frame carries the focal letter: the longest (first on ties).
 * @param {string[]} words
 */
export function pickPivot(words) {
  let best = 0;
  for (let i = 1; i < words.length; i += 1) {
    if (letterCount(words[i]) > letterCount(words[best])) best = i;
  }
  return best;
}

/**
 * Exclusive end of the frame that starts at `start`: at most `size` words, never past a
 * paragraph start, and never past a word that ends in punctuation (so pauses land on frame ends).
 * @param {string[]} tokens
 * @param {number} start
 * @param {number} size
 * @param {number[]|{sorted: number[]}} paraStarts
 */
export function frameEnd(tokens, start, size, paraStarts) {
  const sorted = Array.isArray(paraStarts) ? uniqueSorted(paraStarts) : paraStarts.sorted;
  const limit = Math.min(tokens.length, start + Math.max(1, size), nextAbove(sorted, start));
  let end = Math.min(start + 1, tokens.length);
  while (end < limit && !punctuationKind(tokens[end - 1])) end += 1;
  return end;
}

/**
 * A window of up to `count` tokens around `center` (for the Brake strip).
 * @param {string[]} tokens
 * @param {number} center
 * @param {number} count
 * @returns {{start: number, end: number, words: string[]}}
 */
export function extractWordFrame(tokens, center, count) {
  const n = Math.min(count, tokens.length);
  const start = clamp(center - Math.floor(n / 2), 0, Math.max(0, tokens.length - n));
  const end = start + n;
  return { start, end, words: tokens.slice(start, end) };
}

/**
 * Split a frame into the text before the focal letter, the letter, and the text after.
 * @param {string[]} words
 */
export function splitFrame(words) {
  if (!words.length) return { before: '', orp: '', after: '' };
  const p = pickPivot(words);
  const w = words[p];
  const o = getActualORPIndex(w);
  const before = words.slice(0, p).map((x) => `${x} `).join('') + w.slice(0, o);
  const after = w.slice(o + 1) + words.slice(p + 1).map((x) => ` ${x}`).join('');
  return { before, orp: w[o] ?? '', after };
}
