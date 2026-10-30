import { expect, test } from '@playwright/test';
import { openPassage, seed, tid, rx, at, expectPosition } from './helpers.js';

test('status click opens the picker paused; Geneva → Psalm 23:1', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'btn-play').click();
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'playing');
  await tid(page, 'status').click();
  await expect(tid(page, 'picker')).toBeVisible();
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
  await expect(tid(page, 'picker-book')).toHaveCount(66);
  await expect(tid(page, 'picker-edition-kjv')).toHaveAttribute('aria-pressed', 'true');
  await tid(page, 'picker-edition-gen').click();
  await expect(tid(page, 'picker-edition-gen')).toHaveAttribute('aria-pressed', 'true');
  await tid(page, 'picker-book-filter').fill('ps');
  await expect(tid(page, 'picker-book').first()).toHaveText('Psalm');
  await tid(page, 'picker-book').first().click();
  await expect(tid(page, 'picker-chapter')).toHaveCount(150);
  await tid(page, 'picker-chapter').filter({ hasText: /^23$/ }).click();
  await expect(tid(page, 'picker-verse')).toHaveCount(6);
  const before = await page.evaluate(() => history.length);
  await tid(page, 'picker-verse').filter({ hasText: /^1$/ }).click();
  await expect(tid(page, 'picker')).toBeHidden();
  await expectPosition(page, 'Psalm 23:1 · Geneva');
  await expect(page).toHaveURL(rx(/\/word\/gen\/Psalm-23-1$/));
  await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  await page.goBack();
  await expect(tid(page, 'status-text')).toContainText('John 3:');
});

test('picker-back steps back; Esc and backdrop close it', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'status').click();
  await tid(page, 'picker-book').filter({ hasText: /^John$/ }).click();
  await expect(tid(page, 'picker-chapter')).toHaveCount(21);
  await expect(tid(page, 'picker-chapter').filter({ hasText: /^3$/ })).toHaveClass(/current/);
  await expect(tid(page, 'picker-chapter').filter({ hasText: /^3$/ })).toHaveAttribute('aria-current', 'true');
  await tid(page, 'picker-back').click();
  await expect(tid(page, 'picker-book')).toHaveCount(66);
  await page.keyboard.press('Escape');
  await expect(tid(page, 'picker')).toBeHidden();
  await page.keyboard.press('/');
  await expect(tid(page, 'picker')).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(tid(page, 'picker')).toBeHidden();
  await expectPosition(page, 'John 3:16 · KJV');
});

test('verse selector looks like a field: label, 44px target, border contrast, focus ring', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  const status = tid(page, 'status');
  await expect(status).toHaveAccessibleName('John 3:16, KJV, change passage');
  await expect(status).toHaveAttribute('aria-haspopup', 'dialog');
  const field = tid(page, 'passage-field');
  const box = await field.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await field.evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe('solid');
  await page.keyboard.press('Shift');
  await status.focus();
  expect(await field.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(tid(page, 'picker')).toBeVisible();
});

test('typing "1 john 3:16" + Enter opens 1 John 3:16 (was "No matching book.")', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'status').click();
  const f = tid(page, 'picker-book-filter');
  await f.fill('1 john 3:16');
  await expect(tid(page, 'picker-go')).toHaveText('Go to 1 John 3:16');
  await expect(tid(page, 'picker-go')).toHaveAttribute('aria-selected', 'true');
  await expect(f).toHaveAttribute('aria-expanded', 'true');
  await expect(f).toHaveAttribute('aria-activedescendant', await tid(page, 'picker-go').getAttribute('id'));
  await f.press('Enter');
  await expect(tid(page, 'picker')).toBeHidden();
  await expectPosition(page, '1 John 3:16 · KJV');
  await expect(page).toHaveURL(rx(/\/word\/kjv\/1-John-3-16$/));
});

test('forgiving forms: I Jn. 3.16, ps 23, Jude 5', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  for (const [q, want] of [['I Jn. 3.16', '1 John 3:16 · KJV'], ['ps 23', 'Psalm 23:1 · KJV'], ['Jude 5', 'Jude 1:5 · KJV']]) {
    await tid(page, 'status').click();
    await tid(page, 'picker-book-filter').fill(q);
    await tid(page, 'picker-book-filter').press('Enter');
    await expectPosition(page, want);
  }
});

