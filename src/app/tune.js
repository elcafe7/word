// User percent tuning for the RSVP word size, applied on top of the CSS --word-size preset.
export const PCT_MIN = 50;
export const PCT_MAX = 300;
export const PCT_DEFAULT = 100;

/** Clamp to [50, 300] and round to a whole number; anything that is not a finite number falls back to 100. */
export function clampPct(v) {
  const n = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v)) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return PCT_DEFAULT;
  return Math.min(PCT_MAX, Math.max(PCT_MIN, Math.round(n)));
}

/** Set --font-scale on :root so .word and the brake strip multiply by the user's percent. */
export function applyFontPct(pct, root = document.documentElement) {
  root.style.setProperty('--font-scale', String(clampPct(pct) / 100));
}

/**
 * Typed percent field: apply live while the number is valid, but leave the field alone mid-typing;
 * on change/Enter clamp to 50–300 (empty or junk reverts to the saved value) and rewrite it.
 * @param {HTMLInputElement} input
 * @param {(v: unknown, writeField?: boolean) => void} apply
 * @param {() => number} saved
 */
export function wirePct(input, apply, saved) {
  input.addEventListener('input', () => {
    const n = Number(input.value);
    if (input.value.trim() !== '' && Number.isFinite(n) && n >= PCT_MIN && n <= PCT_MAX) apply(n, false);
  });
  const commit = () => apply(input.value.trim() === '' ? saved() : input.value);
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      input.blur();
    }
  });
}
