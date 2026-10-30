// Browser storage (SPEC §5.5). Every access is guarded: storage failures mean defaults, no persistence.

export const DEFAULT_SETTINGS = Object.freeze({
  v: 1, wpm: 300, frameSize: 1, redLetter: true, commaMult: 1.5, sentenceMult: 2.0, verseMult: 2.5, status: 'semi',
});

const RULES = {
  wpm: (x) => Number.isInteger(x) && x >= 100 && x <= 900 && x % 25 === 0,
  frameSize: (x) => Number.isInteger(x) && x >= 1 && x <= 3,
  redLetter: (x) => typeof x === 'boolean',
  commaMult: (x) => isStep(x, 1, 3),
  sentenceMult: (x) => isStep(x, 1, 4),
  verseMult: (x) => isStep(x, 1, 4),
  status: (x) => x === 'clear' || x === 'semi' || x === 'off',
};

function isStep(x, lo, hi) {
  return typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi && Math.abs(x * 10 - Math.round(x * 10)) < 1e-6;
}

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function get(key) {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function set(key, value) {
  try {
    storage()?.setItem(key, value);
  } catch {
    /* no persistence */
  }
}

/** @param {any} raw */
export function sanitizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const [k, ok] of Object.entries(RULES)) if (ok(raw[k])) out[k] = raw[k];
  }
  return out;
}

export function loadSettings() {
  const s = get('word-settings');
  if (s === null) return { ...DEFAULT_SETTINGS };
  try {
    return sanitizeSettings(JSON.parse(s));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const next = sanitizeSettings({ ...loadSettings(), ...patch });
  set('word-settings', JSON.stringify(next));
  return next;
}

/** @returns {{v:1, edition:string, abbr:string, chapter:number, verse:number, word:number, updatedAt:number}|null} */
export function loadPosition() {
  const s = get('word-position');
  if (s === null) return null;
  try {
    const p = JSON.parse(s);
    if (!p || p.v !== 1 || typeof p.edition !== 'string' || typeof p.abbr !== 'string') return null;
    for (const k of ['chapter', 'verse']) if (!Number.isInteger(p[k]) || p[k] < 1) return null;
    if (!Number.isInteger(p.word) || p.word < 0) return null;
    return { v: 1, edition: p.edition, abbr: p.abbr, chapter: p.chapter, verse: p.verse, word: p.word, updatedAt: Number(p.updatedAt) || 0 };
  } catch {
    return null;
  }
}

export function savePosition(pos) {
  const { edition, abbr, chapter, verse, word } = pos;
  set('word-position', JSON.stringify({ v: 1, edition, abbr, chapter, verse, word, updatedAt: pos.updatedAt ?? Date.now() }));
}

export function loadTheme() {
  const t = get('word-theme');
  return t === 'light' || t === 'dark' ? t : null;
}

export function saveTheme(t) {
  set('word-theme', t);
}

export function loadMinimal() {
  return get('word-minimal') === '1';
}

export function saveMinimal(b) {
  set('word-minimal', b ? '1' : '0');
}

// First-visit explainer (SPEC §10.13): '1' once it has been shown.
export const WELCOME_KEY = 'word-welcome-seen';

export function loadWelcomeSeen() {
  return get(WELCOME_KEY) === '1';
}

export function saveWelcomeSeen() {
  set(WELCOME_KEY, '1');
}
