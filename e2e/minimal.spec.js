import { expect, test } from '@playwright/test';
import { openPassage, seed, tid, at, appReady } from './helpers.js';

const hiddenInMinimal = ['site-header', 'footer', 'btn-back', 'btn-forward', 'btn-settings', 'edition-select', 'speed-scale', 'status'];
const visibleInMinimal = ['card', 'word', 'btn-play', 'btn-minimal'];

test('M enters minimal mode; button exits; persists over reload', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await page.keyboard.press('m');
  await expect(page.locator('html')).toHaveClass(/minimal-mode/);
  for (const id of hiddenInMinimal) await expect(tid(page, id)).toBeHidden();
  for (const id of visibleInMinimal) await expect(tid(page, id)).toBeVisible();
  // No selector box in minimal mode (Nate, 2026-10-24): only the faint reference label.
  await expect(tid(page, 'minimal-ref')).toBeVisible();
  await expect(tid(page, 'minimal-ref')).toHaveText('John 3:16');
  expect(await page.evaluate(() => localStorage.getItem('word-minimal'))).toBe('1');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/minimal-mode/);
  await appReady(page); // minimal-mode is set by the inline head script before the app wires the buttons
  await tid(page, 'btn-minimal').click();
  await expect(page.locator('html')).not.toHaveClass(/minimal-mode/);
  for (const id of hiddenInMinimal) await expect(tid(page, id)).toBeVisible();
  await expect(tid(page, 'minimal-ref')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('word-minimal'))).toBe('0');
});

test('minimal-mode reference label is hidden when the reference bar is off', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('s')) {
      sessionStorage.setItem('s', '1');
      localStorage.setItem('word-settings', JSON.stringify({ v: 1, wpm: 300, frameSize: 1, redLetter: true, commaMult: 1.5, sentenceMult: 2, verseMult: 2.5, status: 'off' }));
      localStorage.setItem('word-minimal', '1');
    }
  });
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await expect(page.locator('html')).toHaveClass(/minimal-mode/);
  await expect(tid(page, 'status')).toBeHidden();
  await expect(tid(page, 'minimal-ref')).toBeHidden();
  await expect(tid(page, 'word')).toBeVisible();
});

test('speed slider is not present in minimal mode, stopped or playing; present in clear', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  const scale = tid(page, 'speed-scale');
  const slider = tid(page, 'wpm-slider');
  const notPresent = async () => {
    await expect(scale).toBeHidden();
    await expect(slider).toBeHidden();
    // display:none, not faded: no box, so it can't be seen, tapped or tabbed to.
    expect(await scale.evaluate((e) => getComputedStyle(e).display)).toBe('none');
    expect(await slider.evaluate((e) => e.getClientRects().length)).toBe(0);
  };
  // Clear mode, not minimal: the slider is there.
  await page.evaluate(() => localStorage.setItem('word-settings', JSON.stringify({ v: 1, wpm: 300, frameSize: 1, redLetter: true, commaMult: 1.5, sentenceMult: 2, verseMult: 2.5, status: 'clear' })));
  await page.reload();
  await expect(tid(page, 'status')).toHaveAttribute('data-mode', 'clear');
  await expect(scale).toBeVisible();
  await expect(slider).toBeVisible();
  // Minimal, stopped.
  await page.keyboard.press('m');
  await expect(page.locator('html')).toHaveClass(/minimal-mode/);
  await notPresent();
  // Minimal, playing.
  await tid(page, 'btn-play').click();
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
  await notPresent();
  await tid(page, 'btn-play').click();
  // Back to clear: visible again.
  await tid(page, 'btn-minimal').click();
  await expect(page.locator('html')).not.toHaveClass(/minimal-mode/);
  await expect(scale).toBeVisible();
  await expect(slider).toBeVisible();
});

for (const theme of ['dark', 'light']) {
  test(`minimal mode (${theme}): no selector box; faint, inert reference label at the top that follows the verse`, async ({ page }) => {
    await seed(page, { 'word-minimal': '1', 'word-theme': theme });
    await openPassage(page, at('/word/kjv/John-3-16'));
    await expect(page.locator('html')).toHaveClass(/minimal-mode/);
    // The selector box is gone (display:none, no box, no tab stop), and so are Prev/Next and the slider.
    const status = tid(page, 'status');
    expect(await status.evaluate((e) => getComputedStyle(e).display)).toBe('none');
    expect(await status.evaluate((e) => e.getClientRects().length)).toBe(0);
    for (const id of ['btn-back', 'btn-forward', 'speed-scale', 'wpm-slider']) await expect(tid(page, id)).toBeHidden();
    const label = tid(page, 'minimal-ref');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('John 3:16');
    await expect(label).toHaveAttribute('aria-hidden', 'true');
    const css = await label.evaluate((e) => {
      const c = getComputedStyle(e);
      return { pe: c.pointerEvents, op: Number(c.opacity), pos: c.position, tag: e.tagName, focusable: e.tabIndex >= 0 || !!e.querySelector('a,button,input,[tabindex]') };
    });
    expect(css.pe).toBe('none');
    expect(css.op).toBeGreaterThanOrEqual(0.25);
    expect(css.op).toBeLessThanOrEqual(0.35);
    expect(css.pos).toBe('fixed');
    expect(css.focusable).toBe(false);
    // At the top of the screen, above the card, and not covering it.
    const lb = await label.boundingBox();
    const cb = await tid(page, 'card').boundingBox();
    expect(lb.y).toBeLessThan(60);
    expect(lb.y + lb.height).toBeLessThanOrEqual(cb.y);
    // A click on the label goes through to the page; it never opens the picker.
    await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await expect(tid(page, 'picker')).toBeHidden();
    // Keys still move by verse, and the label follows.
    await page.keyboard.press('ArrowRight');
    await expect(label).toHaveText('John 3:17');
    await page.keyboard.press('ArrowLeft');
    await expect(label).toHaveText('John 3:16');
    // Back to normal mode: label gone, selector back.
    await page.keyboard.press('m');
    await expect(label).toBeHidden();
    await expect(status).toBeVisible();
  });
}
