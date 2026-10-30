// Where the e2e suite points. Read by playwright.config.js and helpers.js.
//
//   (default)        local: vite build with WORD_BASE (default /word/) + vite preview on :4174
//   WORD_E2E_URL=... any already-running copy, e.g. https://apocalypse.press/word/
//                    (no local server is started; the URL's path is the app base)
const remote = process.env.WORD_E2E_URL || '';
const localBase = process.env.WORD_BASE || '/word/';
const url = new URL(remote || `http://localhost:4174${localBase}`);
if (!url.pathname.endsWith('/')) url.pathname += '/';

export const ORIGIN = url.origin;
export const BASE = url.pathname;
export const APP_URL = ORIGIN + BASE;
export const REMOTE = Boolean(remote);
export const WELCOME_SEEN = { origin: ORIGIN, localStorage: [{ name: 'word-welcome-seen', value: '1' }] };
