// Offline single-file data source (offline SPEC §2.4): a fetch() stand-in that answers Word's two JSON URLs from
// the <script type="application/json"> blocks inlined into the file. Nothing goes to the network.
//   …data/index.json?v=…            → #word-index (this file's one edition)
//   …data/<ed>/<abbr>/<ch>.json?v=… → {edition, book, chapter, verses:[{v,text}]} rebuilt from #word-data
//   anything else / another edition → {ok:false, status:404}

/** @param {any} json */
const ok = (json) => ({ ok: true, status: 200, json: async () => json });
const notFound = () => ({ ok: false, status: 404, json: async () => null });

/**
 * @param {Document} doc
 * @param {string} edition this file's edition id
 */
export function createOfflineFetch(doc, edition) {
  let index = null;
  let data = null;
  const block = (id) => {
    const node = doc.getElementById(id);
    if (!node) throw new Error(`missing #${id}`);
    return JSON.parse(node.textContent);
  };
  const getIndex = () => (index ??= block('word-index'));
  const getData = () => (data ??= block('word-data'));

  /** @param {string} url */
  return async function offlineFetch(url) {
    const path = String(url).split(/[?#]/)[0];
    try {
      if (/(^|\/)data\/index\.json$/.test(path)) return ok(getIndex());
      const m = /(?:^|\/)data\/([a-z0-9]+)\/([^/]+)\/(\d+)\.json$/.exec(path);
      if (!m || m[1] !== edition) return notFound();
      const abbr = decodeURIComponent(m[2]);
      const ch = Number(m[3]);
      const book = getIndex().books.find((b) => b.abbr === abbr);
      const chapters = getData()[abbr];
      const verses = book && Array.isArray(chapters) ? chapters[ch - 1] : null;
      if (!Array.isArray(verses)) return notFound();
      return ok({ edition, book: book.name, chapter: ch, verses: verses.map((text, i) => ({ v: i + 1, text })) });
    } catch {
      return notFound();
    }
  };
}

/**
 * Offline build only: replaces window.fetch with the inline-data source. Word's own data URLs are answered from
 * the file; any other request is refused (rejects like a network error), so nothing ever leaves the file.
 * @param {Window} win @param {Document} doc @param {string} edition
 */
export function installOfflineFetch(win, doc, edition) {
  const offlineFetch = createOfflineFetch(doc, edition);
  const isData = (url) => /(?:^|\/)data\/(?:index|[a-z0-9]+\/[^/?#]+\/\d+)\.json(?:[?#]|$)/.test(String(url));
  const shim = async (input) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    if (isData(url)) return offlineFetch(url);
    throw new TypeError('Word offline: network requests are disabled in this file');
  };
  win.fetch = shim;
  return shim;
}