test('ambiguous "J" shows suggestions, Enter alone does nothing, ↓ + Enter picks', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'status').click();
  const f = tid(page, 'picker-book-filter');
  await f.fill('J');
  await expect(tid(page, 'picker-suggest')).toHaveAttribute('role', 'listbox');
  expect(await tid(page, 'picker-book').count()).toBeGreaterThan(1);
  await expect(tid(page, 'picker-hint')).toContainText('More than one book');
  await f.press('Enter');
  await expect(tid(page, 'picker')).toBeVisible();
  await expect(f).not.toHaveAttribute('aria-activedescendant', /.+/);
  await f.press('ArrowDown');
  const first = tid(page, 'picker-book').first();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  const name = await first.textContent();
  await f.press('Enter');
  await expect(page.locator('#picker-crumb')).toHaveText(name);
  await expect(tid(page, 'picker-chapter').first()).toBeVisible();
});

test('"Ph 4:13" lists Philippians and Philemon with refs; clicking Philippians jumps', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'status').click();
  await tid(page, 'picker-book-filter').fill('Ph');
  await expect(tid(page, 'picker-book')).toHaveText(['Philippians', 'Philemon']);
  await tid(page, 'picker-book-filter').fill('Ph 4:13');
  // Philemon has one chapter, so only Philippians shows the 4:13 reference.
  await expect(tid(page, 'picker-book')).toHaveText(['Philippians 4:13', 'Philemon']);
  await tid(page, 'picker-book').filter({ hasText: 'Philippians' }).click();
  await expectPosition(page, 'Philippians 4:13 · KJV');
});

test('out-of-range reference explains instead of jumping', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'status').click();
  await tid(page, 'picker-book-filter').fill('john 22');
  await expect(tid(page, 'picker-hint')).toHaveText('John has 21 chapters.');
  await expect(tid(page, 'picker-go')).toHaveCount(0);
});

test('closed selector shows the reference only; the edition is in the header and the accessible name', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await expect(tid(page, 'status-text')).toHaveText('John 3:16');
  await expect(tid(page, 'passage-field')).not.toContainText('KJV');
  await expect(tid(page, 'status')).toHaveAccessibleName('John 3:16, KJV, change passage');
  await expect(tid(page, 'edition-value')).toContainText('KJV');
  // Versions are still inside the opened selector.
  await tid(page, 'status').click();
  await expect(tid(page, 'picker-edition-gen')).toBeVisible();
  await tid(page, 'picker-edition-gen').click();
  await tid(page, 'picker-book').filter({ hasText: /^John$/ }).click();
  await tid(page, 'picker-chapter').filter({ hasText: /^3$/ }).click();
  await tid(page, 'picker-verse').filter({ hasText: /^16$/ }).click();
  await expect(tid(page, 'status-text')).toHaveText('John 3:16');
  await expect(tid(page, 'status')).toHaveAccessibleName('John 3:16, Geneva, change passage');
});

