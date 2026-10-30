import { expect, test } from '@playwright/test';
import { openPassage, seed, settings, tid, g, at, expectPosition } from './helpers.js';

test('429 at rollover → rate message; retry after recovery → John 4:1 paused', async ({ page }) => {
  await seed(page, { 'word-settings': settings({ wpm: 900 }) });
  const pattern = g('data/kjv/John/4.json*');
  await page.route(pattern, (route) => route.fulfill({ status: 429, body: 'slow down' }));
  await openPassage(page, at('/word/kjv/John-3-36'), 'John 3:36 · KJV');
  await tid(page, 'btn-play').click();
  await expect(tid(page, 'error-card')).toBeVisible({ timeout: 15000 });
  await expect(tid(page, 'error-card').locator('p')).toHaveText('Too many requests. Wait a minute, then try again.');
  await page.unroute(pattern);
  await tid(page, 'error-retry').click();
  await expectPosition(page, 'John 4:1 · KJV');
  await expect(tid(page, 'error-card')).toBeHidden();
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
});

test('other chapter failures name the chapter', async ({ page }) => {
  await page.route(g('data/kjv/John/3.json*'), (route) => route.fulfill({ status: 500, body: 'no' }));
  await page.goto(at('/word/kjv/John-3-16'));
  await expect(tid(page, 'error-card').locator('p')).toHaveText("Couldn't load John 3 (KJV). Try again.");
});

test('library failure shows only the library error; retry recovers', async ({ page }) => {
  await page.route(g('data/index.json*'), (route) => route.abort());
  await page.goto(at('/word/kjv/John-3-16'));
  await expect(tid(page, 'error-card').locator('p')).toHaveText("Word couldn't load its library. Check your connection and try again.");
  await expect(tid(page, 'card')).toBeHidden();
  await expect(tid(page, 'btn-play')).toBeHidden();
  await page.unroute(g('data/index.json*'));
  await tid(page, 'error-retry').click();
  await expectPosition(page, 'John 3:16 · KJV');
  await expect(tid(page, 'btn-play')).toBeVisible();
});

test('storage unavailable → runs with defaults, no error UI', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
  });
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await expect(tid(page, 'error-card')).toBeHidden();
  await expect(tid(page, 'btn-play')).toContainText('300 WPM');
});
