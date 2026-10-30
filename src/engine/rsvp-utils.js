// Word RSVP engine — original code written for Word (not derived from any third-party RSVP project).

/** @param {number} v @param {number} lo @param {number} hi */
export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

const CLOSERS = /["'’”)\]]+$/u;

/** Strip closing quotes/brackets from the end of a word. */
export function stripClosers(word) {
  return String(word).replace(CLOSERS, '');
}

/** True for a letter or digit character. */
export function isWordChar(ch) {
  return /[\p{L}\p{N}]/u.test(ch);
}

/** Count letters/digits in a word. */
export function letterCount(word) {
  let n = 0;
  for (const ch of String(word)) if (isWordChar(ch)) n += 1;
  return n;
}

/**
 * Sorted, de-duplicated copy of paragraph start indices.
 * @param {number[]} starts
 */
export function uniqueSorted(starts) {
  return [...new Set(starts)].sort((a, b) => a - b);
}

/** First value in sorted `arr` strictly greater than `x`, or Infinity. */
export function nextAbove(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo < arr.length ? arr[lo] : Infinity;
}
