// First-visit explainer (SPEC §10.13) and the Verse-style footer (SPEC §10.12).
import { expect, test } from '@playwright/test';
import { openPassage, tid, at } from './helpers.js';

const KEY = 'word-welcome-seen';

test.describe('first visit', () => {
  // A brand-new visitor: no stored state at all (the config seeds KEY for every other test).
  test.use({ storageState: { cookies: [], origins: [] } });

  test('explainer shows on the first visit, is labelled, and takes focus', async ({ page }) => {
    await page.goto(at('/word/'));
    const dlg = tid(page, 'welcome');
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveJSProperty('open', true);
    expect(await dlg.evaluate((d) => d.matches(':modal'))).toBe(true);
    await expect(dlg).toHaveAttribute('aria-labelledby', 'welcome-title');
    await expect(page.locator('#welcome-title')).toHaveText('Welcome to Word');
    await expect(tid(page, 'welcome-close')).toHaveAttribute('aria-label', 'Close help');
    await expect(tid(page, 'welcome-close')).toBeFocused();
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('1');
  });

  test('it does not show again on a return visit', async ({ page }) => {
    await page.goto(at('/word/'));
    await expect(tid(page, 'welcome')).toBeVisible();
    await tid(page, 'welcome-start').click();
    await expect(tid(page, 'welcome')).toBeHidden();
    await page.reload();
    await expect(tid(page, 'word')).not.toHaveAttribute('data-count', '0');
    await expect(tid(page, 'welcome')).toBeHidden();
    // Even if the first visit ended without dismissing it, it was shown once: don't nag.
    await page.goto(at('/word/kjv/John-1-1'));
    await expect(tid(page, 'word')).not.toHaveAttribute('data-count', '0');
    await expect(tid(page, 'welcome')).toBeHidden();
  });

  test('Esc closes it, and reader shortcuts do not fire behind it', async ({ page }) => {
    await page.goto(at('/word/'));
    await expect(tid(page, 'welcome')).toBeVisible();
    await page.keyboard.press('Space');
    await page.keyboard.press('m');
    await expect(tid(page, 'btn-play')).toHaveAttribute('data-state', 'paused');
    await expect(page.locator('html')).not.toHaveClass(/minimal-mode/);
    await page.keyboard.press('Escape');
    await expect(tid(page, 'welcome')).toBeHidden();
  });

  test('focus is trapped inside the explainer (Tab and Shift+Tab wrap)', async ({ page }) => {
    await page.goto(at('/word/'));
    await expect(tid(page, 'welcome-close')).toBeFocused();
    const inside = () => page.evaluate(() => document.querySelector('[data-testid="welcome"]').contains(document.activeElement));
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await inside()).toBe(true);
    }
    await tid(page, 'welcome-close').focus();
    await page.keyboard.press('Tab');
    await expect(tid(page, 'welcome-start')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(tid(page, 'welcome-close')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(tid(page, 'welcome-start')).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside()).toBe(true);
    }
  });

  test('fits a 320px screen with every control reachable', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(at('/word/'));
    await expect(tid(page, 'welcome')).toBeVisible(); // renders after the data loads (~1 s on a remote origin)
    const box = await tid(page, 'welcome').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const close = await tid(page, 'welcome-close').boundingBox();
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
    await tid(page, 'welcome-start').scrollIntoViewIfNeeded();
    await tid(page, 'welcome-start').click();
    await expect(tid(page, 'welcome')).toBeHidden();
  });
});

