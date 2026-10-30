import { expect, test } from '@playwright/test';
import { openPassage, readIndex, tid, rx, at } from './helpers.js';

test('(a) pause then reload /word/ → same verse and word exactly', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'btn-play').click();
  await page.waitForTimeout(3000);
  await tid(page, 'btn-play').click();
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
  const idx = await readIndex(page);
  const status = await tid(page, 'status-text').textContent();
  await page.goto(at('/word/'));
  await expect(tid(page, 'word')).toHaveAttribute('data-index', String(idx));
  await expect(tid(page, 'status-text')).toHaveText(status);
  await expect(page).toHaveURL(rx(/\/word\/kjv\/John-3-1[67]$/));
});

test('(b) reload while playing resumes within ±1 word', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'btn-play').click();
  await page.waitForTimeout(3000);
  const before = await readIndex(page);
  await page.reload();
  await expect(tid(page, 'word')).not.toHaveAttribute('data-count', '0');
  const after = await readIndex(page);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
});

test('(c) a different deep link opens at word 0', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'btn-play').click();
  await page.waitForTimeout(2000);
  await tid(page, 'btn-play').click();
  await openPassage(page, at('/word/kjv/Genesis-1-1'), 'Genesis 1:1 · KJV');
  await expect(tid(page, 'word')).toHaveAttribute('data-index', '0');
  await expect(tid(page, 'word')).toHaveText('In');
});
