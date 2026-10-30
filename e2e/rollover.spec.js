import { expect, test } from '@playwright/test';
import { openPassage, seed, settings, tid, rx, at, expectPosition } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await seed(page, { 'word-settings': settings({ wpm: 900 }) });
});

test('(a) prefetch John 4 only past 80% of John 3, exactly once, then roll over', async ({ page }) => {
  let count = 0;
  page.on('request', (r) => {
    if (rx(/\/word\/data\/kjv\/John\/4\.json/).test(r.url())) count += 1;
  });
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'btn-play').click();
  await page.waitForTimeout(2000);
  expect(count).toBe(0);
  await openPassage(page, at('/word/kjv/John-3-34'), 'John 3:34 · KJV');
  await tid(page, 'btn-play').click();
  await expectPosition(page, 'John 4:1 · KJV', { timeout: 20000 });
  expect(count).toBe(1);
  const tag = await page.locator('html').getAttribute('data-prefetch');
  const m = /^kjv\/John\/4@(\d+)\/(\d+)$/.exec(tag);
  expect(m).not.toBeNull();
  expect(Number(m[1]) / Number(m[2])).toBeGreaterThanOrEqual(0.8);
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
});

test('(b) Jude 1:25 rolls into Revelation 1:1', async ({ page }) => {
  await openPassage(page, at('/word/kjv/Jude-1-25'), 'Jude 1:25 · KJV');
  await tid(page, 'btn-play').click();
  await expectPosition(page, 'Revelation 1:1 · KJV', { timeout: 15000 });
});

test('(c) Revelation 22:21 ends: ended state, Next disabled, status unchanged', async ({ page }) => {
  await openPassage(page, at('/word/kjv/Revelation-22-21'), 'Revelation 22:21 · KJV');
  await tid(page, 'btn-play').click();
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'ended', { timeout: 10000 });
  await expect(tid(page, 'btn-forward')).toBeDisabled();
  await expectPosition(page, 'Revelation 22:21 · KJV');
  await expect(tid(page, 'word')).toHaveText('Amen.');
  await tid(page, 'btn-play').click();
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
  await expect(tid(page, 'word')).toHaveText('The');
});
