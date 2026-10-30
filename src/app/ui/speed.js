// Speed scale (SPEC-speed-scale): the always-visible "Words per minute" slider under the
// playback buttons, after Word Runner's control strip (/reader/). Original code for Word.
import { $, byId } from './dom.js';

export const WPM_MIN = 100;
export const WPM_MAX = 900;
export const WPM_STEP = 25;

/**
 * Clamp to 100–900 and snap to the 25 step. Non-numbers → null.
 * @param {unknown} v
 * @returns {number|null}
 */
export function snapWpm(v) {
  const n = Number(v);
  if (v === null || v === '' || !Number.isFinite(n)) return null;
  const c = Math.min(WPM_MAX, Math.max(WPM_MIN, n));
  return WPM_MIN + Math.round((c - WPM_MIN) / WPM_STEP) * WPM_STEP;
}

// Touch hit zone (Nate, 2026-10-24): the native range only reacts to a touch right on its
// thumb, which is strict on a phone. The whole .speed-scale panel listens instead and, without
// changing anything visible, accepts:
//   - a circle of 3x the thumb's diameter around the thumb: grabs it where it is (no jump) and
//     drags it by the finger's movement;
//   - a band 3x the track's height (at least 48px) along the track: a tap sets the value there,
//     as a click on the track does today, and a sideways drag follows the finger.
// The zone never leaves the panel, so the Play and Minimal buttons keep their own taps, and the
// panel is touch-action: pan-y so a vertical swipe still scrolls the page.
export const HIT_SCALE = 3;
export const MIN_BAND_PX = 48;
const DRAG_PX = 4;
const SCROLL_PX = 8;

/**
 * Thumb width the browser draws: the range's own height, kept to 16–28px (Chromium 16, WebKit 20,
 * iOS up to 28).
 * @param {{height: number}} r
 */
export function thumbSize(r) {
  return Math.min(28, Math.max(16, r.height));
}

/**
 * Centre x of the thumb for a value, as the browser lays it out (centre travels from
 * left + t/2 to right − t/2).
 * @param {{left: number, width: number, height: number}} r
 * @param {number} w
 */
export function thumbX(r, w) {
  const t = thumbSize(r);
  return r.left + t / 2 + ((w - WPM_MIN) / (WPM_MAX - WPM_MIN)) * (r.width - t);
}

/**
 * Snapped value under client x (the inverse of thumbX).
 * @param {{left: number, width: number, height: number}} r
 * @param {number} x
 */
export function valueAtX(r, x) {
  const t = thumbSize(r);
  const span = Math.max(1, r.width - t);
  return /** @type {number} */ (snapWpm(WPM_MIN + ((x - r.left - t / 2) / span) * (WPM_MAX - WPM_MIN)));
}

/**
 * Where a press lands: 'thumb' (inside the 3x circle), 'track' (inside the 3x band over the
 * track's length), or null (leave it alone).
 * @param {{left: number, top: number, width: number, height: number}} r range rect
 * @param {number} w current value
 * @param {number} x
 * @param {number} y
 */
export function hitTarget(r, w, x, y) {
  const t = thumbSize(r);
  const cy = r.top + r.height / 2;
  if (Math.hypot(x - thumbX(r, w), y - cy) <= (t * HIT_SCALE) / 2) return 'thumb';
  const half = Math.max(MIN_BAND_PX, r.height * HIT_SCALE) / 2;
  if (Math.abs(y - cy) <= half && x >= r.left && x <= r.left + r.width) return 'track';
  return null;
}

/**
 * @param {{onChange: (patch: {wpm: number}) => void}} h
 */
export function createSpeedScale(h) {
  const input = /** @type {HTMLInputElement} */ ($('wpm-slider'));
  const value = byId('wpm-value');

  function show(w) {
    value.textContent = String(w);
    input.setAttribute('aria-valuetext', `${w} words per minute`);
  }

  input.addEventListener('input', () => {
    const w = snapWpm(input.value);
    if (w === null) return;
    show(w);
    h.onChange({ wpm: w });
  });
  // As in Word Runner: drop focus once a drag/click is committed so Space and the arrow keys
  // go back to the document shortcuts (play/pause, verse, ±25 WPM).
  input.addEventListener('change', () => input.blur());

  const zone = /** @type {HTMLElement|null} */ (input.closest('[data-testid="speed-scale"]'));
  /** @type {null|{id: number, kind: string, x0: number, y0: number, offset: number, active: boolean, start: number}} */
  let drag = null;

  function setFromX(x) {
    const w = valueAtX(input.getBoundingClientRect(), x);
    if (w === Number(input.value)) return;
    input.value = String(w);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function finish(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (zone.hasPointerCapture?.(e.pointerId)) zone.releasePointerCapture(e.pointerId);
    if (Number(input.value) !== d.start) input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (zone) {
    zone.addEventListener('pointerdown', (e) => {
      if (drag || (e.button !== undefined && e.button > 0)) return;
      const r = input.getBoundingClientRect();
      const w = Number(input.value);
      const kind = hitTarget(r, w, e.clientX, e.clientY);
      if (!kind) return;
      const mouse = e.pointerType === 'mouse';
      if (mouse) e.preventDefault();
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events may not be capturable */
      }
      drag = {
        id: e.pointerId,
        kind,
        x0: e.clientX,
        y0: e.clientY,
        offset: kind === 'thumb' ? e.clientX - thumbX(r, w) : 0,
        // A mouse acts at once, like the native range. A finger waits to see whether it is a
        // tap, a sideways drag, or the start of a page scroll.
        active: mouse,
        start: w,
      };
      if (mouse && kind === 'track') setFromX(e.clientX);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.active) {
        const dx = Math.abs(e.clientX - drag.x0);
        const dy = Math.abs(e.clientY - drag.y0);
        if (dx >= DRAG_PX && dx >= dy) drag.active = true;
        else if (dy >= SCROLL_PX) {
          finish(e);
          return;
        } else return;
      }
      setFromX(e.clientX - drag.offset);
    });
    zone.addEventListener('pointerup', (e) => {
      if (drag && e.pointerId === drag.id && !drag.active && drag.kind === 'track') setFromX(e.clientX);
      finish(e);
    });
    zone.addEventListener('pointercancel', finish);
  }

  return {
    /** Reflect the saved WPM (from settings, keys, or storage). @param {number} w */
    sync(w) {
      input.value = String(w);
      show(w);
    },
  };
}
