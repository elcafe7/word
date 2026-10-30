#!/usr/bin/env node
// Inlines one WORD_OFFLINE vite build into a single self-contained HTML file (offline SPEC §2.2, §2.8).
// Usage: node scripts/offline/inline.mjs <dist-dir> <data-dir> <gen|kjv|kj16> <YYYYMMDD> <commit7> <out.html>
// Checks (any failure exits 1): no src/href outside https:/data:/#; no leak strings in the app shell; 66 books;
// chapter and verse counts and every verse text equal the online JSON (through the real offlineFetch);
// no "</script" inside the JSON blocks; size 3.5-5.0 MB. Never overwrites <out.html>.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
export const LABELS = {
  gen: { file: 'word-geneva1599.html', short: 'Geneva 1599' },
  kjv: { file: 'word-kjv.html', short: 'KJV' },
  kj16: { file: 'word-kjv1611.html', short: 'KJV 1611' },
};
const MIN = 3.5e6;
const MAX = 5.0e6;

const fail = (msg) => {
  console.error(`inline.mjs: FAIL: ${msg}`);
  process.exit(1);
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON for a <script type="application/json"> block: "</" → "<\/" (still valid JSON). */
const jsonBlock = (v) => JSON.stringify(v).replace(/<\//g, '<\\/');
/** Replace exactly one occurrence (function replacer, so "$" in the payload is literal). */
function once(html, find, repl, what) {
  const n = typeof find === 'string' ? html.split(find).length - 1 : (html.match(new RegExp(find.source, `${find.flags.replace('g', '')}g`)) ?? []).length;
  if (n !== 1) fail(`${what}: expected 1 match, found ${n}`);
  return html.replace(find, () => repl);
}

export function buildData(dataDir, ed) {
  const index = JSON.parse(fs.readFileSync(path.join(dataDir, 'index.json'), 'utf8'));
  if (!Array.isArray(index.books) || index.books.length !== 66) fail('index.json must list 66 books');
  const edition = index.editions.find((e) => e.id === ed);
  if (!edition) fail(`edition ${ed} not in index.json`);
  const data = {};
  const online = new Map();
  for (const b of index.books) {
    const chapters = [];
    b.verses.forEach((count, i) => {
      const ch = i + 1;
      const file = path.join(dataDir, ed, b.abbr, `${ch}.json`);
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (j.edition !== ed || j.book !== b.name || j.chapter !== ch) fail(`${file}: header mismatch`);
      if (j.verses.length !== count) fail(`${file}: ${j.verses.length} verses, index says ${count}`);
      j.verses.forEach((v, k) => {
        if (v.v !== k + 1) fail(`${file}: verse numbers not 1..n at ${k}`);
        if (typeof v.text !== 'string') fail(`${file}: verse ${v.v} text`);
      });
      chapters.push(j.verses.map((v) => v.text));
      online.set(`${b.abbr}/${ch}`, j);
    });
    data[b.abbr] = chapters;
  }
  const { source, ...rest } = index;
  const oneIndex = {
    ...rest,
    source: source ? { ...source, dbSha256: source.dbSha256 ? { [ed]: source.dbSha256[ed] } : undefined } : undefined,
    editions: [edition],
  };
  return { index, oneIndex, edition, data, online };
}

/** Full compare through the app's own offlineFetch (src/app/offline-data.js). */
async function verifyData(oneIndex, data, online, ed, html) {
  const { createOfflineFetch } = await import(pathToFileURL(path.join(ROOT, 'src/app/offline-data.js')).href);
  // Parse the blocks back out of the finished HTML, exactly as the browser will see them.
  const grab = (id) => {
    const m = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(html);
    if (!m) fail(`#${id} block missing`);
    if (/<\/script/i.test(m[1])) fail(`#${id} contains </script`);
    return m[1];
  };
  const blocks = { 'word-index': grab('word-index'), 'word-data': grab('word-data') };
  const doc = { getElementById: (id) => (id in blocks ? { textContent: blocks[id] } : null) };
  const f = createOfflineFetch(doc, ed);
  const ix = await (await f(`./data/index.json?v=x`)).json();
  if (ix.books.length !== 66 || ix.editions.length !== 1 || ix.editions[0].id !== ed) fail('inline index wrong');
  let chapters = 0;
  let verses = 0;
  for (const b of ix.books) {
    if (data[b.abbr].length !== b.verses.length) fail(`${b.abbr}: chapter count`);
    for (let ch = 1; ch <= b.verses.length; ch++) {
      const r = await f(`./data/${ed}/${encodeURIComponent(b.abbr)}/${ch}.json?v=${ix.dataVersion}`);
      if (!r.ok) fail(`${b.abbr} ${ch}: offlineFetch 404`);
      const got = JSON.stringify(await r.json());
      const want = JSON.stringify(online.get(`${b.abbr}/${ch}`));
      if (got !== want) fail(`${b.abbr} ${ch}: text differs from the online JSON`);
      chapters++;
      verses += b.verses[ch - 1];
    }
  }
  const other = ed === 'kjv' ? 'gen' : 'kjv';
  if ((await f(`./data/${other}/John/3.json`)).ok) fail('another edition must 404');
  return { books: ix.books.length, chapters, verses };
}

export function leakCheck(shell) {
  const hits = [];
  const bad = [/\/word\//, /\/word-test\//, /\.php/i, /fetch\([^)]*data\//];
  // The release page link (github.com/elcafe7/word/releases/…) is the one allowed "/word/".
  const scan = shell.replaceAll('https://github.com/elcafe7/word/releases/', '');
  for (const re of bad) if (re.test(scan)) hits.push(re.source);
  for (const m of shell.matchAll(/\s(?:src|href)\s*=\s*"([^"]*)"/g)) {
    if (!/^(https:|data:|#)/.test(m[1])) hits.push(`url ${m[1]}`);
  }
  return hits;
}

async function main() {
  const [distDir, dataDir, ed, date, commit, out] = process.argv.slice(2);
  if (!out) fail('usage: inline.mjs <dist-dir> <data-dir> <gen|kjv|kj16> <YYYYMMDD> <commit7> <out.html>');
  if (!LABELS[ed]) fail(`unknown edition ${ed}`);
  if (!/^\d{8}$/.test(date)) fail('date must be YYYYMMDD');
  if (fs.existsSync(out)) fail(`${out} exists; never overwrite`);
  const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
  const { oneIndex, edition, data, online } = buildData(dataDir, ed);
  const label = LABELS[ed];

  let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const asset = (rel) => fs.readFileSync(path.join(distDir, rel.replace(/^\.\//, '')), 'utf8');

  // JS + CSS inline
  const jsTag = /<script type="module" crossorigin src="(\.\/assets\/[^"]+\.js)"><\/script>/;
  const cssTag = /<link rel="stylesheet" crossorigin href="(\.\/assets\/[^"]+\.css)">/;
  const js = asset(jsTag.exec(html)?.[1] ?? fail('module script tag not found'));
  const css = asset(cssTag.exec(html)?.[1] ?? fail('stylesheet link not found'));
  if (/<\/script/i.test(js)) fail('JS bundle contains </script');
  if (/<\/style/i.test(css)) fail('CSS contains </style');
  const extraCss = fs.readFileSync(path.join(HERE, 'offline.css'), 'utf8');
  if (/<\/style/i.test(extraCss)) fail('offline.css contains </style');
  html = once(html, jsTag, '', 'module script');
  html = once(html, cssTag, `<style>${css}\n${extraCss}</style>`, 'stylesheet');

  // Favicon as a data URI
  const fav = fs.readFileSync(path.join(distDir, 'favicon.svg'), 'utf8');
  html = once(html, /<link rel="icon" href="\.\/favicon\.svg" type="image\/svg\+xml">/,
    `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(fav)}" type="image/svg+xml">`, 'favicon');

  // Title, build meta, noindex
  const title = `Word · ${label.short} (offline, ${isoDate})`;
  html = once(html, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>\n    <meta name="word-build" content="${esc(`${isoDate} ${commit} ${oneIndex.dataVersion}`)}">\n    <meta name="robots" content="noindex">`, 'title');

  // Data blocks (end of head)
  html = once(html, '</head>', `  <script type="application/json" id="word-index">${jsonBlock(oneIndex)}</script>\n    <script type="application/json" id="word-data">${jsonBlock(data)}</script>\n  </head>`, 'head end');

  // Quick Look hint: visible where JS doesn't run; main.js removes it first thing.
  const hint = `<div id="word-quicklook-hint" data-testid="quicklook-hint">
      <p><strong>This is Word, an offline Bible reader. It needs an app that runs web pages.</strong></p>
      <p>On iPhone/iPad: open this file in the free Koder app (App Store → "Koder Code Editor") and tap Preview. https://apps.apple.com/us/app/koder-code-editor/id1447489375</p>
      <p>On a computer: open it in Chrome, Edge, Firefox or Safari. On Android: open with Chrome.</p>
    </div>`;
  html = once(html, '<body>', `<body>\n    ${hint}`, 'body');

  // Header: static edition label instead of the <select> (offline SPEC §2.5)
  const short = /\(([^)]+)\)\s*$/.exec(edition.name);
  const headerLabel = short ? `${edition.short.split(' ')[0]} (${short[1]})` : edition.name;
  html = once(html, /<label class="select-wrap" aria-label="Bible edition">[\s\S]*?<\/label>/,
    `<p class="select-wrap edition-static" data-testid="edition-static"><span class="sr-only">Bible edition: </span><span class="select-value" id="edition-value" data-testid="edition-value">${esc(headerLabel)}</span></p>`, 'edition select');

  // Wordmark: no relative link inside a single file
  html = once(html, '<a class="wordmark" href="./"', '<a class="wordmark" href="#"', 'wordmark');

  // Footer: edition + build date line (no "offline HTML build" link inside the offline file)
  html = html.replace(/\s*<p class="offline-note"><a [^>]*data-testid="footer-offline"[\s\S]*?<\/p>/, '');
  html = once(html, '<p class="offline-note">a project of',
    `<p class="offline-note" data-testid="footer-offline-edition">Offline edition · ${esc(edition.name)} · built ${isoDate} · no internet needed</p>\n      <p class="offline-note">a project of`, 'footer');

  // App JS last, inline module (external modules are blocked on file://)
  html = once(html, '</body>', `  <script type="module">${js}</script>\n  </body>`, 'body end');

  // Checks
  const shell = html.replace(/<script type="application\/json" id="word-(index|data)">[\s\S]*?<\/script>/g, '');
  const hits = leakCheck(shell);
  if (hits.length) fail(`leak check: ${hits.join(', ')}`);
  const counts = await verifyData(oneIndex, data, online, ed, html);
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes < MIN || bytes > MAX) fail(`size ${bytes} B outside 3.5-5.0 MB`);
  fs.writeFileSync(out, html, { flag: 'wx' });
  console.error(`inline.mjs: ${path.basename(out)} ${bytes} B, ${counts.books} books, ${counts.chapters} chapters, ${counts.verses} verses, shell ${Buffer.byteLength(shell)} B`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
