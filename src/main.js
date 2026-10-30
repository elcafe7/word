// Word — entry point: wires the player to the DOM, URL and storage.
import './styles.css';
import { bookByAbbr, editionById, loadIndex } from './app/books.js';
import { DEFAULT_EDITION, display, EDITION_IDS, formatPath, parsePath } from './app/ref.js';
import {
  loadMinimal, loadPosition, loadSettings, loadTheme, loadWelcomeSeen, saveMinimal, savePosition, saveSettings, saveTheme,
  saveWelcomeSeen,
} from './app/store.js';
import { createPlayer } from './app/player.js';
import { $, byId } from './app/ui/dom.js';
import { createCard } from './app/ui/card.js';
import { createControls } from './app/ui/controls.js';
import { renderEditions, setEdition as setFooterEdition } from './app/ui/footer.js';
import { createSettings } from './app/ui/settings.js';
import { createSpeedScale, snapWpm } from './app/ui/speed.js';
import { createPicker } from './app/ui/picker.js';
import { createWelcome } from './app/ui/welcome.js';
import { createBrake } from './app/ui/brake.js';
import { installKeys } from './app/ui/keys.js';
import { installOfflineFetch } from './app/offline-data.js';
import { installOfflineUi, removeQuickLookHint } from './app/offline.js';
import { formatHash, hashPath, writeHash } from './app/route.js';

/* global __WORD_OFFLINE__, __WORD_OFFLINE_EDITION__, __WORD_OFFLINE_LABEL__ */
// Offline single-file build (WORD_OFFLINE=1): one edition, data inline, hash routes. Folded away online.
// window.fetch answers Word's data URLs from the inline JSON and refuses everything else, so the file never
// touches the network and the online fetch call sites stay unchanged.
if (__WORD_OFFLINE__) {
  removeQuickLookHint();
  installOfflineFetch(window, document, __WORD_OFFLINE_EDITION__);
}

const BASE = import.meta.env.BASE_URL; // vite `base` (WORD_BASE), e.g. /word/ or /word-test/
const root = document.documentElement;
const themeMeta = document.querySelector('meta[name="theme-color"]');

// Theme + minimal before anything renders.
let theme = loadTheme() ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
let minimal = loadMinimal();
applyTheme(theme, false);
root.classList.toggle('minimal-mode', minimal);

function applyTheme(t, persist = true) {
  theme = t;
  root.dataset.theme = t;
  $('btn-theme').setAttribute('aria-label', `Use ${t === 'dark' ? 'light' : 'dark'} theme`);
  if (themeMeta) themeMeta.setAttribute('content', t === 'dark' ? '#1c2027' : '#ffffff');
  if (persist) saveTheme(t);
}

const errorCard = $('error-card');
const errorMsg = byId('error-message');
const retryBtn = $('error-retry');
const shell = byId('verse-shell');
const controlsNav = document.querySelector('.reader-controls');
let retryAction = null;

function showError(message, label, action, hideControls = false) {
  errorMsg.textContent = message;
  retryBtn.textContent = label;
  retryAction = action;
  errorCard.hidden = false;
  shell.hidden = true;
  if (hideControls) controlsNav.hidden = true;
}
function hideError() {
  errorCard.hidden = true;
  shell.hidden = false;
  controlsNav.hidden = false;
  retryAction = null;
}
retryBtn.addEventListener('click', () => {
  const a = retryAction;
  hideError();
  if (a) a();
});

async function start() {
  let index;
  try {
    index = await loadIndex(window.fetch.bind(window), BASE);
  } catch {
    if (__WORD_OFFLINE__) {
      showError('This Word file is incomplete. Download it again from the release page.', 'Try again', () => start(), true);
      return;
    }
    showError("Word couldn't load its library. Check your connection and try again.", 'Try again', () => start(), true);
    return;
  }
  hideError();
  boot(index);
}

