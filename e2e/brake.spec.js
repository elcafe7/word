import { expect, test } from '@playwright/test';
import { openPassage, readIndex, tid, at, expectPosition } from './helpers.js';

async function center(page) {
  const b = await tid(page, 'stage').boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function hold(page, isMobile, ms, dx) {
  const c = await center(page);
  if (!isMobile) {
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await expect(tid(page, 'brake-strip')).toBeVisible();
    return {
      move: async () => page.mouse.move(c.x + dx, c.y, { steps: 4 }),
      up: async () => page.mouse.up(),
    };
  }
  const fire = (type, x) => tid(page, 'stage').dispatchEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: c.y, button: 0, bubbles: true });
  await fire('pointerdown', c.x);
  await page.waitForTimeout(ms);
  await expect(tid(page, 'brake-strip')).toBeVisible();
  return {
    move: async () => {
      for (let k = 1; k <= 4; k += 1) await fire('pointermove', c.x + (dx * k) / 4);
    },
    up: async () => fire('pointerup', c.x + dx),
  };
}

test('Brake: hold shows the strip at the current word; drag left 64px → +2 words', async ({ page, isMobile }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
  const i = await readIndex(page);
  const h = await hold(page, isMobile, 400, -64);
  await expect(page.locator('[data-testid="strip-word"].current')).toHaveAttribute('data-index', String(i));
  await h.move();
  await expect(page.locator('[data-testid="strip-word"].current')).toHaveAttribute('data-index', String(i + 2));
  await h.up();
  await expect(tid(page, 'brake-strip')).toBeHidden();
  await expect(tid(page, 'word')).toHaveAttribute('data-index', String(i + 2));
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
});

test('a short tap on the stage toggles playback', async ({ page, isMobile }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  const c = await center(page);
  if (isMobile) await page.touchscreen.tap(c.x, c.y);
  else {
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
  }
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
  if (isMobile) await page.touchscreen.tap(c.x, c.y);
  else await page.mouse.click(c.x, c.y, { delay: 100 });
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
});

test('keys: Space, arrows, T, M, Esc; ignored in the picker filter', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await page.keyboard.press('Space');
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
  await page.keyboard.press('Space');
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await page.keyboard.press('ArrowRight');
  await expectPosition(page, 'John 3:17 · KJV');
  await page.keyboard.press('ArrowLeft');
  await expectPosition(page, 'John 3:16 · KJV');
  await page.keyboard.press('ArrowLeft');
  await expectPosition(page, 'John 3:15 · KJV');
  const theme = await page.locator('html').getAttribute('data-theme');
  await page.keyboard.press('t');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', theme);
  await page.keyboard.press('m');
  await expect(page.locator('html')).toHaveClass(/minimal-mode/);
  await page.keyboard.press('m');
  await expect(page.locator('html')).not.toHaveClass(/minimal-mode/);
  await tid(page, 'btn-settings').click();
  await expect(tid(page, 'settings-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tid(page, 'settings-panel')).toBeHidden();
  await page.keyboard.press('ArrowUp');
  await expect(tid(page, 'btn-play')).toContainText('325 WPM');
  await page.keyboard.press('ArrowDown');
  await expect(tid(page, 'btn-play')).toContainText('300 WPM');
  await tid(page, 'status').click();
  await tid(page, 'picker-book-filter').focus();
  await page.keyboard.type('mt');
  await page.keyboard.press('Space');
  await expect(page.locator('html')).not.toHaveClass(/minimal-mode/);
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
  await expect(tid(page, 'picker-book-filter')).toHaveValue('mt ');
  await page.keyboard.press('Escape');
  await expect(tid(page, 'picker')).toBeHidden();
});
