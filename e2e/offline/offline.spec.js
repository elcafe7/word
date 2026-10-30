// Offline single-file HTML (offline SPEC §2.9 A2-A12), opened from file:// with every non-file request aborted.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const DIR = path.resolve(process.env.WORD_OFFLINE_DIR);
const SHOTS = process.env.WORD_OFFLINE_SHOTS ? path.resolve(process.env.WORD_OFFLINE_SHOTS) : null;
const RELEASE = /^https:\/\/github\.com\/elcafe7\/word\/releases\/tag\/offline-\d{8}(-\d+)?$/;
const EDITIONS = [
  { id: 'gen', file: 'word-geneva1599.html', short: 'Geneva', header: 'Geneva (1599)', name: 'Geneva Bible (1599)', label: 'Geneva 1599' },
  { id: 'kjv', file: 'word-kjv.html', short: 'KJV', header: 'KJV (Oxford 1769)', name: 'King James Version (Oxford 1769)', label: 'KJV' },
  { id: 'kj16', file: 'word-kjv1611.html', short: 'KJV 1611', header: 'KJV (1611 Original)', name: 'King James Version (1611 Original)', label: 'KJV 1611' },
];
const url = (e, hash = '') => pathToFileURL(path.join(DIR, e.file)).href + hash;
const tid = (page, id) => page.locator(`[data-testid="${id}"]`);
const ready = (page) => expect(tid(page, 'word')).not.toHaveAttribute('data-count', '0');

/** Aborts anything that isn't file:/data:/about:, and records every request plus console/page errors. */
async function guard(page) {
  const requests = [];
  const errors = [];
  await page.context().route(/^https?:/, (r) => r.abort());
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return {
    requests,
    errors,
    offsite: () => requests.filter((u) => !/^(file|data|about|blob):/.test(u)),
  };
}

async function dismissWelcome(page) {
  const w = tid(page, 'welcome');
  if (await w.isVisible()) await tid(page, 'welcome-start').click();
  await expect(w).toBeHidden();
}

