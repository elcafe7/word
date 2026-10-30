// Footer attribution and the edition <select> (SPEC §10.5).
import { $, clear, el } from './dom.js';

/**
 * Short label shown in the closed select, e.g. "KJV (Oxford 1769)", "KJV (1611 Original)", "Geneva (1599)".
 * The options keep Verse's full "{ID} — {name}" text.
 * @param {{short: string, name: string}} e
 */
export function shortEditionLabel(e) {
  const m = /\(([^)]+)\)\s*$/.exec(e.name);
  const base = e.short.split(' ')[0];
  return m ? `${base} (${m[1]})` : e.name;
}

function showValue(edition) {
  $('edition-value').textContent = shortEditionLabel(edition);
}

/* global __WORD_OFFLINE__ */
export function renderEditions(index, current) {
  if (__WORD_OFFLINE__) {
    // Single-edition offline file: no <select>, the header shows the edition as static text (offline SPEC §2.5).
    const ed = index.editions.find((e) => e.id === current);
    if (ed) showValue(ed);
    return;
  }
  const sel = /** @type {HTMLSelectElement} */ ($('edition-select'));
  clear(sel);
  for (const e of index.editions) sel.append(el('option', { value: e.id }, `${e.id.toUpperCase()} — ${e.name}`));
  sel.value = current;
  const ed = index.editions.find((e) => e.id === current);
  if (ed) showValue(ed);
}

export function setEdition(edition) {
  $('attribution').textContent = `${edition.name} · ${edition.attribution}`;
  if (__WORD_OFFLINE__) {
    showValue(edition);
    return;
  }
  /** @type {HTMLSelectElement} */ ($('edition-select')).value = edition.id;
  showValue(edition);
}
