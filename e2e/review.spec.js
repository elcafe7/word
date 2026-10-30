// Review screenshots: review-shots/{phone|desktop}-{dark|light}-{NN-state}.png
// Desktop shots are taken at 1440×900 (DPR 1); phone at 390×844 (DPR 2, iPhone-class).
import { expect, test } from '@playwright/test';
import { openPassage, seed, settings, tid, g, at, expectPosition } from './helpers.js';

const DIR = 'review-shots';

for (const theme of ['dark', 'light']) {
  test.describe(`review ${theme}`, () => {
    test.describe.configure({ mode: 'parallel' });
    let prefix = '';
    test.beforeEach(async ({ page }, info) => {
      if (info.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
      prefix = `${DIR}/${info.project.name}-${theme}`;
    });
    const shot = (page, name, fullPage = false) => page.screenshot({ path: `${prefix}-${name}.png`, fullPage, animations: 'disabled', caret: 'hide' });
    const base = (extra = {}) => ({ 'word-theme': theme, ...extra });

    test('01 paused, 02 playing', async ({ page }) => {
      await seed(page, base());
      await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
      await page.mouse.move(1, 1);
      await shot(page, '01-paused');
      await tid(page, 'btn-play').click();
      await page.waitForTimeout(2000);
      await shot(page, '02-playing');
    });

    test('03 group of 3', async ({ page }) => {
      await seed(page, base({ 'word-settings': settings({ frameSize: 3 }) }));
      await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
      await tid(page, 'btn-forward').click();
      await expectPosition(page, 'John 3:17 · KJV');
      await page.mouse.move(1, 1);
      await shot(page, '03-group3');
    });

    test('04 settings', async ({ page }) => {
      await seed(page, base());
      await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
      await tid(page, 'btn-settings').click();
      await expect(tid(page, 'settings-panel')).toBeVisible();
      await shot(page, '04-settings');
    });

    test('05 picker books, 06 picker verses', async ({ page }) => {
      await seed(page, base());
      await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
      await tid(page, 'status').click();
      await expect(tid(page, 'picker-book')).toHaveCount(66);
      await page.mouse.move(1, 1);
      await shot(page, '05-picker-books');
      await tid(page, 'picker-book').filter({ hasText: /^John$/ }).click();
      await tid(page, 'picker-chapter').filter({ hasText: /^3$/ }).click();
      await expect(tid(page, 'picker-verse')).toHaveCount(36);
      await shot(page, '06-picker-verses');
    });

    test('07 minimal', async ({ page }) => {
      await seed(page, base({ 'word-minimal': '1' }));
      await openPassage(page, at('/word/kjv/Psalm-23-1'), 'Psalm 23:1 · KJV');
      await page.mouse.move(1, 1);
      await shot(page, '07-minimal');
    });

    test('08 brake', async ({ page }) => {
      await seed(page, base());
      await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
      await page.keyboard.press('ArrowRight');
      await expectPosition(page, 'John 3:17 · KJV');
      const b = await tid(page, 'stage').boundingBox();
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      await tid(page, 'stage').dispatchEvent('pointerdown', { pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0 });
      await page.waitForTimeout(400);
      await tid(page, 'stage').dispatchEvent('pointermove', { pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: x - 128, clientY: y, button: 0 });
      await expect(tid(page, 'brake-strip')).toBeVisible();
      await shot(page, '08-brake');
    });

    test('09 error (passage not in edition)', async ({ page }) => {
      await seed(page, base());
      await page.goto(at('/word/kjv/John-3-99'));
      await expect(tid(page, 'error-card')).toBeVisible();
      await page.mouse.move(1, 1);
      await shot(page, '09-error');
    });

    test('10 reference bar off', async ({ page }) => {
      await seed(page, base({ 'word-settings': settings({ status: 'off' }) }));
      await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
      await page.mouse.move(1, 1);
      await shot(page, '10-status-off');
    });

    test('11 library error, 12 rate-limit error (extra)', async ({ page }) => {
      await seed(page, base());
      await page.route(g('data/index.json*'), (r) => r.abort());
      await page.goto(at('/word/kjv/John-3-16'));
      await expect(tid(page, 'error-card')).toBeVisible();
      await page.mouse.move(1, 1);
      await shot(page, '11-error-library');
      await page.unroute(g('data/index.json*'));
      await page.route(g('data/kjv/Rom/8.json*'), (r) => r.fulfill({ status: 429, body: '' }));
      await page.goto(at('/word/kjv/Romans-8-28'));
      await expect(tid(page, 'error-card')).toBeVisible();
      await shot(page, '12-error-rate');
    });
  });
}
