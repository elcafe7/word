// Pointer gestures on the stage: tap, quick swipe, hold-to-Brake with drag scrubbing (SPEC §10.10).
import { extractWordFrame } from '../../engine/frames.js';
import { clamp } from '../../engine/rsvp-utils.js';
import { $, clear, el } from './dom.js';

const HOLD_MS = 300;
const MOVE_PX = 10;
const SWIPE_PX = 40;
const PX_PER_WORD = 32;

/**
 * @param {{player: object, onSeek: () => void, onToggle: () => void, onBack: () => void, onForward: () => void}} h
 */
export function createBrake(h) {
  const stage = $('stage');
  const strip = $('brake-strip');
  let down = null;
  let brake = null;

  function renderStrip() {
    clear(strip);
    const { start, words } = extractWordFrame(h.player.getTokens(), brake.center, 15);
    words.forEach((w, k) => {
      const i = start + k;
      const span = el('span', { class: i === brake.center ? 'strip-word current' : 'strip-word', 'data-testid': 'strip-word', 'data-index': String(i) }, w);
      strip.append(span);
    });
  }

  function startBrake() {
    const s = h.player.getState();
    if (!s.tokensLen) return;
    brake = { wasPlaying: s.playing, start: s.index, center: s.index };
    h.player.pause();
    strip.hidden = false;
    stage.classList.add('braking');
    renderStrip();
  }

  function endBrake(commit) {
    if (!brake) return;
    const b = brake;
    brake = null;
    strip.hidden = true;
    stage.classList.remove('braking');
    if (commit) {
      h.player.seekToken(b.center);
      h.onSeek();
    }
    if (b.wasPlaying) h.player.play();
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events may not be capturable */
    }
    const d = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, timer: 0 };
    d.timer = window.setTimeout(() => {
      if (down === d && d.moved < MOVE_PX) startBrake();
    }, HOLD_MS);
    down = d;
  });

  stage.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    down.moved = Math.max(down.moved, Math.hypot(dx, e.clientY - down.y));
    if (brake) {
      const c = clamp(brake.start - Math.round(dx / PX_PER_WORD), 0, h.player.getState().tokensLen - 1);
      if (c !== brake.center) {
        brake.center = c;
        renderStrip();
      }
    }
  });

  function up(e, cancelled) {
    if (!down || e.pointerId !== down.id) return;
    const d = down;
    down = null;
    window.clearTimeout(d.timer);
    if (brake) {
      endBrake(!cancelled);
      return;
    }
    if (cancelled) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > SWIPE_PX) {
      if (dx < 0) h.onForward();
      else h.onBack();
    } else if (d.moved < MOVE_PX) {
      h.onToggle();
    }
  }
  stage.addEventListener('pointerup', (e) => up(e, false));
  stage.addEventListener('pointercancel', (e) => up(e, true));
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    isActive: () => !!brake,
    cancel: () => {
      if (down) window.clearTimeout(down.timer);
      down = null;
      endBrake(false);
    },
  };
}
