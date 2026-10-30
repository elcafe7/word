import { expect, test } from '@playwright/test';
import { openPassage, tid, trackErrors, at, expectPosition } from './helpers.js';

for (const scheme of ['dark', 'light']) {
  test.describe(`shell (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test('Verse look: tokens, chrome at full opacity, card frame, serif word', async ({ page }) => {
      const errors = trackErrors(page);
      await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
      const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
      if (scheme === 'dark') expect(bodyBg).toContain('radial-gradient');
      const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
      expect(bg).toBe(scheme === 'dark' ? '#1c2027' : '#ffffff');
      await page.mouse.move(0, 799);
      expect(await tid(page, 'site-header').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
      expect(await tid(page, 'footer').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
      expect(await tid(page, 'card').evaluate((e) => getComputedStyle(e).borderRadius)).toBe('3px');
      expect(await tid(page, 'word').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Iowan Old Style');
      expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe(scheme === 'dark' ? '#1c2027' : '#ffffff');
      expect(errors).toEqual([]);
    });
  });
}

test('body background is the radial-gradient recipe in dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toContain('radial-gradient');
});

test('no side arrows on the card; labelled Previous/Next buttons and ←/→ keys still change verse', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  // Removed 2026-10-23 (Nate): no arrow buttons hang off the verse card, at any width.
  await expect(page.locator('.nav-side, [data-testid="btn-back-side"], [data-testid="btn-forward-side"]')).toHaveCount(0);
  expect(await tid(page, 'card').locator('button').count()).toBe(1); // only the passage (status) button
  await expect(tid(page, 'btn-back')).toContainText('Previous verse');
  await expect(tid(page, 'btn-forward')).toContainText('Next verse');
  await tid(page, 'btn-forward').click();
  await expectPosition(page, 'John 3:17 · KJV');
  await tid(page, 'btn-back').click();
  await expectPosition(page, 'John 3:16 · KJV');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('ArrowRight');
  await expectPosition(page, 'John 3:17 · KJV');
  await page.keyboard.press('ArrowLeft');
  await expectPosition(page, 'John 3:16 · KJV');
  // Minimal mode hides the Previous/Next buttons; the keys still work there.
  await page.keyboard.press('m');
  await expect(page.locator('html')).toHaveClass(/minimal-mode/);
  await page.keyboard.press('ArrowRight');
  await expectPosition(page, 'John 3:17 · KJV');
  await page.keyboard.press('ArrowLeft');
  await expectPosition(page, 'John 3:16 · KJV');
});
