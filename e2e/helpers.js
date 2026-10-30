// Shared e2e helpers.
import { expect } from '@playwright/test';
import { BASE } from './target.js';

export { BASE, ORIGIN } from './target.js';

/** Specs are written against /word/; at() maps a path to the configured base (WORD_BASE / WORD_E2E_URL). */
export const at = (p) => p.replace(/^\/word\//, BASE);
/** Route glob for a path under the base, e.g. g('data/index.json*'). */
export const g = (rest) => `**${BASE}${rest}`;
/** A /\/word\/…/ RegExp rewritten for the configured base. */
export const rx = (re) => new RegExp(re.source.replace(/^\\\/word\\\//, BASE.replace(/[/.]/g, (c) => `\\${c}`)), re.flags);
export const tid = (page, id) => page.locator(`[data-testid="${id}"]`);

/** Wait until the app has hydrated and rendered a frame (after goto/reload). The inline head script applies
 *  theme/minimal classes before the app JS runs, so class checks alone don't mean the buttons are wired yet;
 *  on a remote origin the data JSON round trips make that gap ~1 s. */
export async function appReady(page) {
  await expect(tid(page, 'word')).not.toHaveAttribute('data-count', '0');
}

/** Seed localStorage before the app script runs. */
export async function seed(page, values) {
  await page.addInitScript((v) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    for (const [k, val] of Object.entries(v)) localStorage.setItem(k, typeof val === 'string' ? val : JSON.stringify(val));
  }, values);
}

export const settings = (patch) => ({ v: 1, wpm: 300, frameSize: 1, redLetter: true, commaMult: 1.5, sentenceMult: 2.0, verseMult: 2.5, status: 'semi', ...patch });

export async function openPassage(page, path, status) {
  await page.goto(path);
  // The shell ships with placeholder text; data-count leaves "0" once the app has rendered a frame.
  await expect(tid(page, 'word')).not.toHaveAttribute('data-count', '0');
  if (status) await expectPosition(page, status);
}

/**
 * The closed selector shows only the reference ("John 3:16"); the edition lives in the header select and in the
 * selector's accessible name ("John 3:16, KJV, change passage"). `pos` is written "John 3:16 · KJV".
 */
export async function expectPosition(page, pos, opts) {
  const [ref, ed] = pos.split(' · ');
  await expect(tid(page, 'status-text')).toHaveText(ref, opts);
  if (ed) await expect(tid(page, 'status')).toHaveAttribute('aria-label', `${ref}, ${ed}, change passage`, opts);
}

export async function readIndex(page) {
  return Number(await tid(page, 'word').getAttribute('data-index'));
}

/** Collect console errors and page errors. */
export function trackErrors(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** Token starts of each verse in a chapter JSON (whitespace split, matching the app). */
export async function verseStarts(page, url) {
  return page.evaluate(async (u) => {
    const j = await (await fetch(u)).json();
    const out = [];
    let acc = 0;
    for (const v of j.verses) {
      out.push(acc);
      acc += v.text.split(/\s+/).filter(Boolean).length;
    }
    return out;
  }, url);
}
