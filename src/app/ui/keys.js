// Keyboard shortcuts and the document-level swipe (SPEC §10.10, §10.11).

/**
 * @param {{isPickerOpen: () => boolean, isSettingsOpen: () => boolean, actions: Record<string, () => void>}} h
 */
export function installKeys(h) {
  const a = h.actions;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      a.escape();
      return;
    }
    if (h.isPickerOpen()) return;
    const t = /** @type {HTMLElement} */ (e.target);
    if (t && t.matches && t.matches('input, select, textarea, [contenteditable="true"]')) return;
    const k = e.key;
    if (k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      a.toggle();
    } else if (k === 'ArrowLeft') {
      e.preventDefault();
      a.back();
    } else if (k === 'ArrowRight') {
      e.preventDefault();
      a.forward();
    } else if (k === 'ArrowUp') {
      e.preventDefault();
      a.faster();
    } else if (k === 'ArrowDown') {
      e.preventDefault();
      a.slower();
    } else if (k.toLowerCase() === 'm') {
      a.minimal();
    } else if (k.toLowerCase() === 't') {
      a.theme();
    } else if (k === '/') {
      e.preventDefault();
      a.picker();
    }
  });

  // Verse's rule: a horizontal swipe of more than 40px anywhere outside the stage.
  let startX = null;
  document.addEventListener('touchstart', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    startX = t && t.closest && t.closest('[data-testid="stage"], [data-testid="picker"], [data-testid="settings-panel"], [data-testid="welcome"], [data-testid="speed-scale"], input, select') ? null : e.changedTouches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (h.isPickerOpen() || h.isSettingsOpen()) return;
    if (dx < -40) a.forward();
    else if (dx > 40) a.back();
  }, { passive: true });
}
