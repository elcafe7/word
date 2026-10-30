import { expect, test } from '@playwright/test';
import { openPassage, tid, verseStarts, at, appReady } from './helpers.js';

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('word-settings') || 'null'));

test.beforeEach(async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'btn-settings').click();
  await expect(tid(page, 'settings-panel')).toBeVisible();
});

test('WPM slider saves and updates the play label', async ({ page }) => {
  await tid(page, 'setting-wpm').fill('600');
  await expect(tid(page, 'btn-play')).toContainText('600 WPM');
  expect((await stored(page)).wpm).toBe(600);
});

test('red letter off removes the focal letter and ticks', async ({ page }) => {
  await tid(page, 'setting-red-letter').uncheck();
  await expect(tid(page, 'orp')).toHaveCount(0);
  await expect(tid(page, 'tick-top')).toBeHidden();
  await expect(tid(page, 'tick-bottom')).toBeHidden();
  await expect(tid(page, 'word')).toHaveText('For');
  expect((await stored(page)).redLetter).toBe(false);
});

test('frame size 3 groups ≤3 words and never spans verses while playing', async ({ page }) => {
  await tid(page, 'setting-frame-3').click();
  await expect(tid(page, 'setting-frame-3')).toHaveAttribute('aria-pressed', 'true');
  const starts = await verseStarts(page, at('/word/data/kjv/John/3.json'));
  await tid(page, 'btn-settings-close').click();
  await page.evaluate(() => {
    window.__frames = [];
    const w = document.querySelector('[data-testid="word"]');
    new MutationObserver(() => window.__frames.push([+w.dataset.index, +w.dataset.count])).observe(w, { attributes: true, childList: true });
  });
  await tid(page, 'btn-play').click();
  await page.waitForTimeout(3000);
  const frames = await page.evaluate(() => window.__frames);
  expect(frames.length).toBeGreaterThanOrEqual(3); // ~600 ms per 3-word frame at 300 WPM, ×2 during the ramp
  expect(frames.some(([, c]) => c > 1)).toBe(true);
  for (const [i, c] of frames) {
    expect(c).toBeLessThanOrEqual(3);
    expect(starts.some((s) => s > i && s < i + c)).toBe(false);
  }
});

test('reference bar modes: clear, semi, off', async ({ page }) => {
  await tid(page, 'setting-status-clear').check();
  const opacity = () => tid(page, 'status').evaluate((e) => getComputedStyle(e).opacity);
  await expect.poll(opacity).toBe('1');
  await tid(page, 'setting-status-semi').check();
  await page.mouse.move(1, 1);
  // No dimming in any mode or play state (Nate, 2026-10-23): semi stays at full opacity, paused and playing.
  await expect.poll(opacity).toBe('1');
  await tid(page, 'btn-settings-close').click();
  await tid(page, 'btn-play').click();
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
  await page.mouse.move(1, 1);
  await expect.poll(opacity).toBe('1');
  await tid(page, 'btn-play').click();
  await tid(page, 'btn-settings').click();
  await tid(page, 'setting-status-off').check();
  expect(await tid(page, 'status').evaluate((e) => getComputedStyle(e).visibility)).toBe('hidden');
  expect((await stored(page)).status).toBe('off');
  await tid(page, 'btn-open-picker').click();
  await expect(tid(page, 'picker')).toBeVisible();
});

test('pause sliders show ×values and save', async ({ page }) => {
  await tid(page, 'setting-verse').fill('3.5');
  await expect(page.locator('#out-verse')).toHaveText('×3.5');
  await tid(page, 'setting-comma').fill('2');
  await expect(page.locator('#out-comma')).toHaveText('×2.0');
  const s = await stored(page);
  expect(s.verseMult).toBe(3.5);
  expect(s.commaMult).toBe(2);
});

test('theme toggle persists over reload', async ({ page }) => {
  const want = (await page.locator('html').getAttribute('data-theme')) === 'dark' ? 'light' : 'dark';
  await tid(page, 'btn-theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', want);
  expect(await page.evaluate(() => localStorage.getItem('word-theme'))).toBe(want);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', want);
  await appReady(page); // data-theme is set by the inline head script before the app wires the buttons
  await tid(page, 'btn-settings').click();
  await tid(page, 'setting-theme-light').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('word-theme'))).toBe('light');
});

test('settings panel closes on ✕, Esc and outside pointerdown; does not pause playback', async ({ page }) => {
  await tid(page, 'btn-settings-close').click();
  await expect(tid(page, 'settings-panel')).toBeHidden();
  await tid(page, 'btn-play').click();
  await tid(page, 'btn-settings').click();
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
  await page.keyboard.press('Escape');
  await expect(tid(page, 'settings-panel')).toBeHidden();
  await tid(page, 'btn-settings').click();
  await page.mouse.click(5, 400);
  await expect(tid(page, 'settings-panel')).toBeHidden();
});

test('settings button: wrench icon styled like the theme icon, name "Settings", AA-sized target', async ({ page }) => {
  const btn = page.getByRole('button', { name: 'Settings', exact: true });
  await expect(btn).toHaveAttribute('data-testid', 'btn-settings');
  const svg = btn.locator('svg');
  await expect(svg).toHaveAttribute('data-icon', 'wrench');
  await expect(svg).toHaveAttribute('aria-hidden', 'true');
  await expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
  // Same rendered style as the light/dark toggle's icon.
  const style = (loc) => loc.evaluate((el) => {
    const cs = getComputedStyle(el);
    return [cs.width, cs.fill, cs.stroke, cs.strokeWidth, cs.strokeLinecap, cs.strokeLinejoin].join('|');
  });
  // Poll: both icons use currentColor and the header has a 180 ms color transition after load (flaky on slower origins).
  await expect.poll(async () => (await style(svg)) === (await style(tid(page, 'btn-theme').locator('svg'))), { timeout: 3000 }).toBe(true);
  const box = await btn.boundingBox();
  // WCAG 2.2 AA 2.5.8 needs 24px; the header icon buttons are 42px and must not shrink.
  expect(box.width).toBeGreaterThanOrEqual(42);
  expect(box.height).toBeGreaterThanOrEqual(42);
});
