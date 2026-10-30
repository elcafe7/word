// Default edition on load (Nate, 2026-10-24 10:09 ET): a first visit opens Geneva at John 3:16;
// a saved position (localStorage word-position) still wins for returning visitors.
import { expect, test } from '@playwright/test';
import { appReady, at, expectPosition, rx, seed, tid } from './helpers.js';

const pos = (edition, abbr, chapter, verse, word = 0) => ({ v: 1, edition, abbr, chapter, verse, word, updatedAt: 1 });

test('fresh load of /word/ opens Geneva at John 3:16, and the picker starts on Geneva', async ({ page }) => {
  await page.goto(at('/word/'));
  await appReady(page);
  await expectPosition(page, 'John 3:16 · Geneva');
  await expect(tid(page, 'word')).toHaveText('For');
  await expect(tid(page, 'edition-value')).toContainText('Geneva');
  await expect(tid(page, 'attribution')).toHaveText('Geneva Bible (1599) · Public domain text');
  await expect(page).toHaveURL(rx(/\/word\/(gen\/John-3-16)?$/));
  // No position was stored before this load; the one the app saves now is Geneva.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('word-position') || 'null')?.edition ?? null)).toBe('gen');
  await tid(page, 'status').click();
  await expect(tid(page, 'picker')).toBeVisible();
  await expect(tid(page, 'picker-edition-gen')).toHaveAttribute('aria-pressed', 'true');
  await expect(tid(page, 'picker-edition-kjv')).toHaveAttribute('aria-pressed', 'false');
});

test('a saved KJV position still wins over the Geneva default', async ({ page }) => {
  await seed(page, { 'word-position': pos('kjv', 'Rom', 8, 28, 2) });
  await page.goto(at('/word/'));
  await appReady(page);
  await expectPosition(page, 'Romans 8:28 · KJV');
  await expect(tid(page, 'edition-value')).toContainText('KJV');
  await page.reload();
  await appReady(page);
  await expectPosition(page, 'Romans 8:28 · KJV');
});

test('a saved position with an unknown edition falls back to Geneva at John 3:16', async ({ page }) => {
  await seed(page, { 'word-position': pos('esv', 'Rom', 8, 28) });
  await page.goto(at('/word/'));
  await appReady(page);
  await expectPosition(page, 'John 3:16 · Geneva');
});