function validPosition(index, p) {
  if (!p || !EDITION_IDS.includes(p.edition)) return null;
  const b = bookByAbbr(index, p.abbr);
  if (!b || p.chapter > b.verses.length || p.verse > b.verses[p.chapter - 1]) return null;
  return p;
}

function boot(index) {
  let settings = loadSettings();
  const card = createCard();
  const controls = createControls(index);
  let lastVerseKey = '';
  let lastSaveAt = 0;
  let pendingPush = false;
  let started = false;

  const player = createPlayer({
    index, base: BASE, fetchFn: window.fetch.bind(window), settings,
    onRender: (s, reason) => onRender(s, reason),
    onState: (s) => {
      card.setLoading(s.loading);
      controls.renderPlay(s, settings.wpm);
      if (!s.playing && s.edition) persist();
    },
    onError: (e) => {
      const ed = editionById(index, e.edition);
      const book = bookByAbbr(index, e.abbr);
      if (__WORD_OFFLINE__) {
        showError(`Couldn't load ${book.name} ${e.chapter} (${ed.short}). This Word file may be incomplete. Download it again from the release page.`, 'Try again', () => e.retry(), !player.isLoaded());
        return;
      }
      const msg = e.kind === 'rate'
        ? 'Too many requests. Wait a minute, then try again.'
        : `Couldn't load ${book.name} ${e.chapter} (${ed.short}). Try again.`;
      showError(msg, 'Try again', () => e.retry(), !player.isLoaded());
    },
    onPrefetch: (tag) => {
      root.dataset.prefetch = tag;
    },
  });

  function persist() {
    const s = player.getState();
    if (!s.edition) return;
    savePosition({ edition: s.edition, abbr: s.abbr, chapter: s.chapter, verse: s.verse, word: s.word, updatedAt: Date.now() });
    lastSaveAt = Date.now();
  }

  function onRender(s, reason) {
    if (!started) return;
    if (reason === 'open' && !errorCard.hidden) hideError();
    const ed = editionById(index, s.edition);
    card.render(s, settings);
    controls.renderPosition(s, ed);
    controls.renderPlay(s, settings.wpm);
    setFooterEdition(ed);
    const key = `${s.edition}/${s.abbr}/${s.chapter}/${s.verse}`;
    if (__WORD_OFFLINE__) {
      offlineUi.renderPlace(display(s.book, s.chapter, s.verse), s.word);
      if (key !== lastVerseKey) {
        if (lastVerseKey && !keepNote) offlineUi.hideEditionNote();
        keepNote = false;
        lastVerseKey = key;
        writeHash(formatHash(s.edition, s.book, s.chapter, s.verse), pendingPush);
        pendingPush = false;
        document.title = `${display(s.book, s.chapter, s.verse)} · Word ${__WORD_OFFLINE_LABEL__}`;
        persist();
      } else if (reason !== 'frame' || Date.now() - lastSaveAt >= 2000) {
        persist();
      }
      return;
    }
    if (key !== lastVerseKey) {
      lastVerseKey = key;
      const url = formatPath(BASE, s.edition, s.book, s.chapter, s.verse);
      if (pendingPush) {
        history.pushState(null, '', url);
        pendingPush = false;
      } else {
        history.replaceState(null, '', url);
      }
      document.title = `${display(s.book, s.chapter, s.verse)} (${s.edition.toUpperCase()}) — Word`;
      persist();
    } else if (reason !== 'frame' || Date.now() - lastSaveAt >= 2000) {
      persist();
    }
  }

  function applySettings(patch) {
    settings = saveSettings(patch);
    player.applySettings(settings);
    controls.setStatusMode(settings.status);
    settingsUi.sync(settings, theme, minimal);
    speedScale.sync(settings.wpm);
    const s = player.getState();
    if (s.edition) {
      card.render(s, settings);
      controls.renderPlay(s, settings.wpm);
    }
  }

  function setMinimal(on) {
    minimal = on;
    root.classList.toggle('minimal-mode', on);
    controls.setMinimal(on);
    saveMinimal(on);
    settingsUi.sync(settings, theme, minimal);
  }

  function setTheme(t) {
    applyTheme(t);
    settingsUi.sync(settings, theme, minimal);
  }

  const picker = createPicker(index, {
    onOpen: () => player.pause(),
    onSelect: (t) => {
      pendingPush = true;
      lastVerseKey = '';
      player.open({ ...t, word: 0 });
    },
  });
  const openPicker = () => {
    const s = player.getState();
    if (s.edition) picker.open({ edition: s.edition, abbr: s.abbr, chapter: s.chapter, verse: s.verse });
  };

  const settingsUi = createSettings({
    onChange: applySettings,
    onTheme: setTheme,
    onMinimal: setMinimal,
    onOpenPicker: openPicker,
  });

  const speedScale = createSpeedScale({ onChange: applySettings });
  const offlineUi = __WORD_OFFLINE__ ? installOfflineUi({ edition: editionById(index, __WORD_OFFLINE_EDITION__) }) : null;
  let keepNote = false;

  // First-visit explainer (SPEC §10.13): shown once, reopenable from Settings › How Word works.
  const welcome = createWelcome({ onOpen: () => player.pause() });
  $('btn-help').addEventListener('click', (e) => welcome.open(/** @type {HTMLElement} */ (e.currentTarget)));

  const back = () => player.back().then(persist);
  const forward = () => player.forward().then(persist);
  const brake = createBrake({
    player, onSeek: persist, onToggle: () => player.toggle(), onBack: back, onForward: forward,
  });

  // Wire controls
  $('btn-play').addEventListener('click', () => player.toggle());
  $('btn-back').addEventListener('click', back);
  $('btn-forward').addEventListener('click', forward);
  $('btn-minimal').addEventListener('click', () => setMinimal(!minimal));
  $('btn-theme').addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'));
  $('status').addEventListener('click', () => {
    if (settings.status !== 'off') openPicker();
  });
  if (!__WORD_OFFLINE__) $('edition-select').addEventListener('change', (e) => {
    const id = /** @type {HTMLSelectElement} */ (e.target).value;
    pendingPush = true;
    lastVerseKey = '';
    player.setEdition(id);
  });

  installKeys({
    isPickerOpen: () => picker.isOpen(),
    isSettingsOpen: () => settingsUi.isOpen(),
    actions: {
      toggle: () => player.toggle(),
      back,
      forward,
      minimal: () => setMinimal(!minimal),
      theme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      picker: openPicker,
      faster: () => applySettings({ wpm: snapWpm(settings.wpm + 25) }),
      slower: () => applySettings({ wpm: snapWpm(settings.wpm - 25) }),
      escape: () => {
        if (picker.isOpen()) picker.close();
        else if (settingsUi.isOpen()) settingsUi.close();
        else if (brake.isActive()) brake.cancel();
      },
    },
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });
  window.addEventListener('pagehide', persist);
  if (__WORD_OFFLINE__) {
    // Back/forward and typed or bookmarked hashes. Always this file's edition; a link naming another edition
    // opens the same passage here with a one-line note.
    const onHash = () => {
      const p = parsePath(hashPath(), '/', index);
      if (!p || p.error) return;
      const s = player.getState();
      if (s.edition && s.abbr === p.abbr && s.chapter === p.chapter && s.verse === p.verse) return;
      if (p.edition && p.edition !== __WORD_OFFLINE_EDITION__) {
        offlineUi.showEditionNote();
        keepNote = true;
      }
      lastVerseKey = '';
      player.open({ edition: __WORD_OFFLINE_EDITION__, abbr: p.abbr, chapter: p.chapter, verse: p.verse, word: 0 });
    };
    window.addEventListener('popstate', onHash);
    window.addEventListener('hashchange', onHash);
  } else window.addEventListener('popstate', () => {
    const p = parsePath(location.pathname, BASE, index);
    if (p && !p.error) {
      lastVerseKey = '';
      player.open({ edition: p.edition ?? player.getState().edition ?? DEFAULT_EDITION, abbr: p.abbr, chapter: p.chapter, verse: p.verse, word: 0 });
    }
  });

  // Initial UI state
  renderEditions(index, DEFAULT_EDITION);
  controls.setStatusMode(settings.status);
  controls.setMinimal(minimal);
  settingsUi.sync(settings, theme, minimal);
  speedScale.sync(settings.wpm);

  if (!loadWelcomeSeen()) {
    saveWelcomeSeen();
    welcome.open();
  }

  if (__WORD_OFFLINE__) {
    // Startup (offline SPEC §2.6): a saved place in this edition resumes at its word; a saved place from another
    // edition's file opens the same verse here at word 0; the hash (bookmark) wins over both.
    started = true;
    const ED = __WORD_OFFLINE_EDITION__;
    const saved = validPosition(index, loadPosition());
    const p = parsePath(hashPath(), '/', index);
    let target;
    if (p && !p.error) {
      if (p.edition && p.edition !== ED) {
        offlineUi.showEditionNote();
        keepNote = true;
      }
      const same = saved && saved.edition === ED && saved.abbr === p.abbr && saved.chapter === p.chapter && saved.verse === p.verse;
      target = { edition: ED, abbr: p.abbr, chapter: p.chapter, verse: p.verse, word: same ? saved.word : 0 };
    } else if (saved) {
      target = { edition: ED, abbr: saved.abbr, chapter: saved.chapter, verse: saved.verse, word: saved.edition === ED ? saved.word : 0 };
    } else {
      target = { edition: ED, abbr: 'John', chapter: 3, verse: 16, word: 0 };
    }
    if (p && p.error) {
      const ed = editionById(index, ED);
      setFooterEdition(ed);
      showError(`That passage isn't in ${ed.short}.`, 'Go to John 3:16', () => {
        pendingPush = true;
        lastVerseKey = '';
        player.open({ edition: ED, abbr: 'John', chapter: 3, verse: 16, word: 0 });
      }, true);
      return;
    }
    player.open(target);
    return;
  }
  // Startup position (SPEC §6.5)
  const saved = validPosition(index, loadPosition());
  const parsed = parsePath(location.pathname, BASE, index);
  started = true;
  if (parsed && parsed.error) {
    const edSeg = location.pathname.slice(BASE.length).split('/').filter(Boolean);
    const urlEd = edSeg.length === 2 && EDITION_IDS.includes(edSeg[0].toLowerCase()) ? edSeg[0].toLowerCase() : null;
    const edition = urlEd ?? saved?.edition ?? DEFAULT_EDITION;
    const ed = editionById(index, edition);
    setFooterEdition(ed);
    renderEditions(index, edition);
    showError(`That passage isn't in ${ed.short}.`, 'Go to John 3:16', () => {
      pendingPush = true;
      lastVerseKey = '';
      player.open({ edition, abbr: 'John', chapter: 3, verse: 16, word: 0 });
    }, true);
    return;
  }
  let target;
  if (parsed) {
    const edition = parsed.edition ?? saved?.edition ?? DEFAULT_EDITION;
    const same = saved && saved.edition === edition && saved.abbr === parsed.abbr && saved.chapter === parsed.chapter && saved.verse === parsed.verse;
    target = { edition, abbr: parsed.abbr, chapter: parsed.chapter, verse: parsed.verse, word: same ? saved.word : 0 };
  } else if (saved) {
    target = { ...saved };
  } else {
    target = { edition: DEFAULT_EDITION, abbr: 'John', chapter: 3, verse: 16, word: 0 };
  }
  renderEditions(index, target.edition);
  player.open(target);
}

start();
