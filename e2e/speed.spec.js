// Speed scale (SPEC-speed-scale): the always-visible WPM slider under the playback buttons.
import { expect, test } from '@playwright/test';
import { openPassage, seed, settings, tid, at, expectPosition } from './helpers.js';

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('word-settings') || 'null'));

test('scale is visible with the 100 / 500 / 900 marks and the saved value', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await expect(tid(page, 'speed-scale')).toBeVisible();
  const s = tid(page, 'wpm-slider');
  await expect(s).toHaveAttribute('min', '100');
  await expect(s).toHaveAttribute('max', '900');
  await expect(s).toHaveAttribute('step', '25');
  await expect(s).toHaveValue('300');
  await expect(tid(page, 'wpm-value')).toHaveText('300');
  await expect(tid(page, 'speed-scale')).toContainText('100');
  await expect(tid(page, 'speed-scale')).toContainText('500');
  await expect(tid(page, 'speed-scale')).toContainText('900');
});

test('moving the scale saves, updates the play label and the settings slider, and survives reload', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'wpm-slider').fill('600');
  await expect(tid(page, 'wpm-value')).toHaveText('600');
  await expect(tid(page, 'btn-play')).toContainText('600 WPM');
  expect((await stored(page)).wpm).toBe(600);
  await expect(tid(page, 'setting-wpm')).toHaveValue('600');
  await page.reload();
  await expect(tid(page, 'wpm-slider')).toHaveValue('600');
  await expect(tid(page, 'wpm-value')).toHaveText('600');
});

test('settings slider and arrow keys move the scale too', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'btn-settings').click();
  await tid(page, 'setting-wpm').fill('450');
  await expect(tid(page, 'wpm-slider')).toHaveValue('450');
  await tid(page, 'btn-settings-close').click();
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('ArrowUp');
  await expect(tid(page, 'wpm-slider')).toHaveValue('475');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(tid(page, 'wpm-value')).toHaveText('425');
  expect((await stored(page)).wpm).toBe(425);
});

test('scale stops at 100 and 900', async ({ page }) => {
  await seed(page, { 'word-settings': settings({ wpm: 900 }) });
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await expect(tid(page, 'wpm-slider')).toHaveValue('900');
  await page.keyboard.press('ArrowUp');
  await expect(tid(page, 'wpm-value')).toHaveText('900');
  await tid(page, 'wpm-slider').fill('100');
  await expect(tid(page, 'btn-play')).toContainText('100 WPM');
  await page.keyboard.press('ArrowDown');
  expect((await stored(page)).wpm).toBe(100);
});

test('a bad saved WPM shows the default on the scale', async ({ page }) => {
  await seed(page, { 'word-settings': settings({ wpm: 950 }) });
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await expect(tid(page, 'wpm-slider')).toHaveValue('300');
});

test('after using the scale, Space still plays and the new speed applies', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  const s = tid(page, 'wpm-slider');
  await s.fill('900');
  await s.dispatchEvent('change');
  await expect(s).not.toBeFocused();
  await page.keyboard.press('Space');
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
  // John 3:16 → 3:17 takes 6.6 s at 300 WPM but 2.2 s at 900 WPM (SPEC §6.4 fixture).
  await expectPosition(page, 'John 3:17 · KJV', { timeout: 4500 });
});

test('changing speed while playing keeps playing', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'btn-play').click();
  await tid(page, 'wpm-slider').fill('700');
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
  await expect(tid(page, 'btn-play')).toContainText('700 WPM');
});

test('hidden in minimal mode; arrow keys still change speed there', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await page.keyboard.press('m');
  await expect(page.locator('html')).toHaveClass(/minimal-mode/);
  await expect(tid(page, 'speed-scale')).toBeHidden();
  await page.keyboard.press('ArrowUp');
  expect((await stored(page)).wpm).toBe(325);
  await page.keyboard.press('m');
  await expect(tid(page, 'wpm-slider')).toHaveValue('325');
});

test('a horizontal drag on the scale does not change verse', async ({ page, browserName }, info) => {
  test.skip(info.project.name !== 'phone', 'touch only');
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  const box = await tid(page, 'wpm-slider').boundingBox();
  const y = box.y + box.height / 2;
  await page.evaluate(({ x0, x1, y }) => {
    const el = document.querySelector('[data-testid="wpm-slider"]');
    const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, changedTouches: [t(x0)], touches: [t(x0)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [t(x1)], touches: [] }));
  }, { x0: box.x + 10, x1: box.x + box.width - 10, y });
  await page.waitForTimeout(300);
  await expectPosition(page, 'John 3:16 · KJV');
});

// Review shots for the speed-scale handoff (only when SPEED_SHOTS is set).
test('speed-scale review shots', async ({ page }, info) => {
  const dir = process.env.SPEED_SHOTS;
  test.skip(!dir, 'set SPEED_SHOTS=<dir> to write screenshots');
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
  for (const theme of ['dark', 'light']) {
    await page.context().clearCookies();
    await page.goto(at('/word/'));
    await page.evaluate((t) => { localStorage.clear(); localStorage.setItem('word-welcome-seen', '1'); localStorage.setItem('word-theme', t); }, theme);
    await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
    await tid(page, 'wpm-slider').fill('450');
    await page.mouse.move(1, 1);
    await page.screenshot({ path: `${dir}/${info.project.name}-${theme}-speed-scale.png`, animations: 'disabled', caret: 'hide' });
    await tid(page, 'speed-scale').screenshot({ path: `${dir}/${info.project.name}-${theme}-speed-scale-closeup.png`, animations: 'disabled' });
  }
});