test('explainer reopens from Settings › How Word works and returns focus to the Help button', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await expect(tid(page, 'welcome')).toBeHidden();
  await tid(page, 'btn-settings').click();
  const help = tid(page, 'btn-help');
  await expect(help).toHaveText('How Word works');
  await help.click();
  await expect(tid(page, 'welcome')).toBeVisible();
  await expect(tid(page, 'welcome-close')).toBeFocused();
  await tid(page, 'welcome-close').click();
  await expect(tid(page, 'welcome')).toBeHidden();
  await expect(tid(page, 'settings-panel')).toBeVisible();
  await expect(help).toBeFocused();
  // Esc closes it too, with the same focus return; a second Esc then closes Settings as before.
  await page.keyboard.press('Enter');
  await expect(tid(page, 'welcome')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tid(page, 'welcome')).toBeHidden();
  await expect(help).toBeFocused();
  await expect(tid(page, 'settings-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tid(page, 'settings-panel')).toBeHidden();
});

test('explainer: no animation under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'btn-settings').click();
  await tid(page, 'btn-help').click();
  const s = await tid(page, 'welcome').evaluate((d) => {
    const c = getComputedStyle(d);
    return { anim: c.animationName, dur: parseFloat(c.transitionDuration) };
  });
  expect(s.anim).toBe('none');
  expect(s.dur).toBeLessThanOrEqual(0.01);
});

test('footer: edition credit, Verse and Apocalypse Press links, Verse credit "a project of JPSF & AP", underlined and undimmed', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  const footer = tid(page, 'footer');
  await expect(tid(page, 'attribution')).toHaveText('King James Version (Oxford 1769) · Public domain text');
  await expect(tid(page, 'footer-verse')).toHaveAttribute('href', 'https://apocalypse.press/verse/');
  await expect(tid(page, 'footer-verse')).toHaveText('Verse');
  await expect(tid(page, 'footer-verse').locator('xpath=..')).toHaveText('Read whole verses in Verse');
  await expect(tid(page, 'footer-ap')).toHaveAttribute('href', 'https://apocalypse.press');
  await expect(tid(page, 'footer-ap')).toHaveText('AP');
  await expect(tid(page, 'footer-jpsf')).toHaveText('JPSF');
  await expect(tid(page, 'footer-jpsf')).toHaveAttribute('href', 'https://jesuspeoplesf.com');
  await expect(footer.locator('.offline-note').last()).toHaveText('a project of JPSF & AP');
  for (const id of ['footer-verse', 'footer-jpsf', 'footer-ap']) {
    const a = tid(page, id);
    await expect(a).toBeVisible();
    expect(await a.evaluate((e) => getComputedStyle(e).textDecorationLine)).toContain('underline');
  }
  expect(await footer.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  for (const p of await footer.locator('p').all()) expect(await p.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
});

test('explainer copy: final strings', async ({ page }) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'btn-settings').click();
  await tid(page, 'btn-help').click();
  const card = tid(page, 'welcome');
  await expect(card).toContainText('Tap or click the passage at the top of the card');
  await expect(card).toContainText('Drag the words-per-minute slider under Play.');
  await expect(card).toContainText('In Settings, you can show or hide the reference bar. Minimalist mode hides everything except the word, the passage and Play.');
  await expect(card).toContainText('Open this again any time from Settings › How Word works.');
});

test('edition select: the closed value is a short, untruncated label; options keep full names', async ({ page }, info) => {
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  const widths = info.project.name === 'phone' ? [320, 360, 390] : [1280];
  const expected = { kjv: 'KJV (Oxford 1769)', kj16: 'KJV (1611 Original)', gen: 'Geneva (1599)' };
  expect(await tid(page, 'edition-select').locator('option').allTextContents()).toEqual([
    'KJV — King James Version (Oxford 1769)', 'KJ16 — King James Version (1611 Original)', 'GEN — Geneva Bible (1599)',
  ]);
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const [id, label] of Object.entries(expected)) {
      await tid(page, 'edition-select').selectOption(id);
      const v = tid(page, 'edition-value');
      await expect(v).toHaveText(label);
      const m = await v.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
      expect(m.sw, `w=${w} ${id}`).toBeLessThanOrEqual(m.cw);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    }
  }
  await expect(tid(page, 'edition-select')).toHaveAccessibleName('Bible edition');
});
