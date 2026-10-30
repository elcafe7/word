// Word RSVP engine — original code written for Word (not derived from any third-party RSVP project).
import { stripClosers } from './rsvp-utils.js';

/** Number of words over which playback ramps from half to full speed after every play(). */
export const RAMP_WORDS = 10;

/**
 * Punctuation class of a word's ending.
 * @param {string} word
 * @returns {'sentence'|'comma'|null}
 */
export function punctuationKind(word) {
  const w = stripClosers(word);
  if (/[.!?]$/u.test(w)) return 'sentence';
  if (/[,;:—–]$/u.test(w)) return 'comma';
  return null;
}

/**
 * Speed factor for the n-th word shown since play(): 0.5, 0.55 … 0.95, then 1.
 * @param {number} n
 */
export function rampSpeed(n) {
  return n < RAMP_WORDS ? 0.5 + (0.5 * n) / RAMP_WORDS : 1;
}

/**
 * Display time in ms for one frame.
 * Each word costs 60000/wpm; the last word is multiplied by its pause (comma, sentence,
 * or `para` when the frame ends a paragraph/verse — whichever is larger); every word is
 * slowed by the ramp factor for its position since play().
 * @param {{words: string[], wpm: number, mults: {comma: number, sentence: number, para: number}, paraEnd: boolean, rampStep?: number}} o
 */
export function frameDelay({ words, wpm, mults, paraEnd, rampStep = 0 }) {
  const base = 60000 / wpm;
  let total = 0;
  words.forEach((w, k) => {
    let m = 1;
    if (k === words.length - 1) {
      const kind = punctuationKind(w);
      if (kind === 'sentence') m = mults.sentence;
      else if (kind === 'comma') m = mults.comma;
      if (paraEnd) m = Math.max(m, mults.para);
    }
    total += (base * m) / rampSpeed(rampStep + k);
  });
  return Math.round(total * 10) / 10;
}
