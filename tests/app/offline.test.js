// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOfflineFetch, installOfflineFetch } from '../../src/app/offline-data.js';
import { offlineFooterLine } from '../../vite.config.js';

const index = { dataVersion: 'x', editions: [{ id: 'gen' }], books: [{ abbr: 'John', name: 'John', chapters: [2, 1] }] };
const data = { John: [['In the beginning', 'The same'], ['And the third day']] };
const doc = (blocks = { 'word-index': index, 'word-data': data }) => ({
  getElementById: (id) => (id in blocks ? { textContent: JSON.stringify(blocks[id]) } : null),
});

describe('createOfflineFetch', () => {
  const f = createOfflineFetch(doc(), 'gen');
  it('answers index.json from the inline block', async () => {
    const r = await f('./data/index.json?v=abc');
    expect(r.ok).toBe(true);
    expect(await r.json()).toEqual(index);
  });
  it('rebuilds a chapter in the online shape', async () => {
    const r = await f('./data/gen/John/1.json?v=abc');
    expect(await r.json()).toEqual({ edition: 'gen', book: 'John', chapter: 1, verses: [{ v: 1, text: 'In the beginning' }, { v: 2, text: 'The same' }] });
  });
  it.each(['./data/kjv/John/1.json', './data/gen/John/3.json', './data/gen/Mark/1.json', './other.json'])('404 for %s', async (u) => {
    const r = await f(u);
    expect([r.ok, r.status]).toEqual([false, 404]);
  });
  it('404 (not a throw) when a block is missing', async () => {
    const r = await createOfflineFetch(doc({}), 'gen')('./data/index.json');
    expect(r.status).toBe(404);
  });
});

describe('installOfflineFetch', () => {
  it('replaces fetch and refuses non-data URLs', async () => {
    const win = { fetch: () => 'network' };
    installOfflineFetch(win, doc(), 'gen');
    expect((await win.fetch('./data/gen/John/2.json')).ok).toBe(true);
    await expect(win.fetch('https://example.com/')).rejects.toThrow(TypeError);
  });
});

describe('offlineFooterLine', () => {
  const files = { gen: 4343403, kjv: 4299753, kj16: 4363404 };
  it('one "about" size when the files are close', () => {
    expect(offlineFooterLine({ tag: 'offline-20261029', files })).toBe(
      '<p class="offline-note"><a href="https://github.com/elcafe7/word/releases/tag/offline-20261029" target="_blank" rel="noopener" data-testid="footer-offline">offline HTML build</a> · Geneva 1599, KJV, KJV 1611 · one file each, about 4.3 MB</p>',
    );
  });
  it('lists each size when they differ by more than 0.2 MB', () => {
    expect(offlineFooterLine({ tag: 'offline-20261029', files: { ...files, kj16: 4900000 } })).toContain('Geneva 1599 4.3 MB, KJV 4.3 MB, KJV 1611 4.9 MB');
  });
  it.each([null, {}, { tag: 'v1', files }, { tag: 'offline-20261029', files: { gen: 1 } }])('null for %j', (r) => expect(offlineFooterLine(r)).toBeNull());
});
