import { expect, test } from '@playwright/test';
import { openPassage, tid, rx, at, BASE, ORIGIN } from './helpers.js';
import { REMOTE } from './target.js';

// Behind Cloudflare the edge injects its own scripts into HTML (Web Analytics beacon and the JS-detection
// challenge under /cdn-cgi/). They are not app requests, so they are ignored on remote targets only.
const cloudflareInjected = (u) => REMOTE && (u.startsWith('https://static.cloudflareinsights.com/') || u.startsWith(`${ORIGIN}/cdn-cgi/`));

test(`every request stays under ${BASE}; nothing from Verse, ESV or NASB`, async ({ page }) => {
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await openPassage(page, at('/word/kjv/John-3-16'), 'John 3:16 · KJV');
  await tid(page, 'btn-play').click();
  await page.waitForTimeout(5000);
  await tid(page, 'btn-settings').click();
  await tid(page, 'btn-settings-close').click();
  await tid(page, 'status').click();
  await expect(tid(page, 'picker')).toBeVisible();
  await page.keyboard.press('Escape');
  await tid(page, 'edition-select').selectOption('gen');
  await expect(tid(page, 'status')).toHaveAttribute('aria-label', /, Geneva, change passage$/);
  expect(urls.length).toBeGreaterThan(3);
  for (const u of urls.filter((x) => !cloudflareInjected(x))) {
    expect(u.startsWith(ORIGIN + BASE), u).toBe(true);
    expect(u).not.toContain('/verse/');
    expect(u.toLowerCase()).not.toMatch(/esv|nasb/);
  }
  const data = urls.filter((u) => u.includes(at('/word/data/')));
  expect(data.some((u) => rx(/\/word\/data\/index\.json\?v=\w+$/).test(u))).toBe(true);
  expect(data.some((u) => rx(/\/word\/data\/gen\/John\/3\.json\?v=[0-9a-f]{12}$/).test(u))).toBe(true);
});
