import fs from 'node:fs';
import { defineConfig } from 'vite';

// WORD_BASE: URL prefix the app is served under (default /word/).
// The apocalypse.press migration test builds with WORD_BASE=/word-test/ WORD_NOINDEX=1.
// WORD_OFFLINE=1 (with WORD_OFFLINE_EDITION=gen|kjv|kj16) builds one edition for the single-file offline HTML
// (offline SPEC Part 2): relative base './', hash routing, inline data. With the flag unset the online build is
// unchanged (test A1: byte-identical output).
const OFFLINE = process.env.WORD_OFFLINE === '1';
const OFFLINE_EDITIONS = { gen: 'Geneva 1599', kjv: 'KJV', kj16: 'KJV 1611' };
const OFFLINE_EDITION = process.env.WORD_OFFLINE_EDITION || 'gen';
if (OFFLINE && !Object.hasOwn(OFFLINE_EDITIONS, OFFLINE_EDITION)) {
  throw new Error(`WORD_OFFLINE_EDITION must be gen, kjv or kj16 (got ${JSON.stringify(OFFLINE_EDITION)})`);
}
const OFFLINE_REPO = 'https://github.com/elcafe7/word';
const OFFLINE_TAG = process.env.WORD_OFFLINE_TAG || '';
if (OFFLINE && !/^offline-\d{8}(-\d+)?$/.test(OFFLINE_TAG)) {
  throw new Error(`WORD_OFFLINE_TAG must look like offline-YYYYMMDD (got ${JSON.stringify(OFFLINE_TAG)})`);
}
const BASE = OFFLINE ? './' : process.env.WORD_BASE || '/word/';
if (!OFFLINE && !/^\/[a-z0-9-]+(\/[a-z0-9-]+)*\/$/.test(BASE)) {
  throw new Error(`WORD_BASE must look like /word/ or /word-test/ (got ${JSON.stringify(BASE)})`);
}
const NOINDEX = process.env.WORD_NOINDEX === '1';

/** Adds <meta name="robots" content="noindex, nofollow"> for hidden test builds. */
const noindex = () => ({
  name: 'word-noindex',
  transformIndexHtml(html) {
    if (!NOINDEX) return html;
    return html.replace('<meta name="viewport"', '<meta name="robots" content="noindex, nofollow">\n    <meta name="viewport"');
  },
});

const MB = (b) => (b / 1e6).toFixed(1);

/**
 * Online footer line linking the offline release (offline SPEC §2.7). OFF by default: it renders only when
 * WORD_OFFLINE_FOOTER=1 AND offline-release.json (or WORD_OFFLINE_RELEASE) exists with a valid tag, so the line
 * can never point at a release that doesn't exist. Never /releases/latest (CLI tags share the repo).
 */
export function offlineFooterLine(release) {
  if (!release || !/^offline-\d{8}(-\d+)?$/.test(release.tag ?? '')) return null;
  const f = release.files ?? {};
  const sizes = [['Geneva 1599', f.gen], ['KJV', f.kjv], ['KJV 1611', f.kj16]];
  if (sizes.some(([, b]) => !Number.isFinite(b) || b <= 0)) return null;
  const r = sizes.map(([, b]) => Number(MB(b)));
  const spread = Math.max(...r) - Math.min(...r);
  const tail = spread > 0.2 + 1e-9
    ? sizes.map(([n, b]) => `${n} ${MB(b)} MB`).join(', ')
    : `Geneva 1599, KJV, KJV 1611 · one file each, about ${MB(sizes.reduce((a, [, b]) => a + b, 0) / 3)} MB`;
  return `<p class="offline-note"><a href="${OFFLINE_REPO}/releases/tag/${release.tag}" target="_blank" rel="noopener" data-testid="footer-offline">offline HTML build</a> · ${tail}</p>`;
}

const offlineFooter = () => ({
  name: 'word-offline-footer',
  transformIndexHtml(html) {
    if (OFFLINE || process.env.WORD_OFFLINE_FOOTER !== '1') return html;
    const file = process.env.WORD_OFFLINE_RELEASE || 'offline-release.json';
    let release = null;
    try {
      release = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return html;
    }
    const line = offlineFooterLine(release);
    if (!line) return html;
    const anchor = '<p class="offline-note">a project of';
    return html.replace(anchor, () => `${line}\n      ${anchor}`);
  },
});

export default defineConfig({
  base: BASE,
  plugins: [noindex(), offlineFooter()],
  build: { outDir: process.env.WORD_OUT_DIR || 'dist', assetsDir: 'assets', sourcemap: false },
  test: { environment: 'jsdom', include: ['tests/**/*.test.js'] },
  define: {
    __BUILD_ID__: JSON.stringify(process.env.WORD_BUILD_ID || Date.now().toString(36)),
    __WORD_OFFLINE__: JSON.stringify(OFFLINE),
    __WORD_OFFLINE_EDITION__: JSON.stringify(OFFLINE_EDITION),
    __WORD_OFFLINE_LABEL__: JSON.stringify(OFFLINE_EDITIONS[OFFLINE_EDITION]),
    __WORD_OFFLINE_RELEASE_URL__: JSON.stringify(OFFLINE_TAG ? `${OFFLINE_REPO}/releases/tag/${OFFLINE_TAG}` : ''),
  },
});