for (const e of EDITIONS) {
  test.describe(`${e.file}`, () => {
    test('A2/A3/A11 fresh open: welcome, John 3:16 in this edition, plays, no network, no console errors', async ({ page }) => {
      const g = await guard(page);
      await page.goto(url(e));
      await expect(tid(page, 'welcome')).toBeVisible();
      await expect(tid(page, 'quicklook-hint')).toHaveCount(0);
      await tid(page, 'welcome-start').click();
      await ready(page);
      await expect(tid(page, 'status-text')).toHaveText('John 3:16');
      await expect(tid(page, 'status')).toHaveAttribute('aria-label', `John 3:16, ${e.short}, change passage`);
      await expect(page).toHaveURL(new RegExp(`#/${e.id}/John-3-16$`));
      await expect(tid(page, 'edition-value')).toHaveText(e.header);
      await expect(tid(page, 'attribution')).toContainText(e.name);
      // Play advances
      const i0 = Number(await tid(page, 'word').getAttribute('data-index'));
      await tid(page, 'btn-play').click();
      await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
      await expect.poll(async () => Number(await tid(page, 'word').getAttribute('data-index')), { timeout: 10000 }).toBeGreaterThan(i0);
      await tid(page, 'btn-play').click();
      await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
      // A11: footer, title, build meta
      await expect(tid(page, 'footer-offline-edition')).toHaveText(new RegExp(`^Offline edition · ${e.name.replace(/[()]/g, '\\$&')} · built \\d{4}-\\d{2}-\\d{2} · no internet needed$`));
      await expect(tid(page, 'footer-offline')).toHaveCount(0);
      await expect(page).toHaveTitle(new RegExp(`^John 3:\\d+ · Word ${e.label}$`));
      await expect(page.locator('meta[name="word-build"]')).toHaveAttribute('content', /^\d{4}-\d{2}-\d{2} [0-9a-f]{7} [0-9a-f]{12}$/);
      expect(g.offsite()).toEqual([]);
      // Only this file itself (Firefox doesn't report the file:// navigation as a request at all).
      for (const u of g.requests.filter((r) => r.startsWith('file:'))) expect(u.split('#')[0]).toBe(url(e));
      // Nothing fetched after load either: no resource entries at all (JS, CSS, data and icon are inline).
      expect(await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name))).toEqual([]);
      expect(g.errors).toEqual([]);
    });

    test('A4/A8 navigation: picker book → chapter → verse, Previous/Next, keys; single-edition UI', async ({ page }) => {
      const g = await guard(page);
      await page.goto(url(e));
      await dismissWelcome(page);
      await ready(page);
      // A8: no edition select, picker edition row hidden, "Other versions" exclude this file's edition
      await expect(page.locator('#edition-select')).toHaveCount(0);
      await tid(page, 'status').click();
      await expect(tid(page, 'picker')).toBeVisible();
      await expect(page.locator('#picker-editions')).toBeHidden();
      await expect(tid(page, 'picker-book')).toHaveCount(66);
      const others = tid(page, 'picker-other-versions').locator('a');
      await expect(others).toHaveCount(2);
      for (const a of await others.all()) {
        await expect(a).toHaveAttribute('href', RELEASE);
        await expect(a).toHaveAttribute('target', '_blank');
      }
      await expect(tid(page, `offline-other-${e.id}`)).toHaveCount(0);
      // book → chapter → verse
      await tid(page, 'picker-book').filter({ hasText: /^Psalm$/ }).click();
      await expect(tid(page, 'picker-chapter')).toHaveCount(150);
      await tid(page, 'picker-chapter').filter({ hasText: /^23$/ }).click();
      await expect(tid(page, 'picker-verse')).toHaveCount(6);
      await tid(page, 'picker-verse').filter({ hasText: /^4$/ }).click();
      await expect(tid(page, 'picker')).toBeHidden();
      await expect(tid(page, 'status-text')).toHaveText('Psalm 23:4');
      await expect(page).toHaveURL(new RegExp(`#/${e.id}/Psalm-23-4$`));
      // Next / Previous buttons and arrow keys
      await tid(page, 'btn-forward').click();
      await expect(tid(page, 'status-text')).toHaveText('Psalm 23:5');
      await tid(page, 'btn-back').click();
      await expect(tid(page, 'status-text')).toHaveText('Psalm 23:4');
      await page.keyboard.press('ArrowRight');
      await expect(tid(page, 'status-text')).toHaveText('Psalm 23:5');
      // Back button in the browser returns to the passage before the picker jump
      await page.goBack();
      await expect(tid(page, 'status-text')).toHaveText('John 3:16');
      expect(g.offsite()).toEqual([]);
      expect(g.errors).toEqual([]);
    });

    test('A4 rollover Mal 4:6 → Matt 1:1, Rev 22:21 is the end; another edition in the hash shows the note', async ({ page }) => {
      const g = await guard(page);
      const other = e.id === 'gen' ? 'kjv' : 'gen';
      await page.goto(url(e, `#/${other}/Psalm-23-1`));
      await dismissWelcome(page);
      await ready(page);
      await expect(tid(page, 'status-text')).toHaveText('Psalm 23:1');
      await expect(tid(page, 'status')).toHaveAttribute('aria-label', `Psalm 23:1, ${e.short}, change passage`);
      await expect(tid(page, 'offline-edition-note')).toHaveText(`This file has ${e.header} only.`);
      await expect(page).toHaveURL(new RegExp(`#/${e.id}/Psalm-23-1$`));
      // Typed hash: Malachi 4:6 then Next → Matthew 1:1
      await page.evaluate(() => { location.hash = '#/x/Malachi-4-6'; });
      await page.evaluate(() => { location.hash = '#/Malachi-4-6'; });
      await expect(tid(page, 'status-text')).toHaveText('Malachi 4:6');
      await tid(page, 'btn-forward').click();
      await expect(tid(page, 'status-text')).toHaveText('Matthew 1:1');
      await page.evaluate(() => { location.hash = '#/Revelation-22-21'; });
      await expect(tid(page, 'status-text')).toHaveText('Revelation 22:21');
      await expect(tid(page, 'btn-forward')).toBeDisabled();
      expect(g.offsite()).toEqual([]);
      expect(g.errors).toEqual([]);
    });

    test('A6/A7 theme and speed controls work; place, theme and speed are kept on reload', async ({ page }) => {
      const g = await guard(page);
      await page.goto(url(e, '#/John-1-1'));
      await dismissWelcome(page);
      await ready(page);
      await expect(tid(page, 'status-text')).toHaveText('John 1:1');
      // theme
      const t0 = await page.locator('html').getAttribute('data-theme');
      await tid(page, 'btn-theme').click();
      const t1 = t0 === 'dark' ? 'light' : 'dark';
      await expect(page.locator('html')).toHaveAttribute('data-theme', t1);
      // speed: ↑ key and the slider
      await page.keyboard.press('ArrowUp');
      await expect(tid(page, 'wpm-value')).toHaveText('325');
      await tid(page, 'wpm-slider').fill('450');
      await expect(tid(page, 'wpm-value')).toHaveText('450');
      await expect(page.locator('#wpm-label')).toHaveText('450 WPM');
      // Settings "Your place" line
      await tid(page, 'btn-settings').click();
      await expect(tid(page, 'offline-place')).toHaveText(/^Your place: John 1:1 · word \d+$/);
      await expect(tid(page, 'settings-other-versions').locator('a')).toHaveCount(2);
      await expect(tid(page, 'offline-storage-warning')).toHaveCount(0);
      await tid(page, 'btn-settings-close').click();
      // move a few words in, then reload (bare URL: storage, not the hash, must restore it)
      await tid(page, 'btn-forward').click();
      await expect(tid(page, 'status-text')).toHaveText('John 1:2');
      const j0 = Number(await tid(page, 'word').getAttribute('data-index'));
      await tid(page, 'btn-play').click();
      await expect.poll(async () => Number(await tid(page, 'word').getAttribute('data-index')), { timeout: 10000 }).toBeGreaterThan(j0 + 1);
      await tid(page, 'btn-play').click();
      await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
      await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
      const idx = Number(await tid(page, 'word').getAttribute('data-index'));
      const place = await tid(page, 'status-text').textContent();
      expect(place).toMatch(/^John 1:\d+$/);
      await page.goto(url(e));
      await ready(page);
      await expect(tid(page, 'welcome')).toBeHidden();
      await expect(tid(page, 'status-text')).toHaveText(place);
      await expect(tid(page, 'word')).toHaveAttribute('data-index', String(idx));
      await expect(page.locator('html')).toHaveAttribute('data-theme', t1);
      await expect(tid(page, 'wpm-value')).toHaveText('450');
      // reload with the hash
      await page.reload();
      await ready(page);
      await expect(tid(page, 'status-text')).toHaveText(place);
      await expect(tid(page, 'word')).toHaveAttribute('data-index', String(idx));
      expect(g.offsite()).toEqual([]);
      expect(g.errors).toEqual([]);
    });
  });
}

