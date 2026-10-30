// Offline single-edition file: UI pieces that only exist in the WORD_OFFLINE build (offline SPEC §2.4-§2.6).
// Imported by main.js behind __WORD_OFFLINE__, so the online bundle never contains it.
/* global __WORD_OFFLINE_RELEASE_URL__ */
import { byId, el } from './ui/dom.js';
import { shortEditionLabel } from './ui/footer.js';

const RELEASE_URL = typeof __WORD_OFFLINE_RELEASE_URL__ !== 'undefined' ? __WORD_OFFLINE_RELEASE_URL__ : '';

/** Asset file label per edition id, for the "Other versions" links. */
const DOWNLOAD_LABEL = { gen: 'Download Geneva 1599', kjv: 'Download KJV (Oxford 1769)', kj16: 'Download KJV 1611' };

/** The static "open this in an app that runs web pages" hint is only for viewers with no JS (iPhone Quick Look). */
export function removeQuickLookHint(doc = document) {
  doc.getElementById('word-quicklook-hint')?.remove();
}

/** set/get/remove a probe key; false when localStorage is missing or throws (file:// may deny storage). */
export function storageWorks() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return false;
    const k = '__word_probe__';
    ls.setItem(k, '1');
    const v = ls.getItem(k);
    ls.removeItem(k);
    return v === '1';
  } catch {
    return false;
  }
}

/** "Other versions" links: every edition except this file's, each to the release page (needs internet). */
export function otherVersions(current, testid) {
  const box = el('div', { class: 'offline-others', 'data-testid': testid });
  box.append(el('p', { class: 'offline-others-title' }, 'Other versions (need internet)'));
  const list = el('ul', { class: 'offline-others-list' });
  for (const id of ['gen', 'kjv', 'kj16']) {
    if (id === current) continue;
    const li = el('li');
    li.append(el('a', { href: RELEASE_URL, target: '_blank', rel: 'noopener', 'data-testid': `offline-other-${id}` }, DOWNLOAD_LABEL[id]));
    list.append(li);
  }
  box.append(list);
  return box;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea', { readonly: '', 'aria-hidden': 'true', class: 'sr-only' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let done = false;
    try {
      done = document.execCommand('copy');
    } catch {
      done = false;
    }
    ta.remove();
    return done;
  }
}

/**
 * Wires the single-edition UI into the page: hides the picker's edition row, adds "Other versions" under the
 * picker's book list and in Settings, a "Your place" line (always) and, when storage doesn't persist, a
 * warning and a Copy place button. Returns hooks main.js calls on every render.
 * @param {{edition: {id: string, name: string, short: string}}} o
 */
export function installOfflineUi(o) {
  const ed = o.edition;
  const persistent = storageWorks();
  const pickerEditions = byId('picker-editions');
  if (pickerEditions) pickerEditions.hidden = true;
  byId('picker-step-books')?.append(otherVersions(ed.id, 'picker-other-versions'));

  const panel = byId('settings-panel');
  const placeRow = el('div', { class: 'setting-row offline-place', 'data-testid': 'offline-place-row' });
  if (!persistent) {
    placeRow.append(el('p', { class: 'setting-note', 'data-testid': 'offline-storage-warning' },
      "This browser won't remember your place for this file. Bookmark the page, or note your place:"));
  }
  const placeLine = el('p', { class: 'offline-place-line', 'data-testid': 'offline-place' }, 'Your place: …');
  placeRow.append(placeLine);
  let copyValue = '';
  if (!persistent) {
    const btn = el('button', { class: 'panel-button', type: 'button', 'data-testid': 'offline-copy-place' }, 'Copy place');
    const status = el('p', { class: 'setting-note', role: 'status', 'data-testid': 'offline-copy-status' });
    btn.addEventListener('click', async () => {
      status.textContent = (await copyText(copyValue)) ? `Copied: ${copyValue}` : copyValue;
    });
    placeRow.append(btn, status);
  }
  const othersRow = el('div', { class: 'setting-row' });
  othersRow.append(otherVersions(ed.id, 'settings-other-versions'));
  panel?.append(placeRow, othersRow);

  // One-line note when a link or saved place named another edition (e.g. #/kjv/Ps-23-1 in the Geneva file).
  const note = el('p', { class: 'offline-edition-note', role: 'status', 'data-testid': 'offline-edition-note' });
  note.hidden = true;
  byId('reading-stage')?.prepend(note);

  return {
    persistent,
    /** @param {string} ref e.g. "John 3:16" @param {number} word */
    renderPlace(ref, word) {
      placeLine.textContent = `Your place: ${ref} · word ${word + 1}`;
      copyValue = `${ref} (${ed.short})`;
    },
    showEditionNote() {
      note.textContent = `This file has ${shortEditionLabel(ed)} only.`;
      note.hidden = false;
    },
    hideEditionNote() {
      note.hidden = true;
    },
  };
}