/** WCAG relative-luminance contrast of two computed rgb() colours. */
const contrast = (a, b) => {
  const L = (c) => {
    const [r, g, bl] = c.match(/[\d.]+/g).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const look = (loc) => loc.evaluate((e) => {
  const c = getComputedStyle(e);
  return { bg: c.backgroundColor, fg: c.color, border: c.borderTopColor, check: getComputedStyle(e, '::after').content };
});

for (const theme of ['dark', 'light']) {
  test(`picker (${theme}): the chosen edition, book, chapter and verse are clearly marked in every step and persist`, async ({ page }) => {
    await seed(page, { 'word-theme': theme });
    await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
    const cardBg = await page.locator('.picker-card').evaluate((e) => getComputedStyle(e).backgroundColor);
    await tid(page, 'status').click();
    const kjv = tid(page, 'picker-edition-kjv');
    const gen = tid(page, 'picker-edition-gen');
    const john = tid(page, 'picker-book').filter({ hasText: /^John$/ });
    const plain = tid(page, 'picker-book').filter({ hasText: /^Genesis$/ });
    const check = async (chosen, other) => {
      const a = await look(chosen);
      const b = await look(other);
      // Filled (not colour alone): a check mark and a different fill than unchosen items.
      expect(a.check).toBe('"✓"');
      expect(b.check).toBe('none');
      expect(a.bg).not.toBe(b.bg);
      // AA: text on the fill ≥ 4.5:1; the fill against the card ≥ 3:1 (non-text contrast).
      expect(contrast(a.fg, a.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(a.bg, await page.locator('.picker-card').evaluate((e) => getComputedStyle(e).backgroundColor))).toBeGreaterThanOrEqual(3);
    };
    // Step 1: version.
    await expect(kjv).toHaveAttribute('aria-pressed', 'true');
    await check(kjv, gen);
    await gen.click();
    await expect(gen).toHaveAttribute('aria-pressed', 'true');
    await expect(kjv).toHaveAttribute('aria-pressed', 'false');
    await check(gen, kjv);
    // Step 2: book (current position).
    await expect(john).toHaveAttribute('aria-current', 'true');
    await expect(tid(page, 'picker-book').and(page.locator('[aria-current="true"]'))).toHaveCount(1);
    await check(john, plain);
    // Pick another book: it becomes the chosen one when you step back.
    await tid(page, 'picker-book').filter({ hasText: /^Romans$/ }).click();
    await expect(tid(page, 'picker-chapter').and(page.locator('[aria-current="true"]'))).toHaveCount(0);
    await tid(page, 'picker-back').click();
    await expect(tid(page, 'picker-book').filter({ hasText: /^Romans$/ })).toHaveAttribute('aria-current', 'true');
    await expect(john).not.toHaveAttribute('aria-current', 'true');
    await expect(gen).toHaveAttribute('aria-pressed', 'true');
    // Step 3: chapter (current), then a picked chapter persists after stepping back from verses.
    await john.click();
    const ch3 = tid(page, 'picker-chapter').filter({ hasText: /^3$/ });
    await expect(ch3).toHaveAttribute('aria-current', 'true');
    await check(ch3, tid(page, 'picker-chapter').filter({ hasText: /^4$/ }));
    await tid(page, 'picker-chapter').filter({ hasText: /^5$/ }).click();
    await tid(page, 'picker-back').click();
    await expect(tid(page, 'picker-chapter').filter({ hasText: /^5$/ })).toHaveAttribute('aria-current', 'true');
    await expect(ch3).not.toHaveAttribute('aria-current', 'true');
    // Step 4: verse (current position's verse in its chapter).
    await ch3.click();
    const v16 = tid(page, 'picker-verse').filter({ hasText: /^16$/ });
    await expect(v16).toHaveAttribute('aria-current', 'true');
    await check(v16, tid(page, 'picker-verse').filter({ hasText: /^17$/ }));
    expect(cardBg).toBeTruthy();
    // Reopening shows the saved edition chosen.
    await v16.click();
    await expectPosition(page, 'John 3:16 · Geneva');
    await tid(page, 'status').click();
    await expect(gen).toHaveAttribute('aria-pressed', 'true');
    await check(gen, kjv);
  });
}

test('picker scroll: only the body scrolls; the card frame, title and close stay put and nothing overlaps the books', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'status').click();
  await expect(tid(page, 'picker-book')).toHaveCount(66);
  const card = page.locator('.picker-card');
  const body = tid(page, 'picker-body');
  const vp = page.viewportSize();
  const cb = await card.boundingBox();
  // The card fits the viewport (dvh) and never scrolls itself.
  expect(cb.y).toBeGreaterThanOrEqual(0);
  expect(cb.y + cb.height).toBeLessThanOrEqual(vp.height + 0.5);
  expect(await card.evaluate((e) => getComputedStyle(e).overflowY)).toBe('hidden');
  const scrolls = await body.evaluate((e) => e.scrollHeight > e.clientHeight);
  const closeBefore = await tid(page, 'picker-close').boundingBox();
  if (scrolls) {
    // Scroll the way a finger would land: on the body (mouse.wheel isn't available in mobile WebKit).
    await body.evaluate((e) => { e.scrollTop = 600; });
    await expect.poll(() => body.evaluate((e) => e.scrollTop)).toBeGreaterThan(100);
  }
  expect(await card.evaluate((e) => e.scrollTop)).toBe(0);
  expect(await tid(page, 'picker-close').boundingBox()).toEqual(closeBefore);
  // The frame (::before) still spans the whole card, and every visible book sits inside the body's clip box.
  const frame = await card.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const c = getComputedStyle(e, '::before');
    return { top: parseFloat(c.top), bottom: parseFloat(c.bottom), h: r.height, pos: c.position };
  });
  expect(frame.pos).toBe('absolute');
  expect(frame.top).toBe(8);
  expect(frame.bottom).toBe(8);
  const bb = await body.boundingBox();
  const inner = { top: cb.y + 8, bottom: cb.y + cb.height - 8 };
  expect(bb.y).toBeGreaterThanOrEqual(inner.top);
  expect(bb.y + bb.height).toBeLessThanOrEqual(inner.bottom + 0.5);
  // The element on top at the middle of each visible book button is that button (nothing stuck over the grid).
  const hits = await page.evaluate(() => {
    const body = document.querySelector('[data-testid=picker-body]').getBoundingClientRect();
    return [...document.querySelectorAll('[data-testid=picker-book]')].map((b) => {
      const r = b.getBoundingClientRect();
      const y = r.top + r.height / 2;
      if (y < body.top + 2 || y > body.bottom - 2) return null;
      const top = document.elementFromPoint(r.left + r.width / 2, y);
      return b === top || b.contains(top);
    }).filter((v) => v !== null);
  });
  expect(hits.length).toBeGreaterThan(4);
  expect(hits.every(Boolean)).toBe(true);
});