test('A5 cross-file place: Geneva John 3:16 word 5 → KJV file opens John 3:16 (word 0 in Chromium/WebKit; own place in Firefox)', async ({ page, browserName }) => {
  const g = await guard(page);
  const [gen, kjv] = EDITIONS;
  await page.goto(url(gen, '#/John-3-16'));
  await dismissWelcome(page);
  await ready(page);
  const i0 = Number(await tid(page, 'word').getAttribute('data-index'));
  await tid(page, 'btn-play').click();
  await expect.poll(async () => Number(await tid(page, 'word').getAttribute('data-index')), { timeout: 10000 }).toBeGreaterThan(i0 + 1);
  await tid(page, 'btn-play').click();
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
  await expect(tid(page, 'status-text')).toHaveText('John 3:16');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('word-position')))).toMatchObject({ edition: 'gen', verse: 16 });
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('word-position')))).word).toBeGreaterThan(0);
  await page.goto(url(kjv));
  await ready(page);
  if (browserName === 'firefox') {
    // Firefox keeps file:// storage per file path: the KJV file has its own (fresh) place and shows the welcome.
    await dismissWelcome(page);
    await expect(tid(page, 'status-text')).toHaveText('John 3:16');
  } else {
    await expect(tid(page, 'welcome')).toBeHidden();
    await expect(tid(page, 'status-text')).toHaveText('John 3:16');
    await expect(tid(page, 'status')).toHaveAttribute('aria-label', 'John 3:16, KJV, change passage');
    // The Geneva place's word offset is dropped: the KJV file starts John 3:16 at its first word.
    const pos = await page.evaluate(() => JSON.parse(localStorage.getItem('word-position')));
    expect([pos.edition, pos.abbr, pos.chapter, pos.verse, pos.word]).toEqual(['kjv', 'John', 3, 16, 0]);
  }
  expect(g.offsite()).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('A6 storage blocked: app works, Settings shows Your place, the warning and Copy place', async ({ page }) => {
  const g = await guard(page);
  await page.addInitScript(() => {
    const boom = () => { throw new DOMException('denied', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { configurable: true, get: boom });
  });
  await page.goto(url(EDITIONS[0], '#/Psalm-23-1'));
  await dismissWelcome(page);
  await ready(page);
  await expect(tid(page, 'status-text')).toHaveText('Psalm 23:1');
  await tid(page, 'btn-settings').click();
  await expect(tid(page, 'offline-storage-warning')).toBeVisible();
  await expect(tid(page, 'offline-place')).toHaveText(/^Your place: Psalm 23:1 · word \d+$/);
  await tid(page, 'offline-copy-place').click();
  await expect(tid(page, 'offline-copy-status')).toContainText('Psalm 23:1 (Geneva)');
  expect(g.offsite()).toEqual([]);
  expect(g.errors).toEqual([]);
});

test.describe('A12 JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });
  test('the Quick Look hint is visible and names Koder', async ({ page }) => {
    await page.goto(url(EDITIONS[0]));
    await expect(tid(page, 'quicklook-hint')).toBeVisible();
    await expect(tid(page, 'quicklook-hint')).toContainText('It needs an app that runs web pages.');
    await expect(tid(page, 'quicklook-hint')).toContainText('Koder Code Editor');
  });
});

test('screenshots of each edition (dark and light)', async ({ page }, info) => {
  test.skip(!SHOTS, 'WORD_OFFLINE_SHOTS not set');
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const e of EDITIONS) {
    for (const theme of ['dark', 'light']) {
      await page.addInitScript((t) => {
        localStorage.setItem('word-welcome-seen', '1');
        localStorage.setItem('word-theme', t);
      }, theme);
      await page.goto('about:blank');
      await page.goto(url(e, '#/John-3-16'));
      await ready(page);
      await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${e.id}-${theme}.png`) });
    }
  }
  await tid(page, 'status').click();
  await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-kj16-light-picker.png`) });
  await tid(page, 'picker-close').click();
  await tid(page, 'btn-settings').click();
  await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-kj16-light-settings.png`) });
});
