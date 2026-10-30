// First-visit explainer (SPEC §10.13). A native modal <dialog>: the page behind is inert,
// focus moves in and is trapped, Esc closes, and focus goes back to whatever opened it.
import { $ } from './dom.js';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** @param {{onOpen?: () => void}} [h] */
export function createWelcome(h = {}) {
  const dlg = /** @type {HTMLDialogElement} */ ($('welcome'));
  /** @type {HTMLElement|null} */
  let returnTo = null;

  const focusables = () => /** @type {HTMLElement[]} */ ([...dlg.querySelectorAll(FOCUSABLE)]).filter((n) => !n.hidden);

  /** @param {HTMLElement|null} [trigger] element that gets focus back on close */
  function open(trigger) {
    if (dlg.open) return;
    returnTo = trigger ?? /** @type {HTMLElement|null} */ (document.activeElement);
    h.onOpen?.();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    $('welcome-close').focus();
  }

  function close() {
    if (!dlg.open) return;
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  dlg.addEventListener('close', () => {
    const t = returnTo;
    returnTo = null;
    if (t && t.isConnected && typeof t.focus === 'function') t.focus();
  });
  // Esc: the browser fires 'cancel'; close ourselves so the return-focus path is the same.
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dlg.addEventListener('keydown', (e) => {
    // Keep the reader's shortcuts (Space, arrows, M, T, /) from acting behind the dialog.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dlg.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dlg.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  // A click on the backdrop (outside the card) closes, as in Verse.
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });
  $('welcome-close').addEventListener('click', close);
  $('welcome-start').addEventListener('click', close);

  return { open, close, isOpen: () => dlg.open };
}
