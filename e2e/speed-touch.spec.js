// Speed scale touch zone (Nate, 2026-10-24): an invisible zone ~3x the slider's size. A touch
// near the thumb grabs it (no jump), a tap on the wider track band sets the value, vertical
// swipes still scroll, and the Play / Minimal buttons keep their own taps. Runs on phone
// (Chromium touch), iphone-webkit (iPhone 13 WebKit) and desktop (mouse + layout checks).
import { expect, test } from '@playwright/test';
import { openPassage, tid, at } from './helpers.js';

const touchOnly = (info) => test.skip(info.project.name === 'desktop', 'touch only');

/** Range rect, thumb size and the thumb centre for the current value (same formula as speed.js). */
async function geom(page) {
  return page.evaluate(() => {
    const i = /** @type {HTMLInputElement} */ (document.querySelector('[data-testid="wpm-slider"]'));
    const r = i.getBoundingClientRect();
    const t = Math.min(28, Math.max(16, r.height));
    const xOf = (w) => r.left + t / 2 + ((w - 100) / 800) * (r.width - t);
    const p = document.querySelector('[data-testid="speed-scale"]').getBoundingClientRect();
    return { left: r.left, width: r.width, top: r.top, height: r.height, cy: r.top + r.height / 2, t, x: xOf(Number(i.value)), at: [100, 300, 500, 700, 900].map(xOf), panel: { left: p.left, top: p.top, right: p.right, bottom: p.bottom } };
  });
}

/** Synthetic touch pointer sequence on whatever element is really under each point. */
async function touchDrag(page, pts) {
  await page.evaluate((pts) => {
    let target = null;
    pts.forEach(([type, x, y]) => {
      if (type === 'pointerdown') target = document.elementFromPoint(x, y);
      (target || document.body).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
    });
  }, pts);
}

const value = (page) => tid(page, 'wpm-slider').inputValue().then(Number);

for (const [name, dx, dy] of [['above', 0, -1], ['below', 0, 1], ['to the side', 1, 0], ['diagonally', 0.7, -0.7]]) {
  test(`a touch ~1 thumb width ${name} the thumb grabs it without a jump and drags it`, async ({ page }, info) => {
    touchOnly(info);
    await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
    const g = await geom(page);
    // 0.9 thumb widths beyond the drawn thumb's edge (centre distance 1.4 t, zone radius 1.5 t).
    const d = g.t / 2 + 0.9 * g.t;
    const x = g.x + dx * d;
    const y = g.cy + dy * d;
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="speed-scale"]'), [x, y])).toBe(true);
    // A real tap there (browser hit testing + touch → pointer) leaves the value alone: grabbed, not jumped.
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(100);
    expect(await value(page)).toBe(300);
    // Drag right by the distance from 300 to 500 on the scale: the thumb follows the finger.
    const shift = g.at[2] - g.at[1];
    await touchDrag(page, [['pointerdown', x, y], ['pointermove', x + 2, y], ['pointermove', x + shift / 2, y], ['pointermove', x + shift, y + 3], ['pointerup', x + shift, y + 3]]);
    await expect(tid(page, 'wpm-value')).toHaveText('500');
    await expect(tid(page, 'btn-play')).toContainText('500 WPM');
    await expectNoVerseChange(page);
  });
}

async function expectNoVerseChange(page) {
  await expect(tid(page, 'status-text')).toHaveText('John 3:16');
}

test('a tap on the wide track band (above and below the track) sets the value there', async ({ page }, info) => {
  touchOnly(info);
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  let g = await geom(page);
  const band = Math.max(48, g.height * 3) / 2;
  expect(band * 2).toBeGreaterThanOrEqual(48);
  await page.touchscreen.tap(g.at[3], g.cy - band + 3);
  await expect(tid(page, 'wpm-value')).toHaveText('700');
  g = await geom(page);
  await page.touchscreen.tap(g.at[0], g.cy + band - 3);
  await expect(tid(page, 'wpm-value')).toHaveText('100');
  await expect(tid(page, 'btn-play')).toContainText('100 WPM');
});

