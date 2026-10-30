// Settings panel (SPEC §10.7). Every change saves immediately and applies live via onChange.
import { $, byId } from './dom.js';

const fmtMult = (v) => `×${Number(v).toFixed(1)}`;

/**
 * @param {{onChange: (patch: object) => void, onTheme: (t: string) => void, onMinimal: (b: boolean) => void, onOpenPicker: () => void}} h
 */
export function createSettings(h) {
  const panel = $('settings-panel');
  const btn = $('btn-settings');
  const wpm = /** @type {HTMLInputElement} */ ($('setting-wpm'));
  const ranges = [
    ['commaMult', $('setting-comma'), byId('out-comma')],
    ['sentenceMult', $('setting-sentence'), byId('out-sentence')],
    ['verseMult', $('setting-verse'), byId('out-verse')],
  ];

  function open() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }
  function close() {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', () => (panel.hidden ? open() : close()));
  $('btn-settings-close').addEventListener('click', close);
  document.addEventListener('pointerdown', (e) => {
    if (panel.hidden) return;
    const t = /** @type {Node} */ (e.target);
    if (panel.contains(t) || btn.contains(t)) return;
    // The "How Word works" explainer opens from inside the panel; using it must not close the panel behind it.
    if (t instanceof Element && t.closest('[data-testid="welcome"]')) return;
    close();
  });

  wpm.addEventListener('input', () => {
    const v = Number(wpm.value);
    byId('out-wpm').textContent = `${v} WPM`;
    h.onChange({ wpm: v });
  });
  for (const [key, input, out] of ranges) {
    input.addEventListener('input', () => {
      const v = Math.round(Number(/** @type {HTMLInputElement} */ (input).value) * 10) / 10;
      out.textContent = fmtMult(v);
      h.onChange({ [key]: v });
    });
  }
  for (const n of [1, 2, 3]) {
    $(`setting-frame-${n}`).addEventListener('click', () => h.onChange({ frameSize: n }));
  }
  $('setting-red-letter').addEventListener('change', (e) => h.onChange({ redLetter: /** @type {HTMLInputElement} */ (e.target).checked }));
  for (const m of ['clear', 'semi', 'off']) {
    $(`setting-status-${m}`).addEventListener('change', () => h.onChange({ status: m }));
  }
  for (const t of ['dark', 'light']) $(`setting-theme-${t}`).addEventListener('change', () => h.onTheme(t));
  $('setting-minimal').addEventListener('change', (e) => h.onMinimal(/** @type {HTMLInputElement} */ (e.target).checked));
  $('btn-open-picker').addEventListener('click', () => {
    close();
    h.onOpenPicker();
  });

  return {
    open,
    close,
    isOpen: () => !panel.hidden,
    /** Reflect settings into the controls. */
    sync(s, theme, minimal) {
      wpm.value = String(s.wpm);
      byId('out-wpm').textContent = `${s.wpm} WPM`;
      for (const [key, input, out] of ranges) {
        /** @type {HTMLInputElement} */ (input).value = String(s[key]);
        out.textContent = fmtMult(s[key]);
      }
      for (const n of [1, 2, 3]) $(`setting-frame-${n}`).setAttribute('aria-pressed', String(s.frameSize === n));
      /** @type {HTMLInputElement} */ ($('setting-red-letter')).checked = s.redLetter;
      /** @type {HTMLInputElement} */ ($(`setting-status-${s.status}`)).checked = true;
      /** @type {HTMLInputElement} */ ($(`setting-theme-${theme}`)).checked = true;
      /** @type {HTMLInputElement} */ ($('setting-minimal')).checked = minimal;
    },
  };
}
