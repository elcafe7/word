import { expect, test } from '@playwright/test';
import { openPassage, tid, verseStarts, rx, at, expectPosition } from './helpers.js';

test('(a) John 3:16 opens paused on "For"; play reaches 3:17 in 6–9 s and updates the URL', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  // SPEC §10.4: data-index is chapter-local, so word 0 of 3:16 is the token start of verse 16 (T6(a) says 0; see DECISIONS.md).
  const starts = await verseStarts(page, at('/word/data/kjv/John/3.json'));
  await expect(tid(page, 'word')).toHaveAttribute('data-index', String(starts[15]));
  await expect(tid(page, 'word')).toHaveText('For');
  await expect(tid(page, 'orp')).toHaveText('o');
  await expect(page).toHaveTitle('John 3:16 (KJV) — Word');
  const t0 = Date.now();
  await tid(page, 'btn-play').click();
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
  await expectPosition(page, 'John 3:17 · KJV', { timeout: 12000 });
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeGreaterThan(6000);
  expect(elapsed).toBeLessThan(9000);
  await expect(page).toHaveURL(rx(/\/word\/kjv\/John-3-17$/));
});

test('(b) deep links open the right edition and canonicalize the URL', async ({ page }) => {
  await openPassage(page, at('/word/kj16/Genesis-2-19'), 'Genesis 2:19 · KJV 1611');
  await expect(tid(page, 'word')).toHaveText('And');
  await openPassage(page, at('/word/gen/Ps-23-1'), 'Psalm 23:1 · Geneva');
  await expect(page).toHaveURL(rx(/\/word\/gen\/Psalm-23-1$/));
  await expect(tid(page, 'word')).toHaveText('A');
});

test('(c) a passage outside the edition shows the error card', async ({ page }) => {
  await page.goto(at('/word/kjv/John-3-99'));
  await expect(tid(page, 'error-card')).toBeVisible();
  await expect(tid(page, 'error-card').locator('p')).toHaveText("That passage isn't in KJV.");
  await expect(tid(page, 'error-retry')).toHaveText('Go to John 3:16');
  await tid(page, 'error-retry').click();
  await expectPosition(page, 'John 3:16 · KJV');
  await expect(page).toHaveURL(rx(/\/word\/kjv\/John-3-16$/));
});

test('(c2) an unknown edition segment falls back to the default (Geneva) and canonicalizes', async ({ page }) => {
  await openPassage(page, at('/word/esv/John-3-16'), 'John 3:16 · Geneva');
  await expect(page).toHaveURL(rx(/\/word\/gen\/John-3-16$/));
});

test('(d) footer attribution follows the edition select', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await expect(tid(page, 'attribution')).toHaveText('King James Version (Oxford 1769) · Public domain text');
  const opts = await tid(page, 'edition-select').locator('option').allTextContents();
  expect(opts).toEqual(['KJV — King James Version (Oxford 1769)', 'KJ16 — King James Version (1611 Original)', 'GEN — Geneva Bible (1599)']);
  const before = await page.evaluate(() => history.length);
  await tid(page, 'edition-select').selectOption('kj16');
  await expect(tid(page, 'attribution')).toHaveText('King James Version (1611 Original) · Public domain text');
  await expectPosition(page, 'John 3:16 · KJV 1611');
  await expect(page).toHaveURL(rx(/\/word\/kj16\/John-3-16$/));
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
});

test('(e) red-letter ticks are visible and centred on the card', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  const card = await tid(page, 'card').boundingBox();
  const cx = card.x + card.width / 2;
  for (const id of ['tick-top', 'tick-bottom']) {
    await expect(tid(page, id)).toBeVisible();
    const b = await tid(page, id).boundingBox();
    expect(Math.abs(b.x + b.width / 2 - cx)).toBeLessThanOrEqual(1);
  }
  const orp = await tid(page, 'orp').boundingBox();
  expect(Math.abs(orp.x + orp.width / 2 - cx)).toBeLessThanOrEqual(2);
});

test('ends: Genesis 1:1 disables Previous; Revelation 22:21 disables Next', async ({ page }) => {
  await openPassage(page, at('/word/kjv/Genesis-1-1'), 'Genesis 1:1 · KJV');
  await expect(tid(page, 'btn-back')).toBeDisabled();
  await expect(tid(page, 'btn-back')).toContainText('Start of text');
  await openPassage(page, at('/word/kjv/Revelation-22-21'), 'Revelation 22:21 · KJV');
  await expect(tid(page, 'btn-forward')).toBeDisabled();
  await expect(tid(page, 'btn-forward')).toContainText('End of text');
});