test('a vertical swipe over the scale leaves the speed alone and the panel lets the page pan vertically', async ({ page }, info) => {
  touchOnly(info);
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  const g = await geom(page);
  expect(await tid(page, 'speed-scale').evaluate((e) => getComputedStyle(e).touchAction)).toBe('pan-y');
  for (const x of [g.x + 10, g.at[3]]) {
    await touchDrag(page, [['pointerdown', x, g.cy], ['pointermove', x + 1, g.cy - 12], ['pointermove', x + 3, g.cy - 60], ['pointerup', x + 3, g.cy - 90]]);
  }
  expect(await value(page)).toBe(300);
});

for (const width of [320, 390, 1280]) {
  test(`at ${width}px the zone stays inside the scale panel and Play / Minimal keep their taps`, async ({ page }, info) => {
    if (width === 1280) test.skip(info.project.name !== 'desktop', 'desktop width on the desktop project');
    else test.skip(info.project.name === 'desktop', 'phone widths on the touch projects');
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 700 });
    await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
    const g = await geom(page);
    const R = (g.t * 3) / 2;
    const band = Math.max(48, g.height * 3) / 2;
    // Zone bounds (thumb circle at either end + the band) are inside the panel…
    expect(g.cy - Math.max(R, band)).toBeGreaterThanOrEqual(g.panel.top);
    expect(g.cy + Math.max(R, band)).toBeLessThanOrEqual(g.panel.bottom);
    // …and the panel overlaps no control.
    for (const id of ['btn-play', 'btn-minimal', 'btn-back', 'btn-forward']) {
      const b = await tid(page, id).boundingBox();
      const overlap = b.x < g.panel.right && b.x + b.width > g.panel.left && b.y < g.panel.bottom && b.y + b.height > g.panel.top;
      expect(overlap, `${id} overlaps the speed panel`).toBe(false);
    }
    const play = await tid(page, 'btn-play').boundingBox();
    const min = await tid(page, 'btn-minimal').boundingBox();
    const tap = (x, y) => (info.project.name === 'desktop' ? page.mouse.click(x, y) : page.touchscreen.tap(x, y));
    // Play: the edge nearest the scale.
    const playY = play.y + play.height > g.panel.top ? play.y + 2 : play.y + play.height - 2;
    await tap(play.x + play.width / 2, playY);
    await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
    await tap(play.x + play.width / 2, playY);
    await expect(tid(page, 'btn-play')).not.toHaveAttribute('data-state', 'playing');
    expect(await value(page)).toBe(300);
    // Minimal: its edge nearest the scale.
    await tap(min.x + min.width / 2, min.y + 2);
    await expect(page.locator('html')).toHaveClass(/minimal-mode/);
    expect(await value(page)).toBe(300);
  });
}

test('mouse: clicking the track still sets the value and dragging the thumb still works', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'mouse');
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  let g = await geom(page);
  await page.mouse.click(g.at[3], g.cy);
  await expect(tid(page, 'wpm-value')).toHaveText('700');
  await expect(tid(page, 'wpm-slider')).not.toBeFocused();
  g = await geom(page);
  await page.mouse.move(g.x, g.cy - 8);
  await page.mouse.down();
  await page.mouse.move(g.at[4] + 40, g.cy, { steps: 6 });
  await page.mouse.up();
  await expect(tid(page, 'wpm-value')).toHaveText('900');
});

test('keyboard and aria are unchanged', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  const s = tid(page, 'wpm-slider');
  await expect(s).toHaveAttribute('min', '100');
  await expect(s).toHaveAttribute('max', '900');
  await expect(s).toHaveAttribute('step', '25');
  await expect(s).toHaveAttribute('aria-valuetext', '300 words per minute');
  await s.focus();
  await page.keyboard.press('ArrowRight');
  await expect(s).toHaveValue('325');
  await expect(s).toHaveAttribute('aria-valuetext', '325 words per minute');
  await expect(tid(page, 'wpm-value')).toHaveText('325');
});
