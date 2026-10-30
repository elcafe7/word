// Playback across chapters and books (SPEC §6.2–6.4). DOM-free.
import { createEngine } from '../engine/engine.js';
import { buildPassage, tokenIndexFor, verseIndexAt } from './passage.js';
import { bookByAbbr, fetchJson, LoadError, nextChapter, prevChapter } from './books.js';

const CACHE_MAX = 4;
const LOADING_DELAY = 300;

/**
 * @param {object} o
 * @param {import('./books.js').Index} o.index
 * @param {string} o.base
 * @param {typeof fetch} o.fetchFn
 * @param {(state: object, reason: string) => void} [o.onRender]  every frame / seek / open
 * @param {(state: object) => void} [o.onState]                     play/pause/ended/loading changes
 * @param {(err: {kind: string, status: number, edition: string, abbr: string, chapter: number, retry: () => Promise<void>}) => void} [o.onError]
 * @param {(tag: string) => void} [o.onPrefetch]
 */
export function createPlayer(o) {
  const { index, base, fetchFn } = o;
  const now = o.now ?? (() => Date.now());
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((id) => clearTimeout(id));
  const onRender = o.onRender ?? (() => {});
  const onState = o.onState ?? (() => {});
  const onError = o.onError ?? (() => {});
  const onPrefetch = o.onPrefetch ?? (() => {});
  let settings = { ...o.settings };

  const cache = new Map();
  const inflight = new Map();
  /** @type {{edition: string, abbr: string, chapter: number, book: object, passage: ReturnType<typeof buildPassage>}|null} */
  let cur = null;
  let engine = null;
  let frame = { index: 0, end: 0 };
  let playing = false;
  let ended = false;
  let loading = false;
  let prefetchArmed = true;
  let op = 0;
  let lastFetchUrl = null;

  const key = (ed, abbr, ch) => `${ed}/${abbr}/${ch}`;
  const url = (ed, abbr, ch) => `${base}data/${ed}/${abbr}/${ch}.json?v=${index.dataVersion}`;

  function cacheGet(k) {
    if (!cache.has(k)) return null;
    const v = cache.get(k);
    cache.delete(k);
    cache.set(k, v);
    return v;
  }
  function cachePut(k, v) {
    cache.delete(k);
    cache.set(k, v);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }

  function fetchChapter(ed, abbr, ch) {
    const k = key(ed, abbr, ch);
    const hit = cacheGet(k);
    if (hit) return Promise.resolve(hit);
    if (inflight.has(k)) return inflight.get(k);
    lastFetchUrl = url(ed, abbr, ch);
    const p = fetchJson(fetchFn, lastFetchUrl, { cache: 'default' }).then((json) => {
      if (!json || !Array.isArray(json.verses) || json.chapter !== ch) throw new LoadError('json');
      const passage = buildPassage(json);
      cachePut(k, passage);
      return passage;
    });
    inflight.set(k, p);
    p.then(() => inflight.delete(k), () => inflight.delete(k));
    return p;
  }

  async function withLoading(promise) {
    const t = setTimer(() => {
      loading = true;
      onState(getState());
    }, LOADING_DELAY);
    try {
      return await promise;
    } finally {
      clearTimer(t);
      if (loading) {
        loading = false;
        onState(getState());
      }
    }
  }

  function engineSettings() {
    return {
      wpm: settings.wpm,
      frameSize: settings.frameSize,
      mults: { comma: settings.commaMult, sentence: settings.sentenceMult, para: Math.max(settings.verseMult, settings.sentenceMult) },
    };
  }

  function install(edition, abbr, chapter, passage, tokenIndex, autoplay, reason) {
    if (engine) engine.destroy();
    const book = bookByAbbr(index, abbr);
    cur = { edition, abbr, chapter, book, passage };
    ended = false;
    prefetchArmed = true;
    frame = { index: tokenIndex, end: tokenIndex + 1 };
    const es = engineSettings();
    engine = createEngine({
      tokens: passage.tokens, paraStarts: passage.paraStarts, now, setTimer, clearTimer,
      onWord: (i, end) => {
        frame = { index: i, end };
        maybePrefetch(i, end);
        onRender(getState(), 'frame');
      },
      onChapterEnd: () => {
        chapterEnd();
      },
      onStateChange: (p) => {
        playing = p;
        onState(getState());
      },
      ...es, index: tokenIndex,
    });
    frame = { index: engine.getIndex(), end: engine.getFrameEnd() };
    playing = false;
    onRender(getState(), reason);
    onState(getState());
    if (autoplay) engine.play();
  }

  function maybePrefetch(i, end) {
    if (!prefetchArmed || !cur) return;
    const len = cur.passage.tokens.length;
    if (end < Math.ceil(0.8 * len)) return;
    prefetchArmed = false;
    const nx = nextChapter(index, cur.abbr, cur.chapter);
    if (!nx) return;
    const k = key(cur.edition, nx.abbr, nx.chapter);
    if (cache.has(k) || inflight.has(k)) return;
    onPrefetch(`${k}@${i}/${len}`);
    fetchChapter(cur.edition, nx.abbr, nx.chapter).catch(() => {});
  }

  function reportError(e, target) {
    const err = e instanceof LoadError ? e : new LoadError('network');
    onError({
      kind: err.kind, status: err.status, ...target,
      retry: () => open({ ...target }),
    });
  }

  async function chapterEnd() {
    if (!cur) return;
    const nx = nextChapter(index, cur.abbr, cur.chapter);
    if (!nx) {
      ended = true;
      playing = false;
      onState(getState());
      return;
    }
    const mine = ++op;
    const { edition } = cur;
    try {
      const passage = await withLoading(fetchChapter(edition, nx.abbr, nx.chapter));
      if (mine !== op) return;
      install(edition, nx.abbr, nx.chapter, passage, 0, true, 'open');
    } catch (e) {
      if (mine !== op) return;
      reportError(e, { edition, abbr: nx.abbr, chapter: nx.chapter, verse: 1, word: 0 });
    }
  }

  /**
   * Load a passage. Paused unless opts.play. tokenAt(passage) can override the start token.
   */
  async function open(target, opts = {}) {
    const { edition, abbr, chapter } = target;
    const mine = ++op;
    if (engine) engine.pause();
    try {
      const passage = await withLoading(fetchChapter(edition, abbr, chapter));
      if (mine !== op) return;
      const t = opts.tokenAt ? opts.tokenAt(passage) : tokenIndexFor(passage, target.verse ?? 1, target.word ?? 0);
      install(edition, abbr, chapter, passage, t, !!opts.play, 'open');
    } catch (e) {
      if (mine !== op) return;
      reportError(e, { edition, abbr, chapter, verse: target.verse ?? 1, word: target.word ?? 0 });
    }
  }

  function getState() {
    if (!cur) {
      return { edition: null, abbr: null, book: null, chapter: 0, verse: 0, word: 0, index: 0, frameEnd: 0, playing: false, ended: false, tokensLen: 0, loading, words: [] };
    }
    const p = cur.passage;
    const vi = verseIndexAt(p, frame.index);
    return {
      edition: cur.edition, abbr: cur.abbr, book: cur.book, chapter: cur.chapter,
      verse: p.verseNums[vi], word: Math.max(0, frame.index - p.verseStarts[vi]),
      index: frame.index, frameEnd: frame.end, playing, ended, tokensLen: p.tokens.length, loading,
      words: p.tokens.slice(frame.index, frame.end),
    };
  }

  function seekToken(i) {
    if (!engine) return;
    ++op;
    ended = false;
    engine.seek(i);
    frame = { index: engine.getIndex(), end: engine.getFrameEnd() };
    onRender(getState(), 'seek');
    onState(getState());
  }

  return {
    open: (target) => open(target),
    play() {
      if (!engine) return;
      if (ended) {
        const p = cur.passage;
        const last = p.verseLens.length - 1;
        ended = false;
        engine.seek(p.verseStarts[last]);
      }
      engine.play();
    },
    pause() {
      if (engine) engine.pause();
    },
    toggle() {
      if (playing) this.pause();
      else this.play();
    },
    back() {
      if (!cur) return Promise.resolve();
      const p = cur.passage;
      const i = frame.index;
      const k = verseIndexAt(p, i);
      const s = p.verseStarts[k];
      if (i - s >= 2) return Promise.resolve(seekToken(s));
      for (let j = k - 1; j >= 0; j -= 1) {
        if (p.verseLens[j] > 0) return Promise.resolve(seekToken(p.verseStarts[j]));
      }
      const pc = prevChapter(index, cur.abbr, cur.chapter);
      if (pc) {
        return open({ edition: cur.edition, abbr: pc.abbr, chapter: pc.chapter }, {
          play: playing,
          tokenAt: (pp) => {
            let j = pp.verseLens.length - 1;
            while (j > 0 && pp.verseLens[j] === 0) j -= 1;
            return pp.verseStarts[j];
          },
        });
      }
      return Promise.resolve(seekToken(0));
    },
    forward() {
      if (!cur) return Promise.resolve();
      const p = cur.passage;
      const k = verseIndexAt(p, frame.index);
      for (let j = k + 1; j < p.verseLens.length; j += 1) {
        if (p.verseLens[j] > 0) return Promise.resolve(seekToken(p.verseStarts[j]));
      }
      const nc = nextChapter(index, cur.abbr, cur.chapter);
      if (nc) return open({ edition: cur.edition, abbr: nc.abbr, chapter: nc.chapter }, { play: playing, tokenAt: () => 0 });
      return Promise.resolve();
    },
    seekToken,
    setEdition(id) {
      if (!cur) return Promise.resolve();
      const st = getState();
      return open({ edition: id, abbr: st.abbr, chapter: st.chapter, verse: st.verse, word: 0 });
    },
    applySettings(s) {
      settings = { ...settings, ...s };
      if (!engine) return;
      const es = engineSettings();
      engine.setWpm(es.wpm);
      engine.setMults(es.mults);
      engine.setFrameSize(es.frameSize);
      if (!playing) {
        frame = { index: engine.getIndex(), end: engine.getFrameEnd() };
        onRender(getState(), 'settings');
      }
    },
    getState,
    getTokens: () => (cur ? cur.passage.tokens : []),
    getEngineMults: () => (engine ? engine.getMults() : null),
    lastUrl: () => lastFetchUrl,
    isLoaded: () => !!cur,
  };
}
