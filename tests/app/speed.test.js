import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpeedScale, hitTarget, snapWpm, thumbSize, thumbX, valueAtX, WPM_MAX, WPM_MIN, WPM_STEP } from '../../src/app/ui/speed.js';

describe('snapWpm', () => {
  it('keeps values on the 25 step inside 100–900', () => {
    for (const w of [100, 125, 300, 500, 875, 900]) expect(snapWpm(w)).toBe(w);
  });
  it('clamps to the ends', () => {
    expect(snapWpm(75)).toBe(100);
    expect(snapWpm(0)).toBe(100);
    expect(snapWpm(-50)).toBe(100);
    expect(snapWpm(925)).toBe(900);
    expect(snapWpm(5000)).toBe(900);
  });
  it('snaps to the nearest step', () => {
    expect(snapWpm(310)).toBe(300);
    expect(snapWpm(313)).toBe(325);
    expect(snapWpm('612')).toBe(600);
  });
  it('rejects non-numbers', () => {
    for (const v of [null, '', 'fast', NaN, Infinity, undefined]) expect(snapWpm(v)).toBeNull();
  });
  it('matches the reader scale constants', () => {
    expect([WPM_MIN, WPM_MAX, WPM_STEP]).toEqual([100, 900, 25]);
  });
});

describe('createSpeedScale', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <label for="wpm-slider">Words per minute <output id="wpm-value" data-testid="wpm-value">300</output></label>
      <input id="wpm-slider" data-testid="wpm-slider" type="range" min="100" max="900" step="25" value="300">`;
  });
  const slider = () => /** @type {HTMLInputElement} */ (document.getElementById('wpm-slider'));

  it('emits the snapped WPM on input and shows it', () => {
    const onChange = vi.fn();
    createSpeedScale({ onChange });
    slider().value = '650';
    slider().dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith({ wpm: 650 });
    expect(document.getElementById('wpm-value').textContent).toBe('650');
    expect(slider().getAttribute('aria-valuetext')).toBe('650 words per minute');
  });
  it('sync reflects a saved value without emitting', () => {
    const onChange = vi.fn();
    const s = createSpeedScale({ onChange });
    s.sync(425);
    expect(slider().value).toBe('425');
    expect(document.getElementById('wpm-value').textContent).toBe('425');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('drops focus on change so document shortcuts work again', () => {
    createSpeedScale({ onChange: () => {} });
    slider().focus();
    expect(document.activeElement).toBe(slider());
    slider().dispatchEvent(new Event('change'));
    expect(document.activeElement).not.toBe(slider());
  });
});

// Touch zone geometry: a 328x20 range at (31, 593), as on the iPhone 13 layout.
describe('speed scale hit zone', () => {
  const r = { left: 31, top: 593, width: 328, height: 20 };
  const cy = 603;
  it('thumb size follows the range height within 16–28px', () => {
    expect(thumbSize({ height: 20 })).toBe(20);
    expect(thumbSize({ height: 10 })).toBe(16);
    expect(thumbSize({ height: 40 })).toBe(28);
  });
  it('valueAtX inverts thumbX on every step', () => {
    for (let w = WPM_MIN; w <= WPM_MAX; w += WPM_STEP) expect(valueAtX(r, thumbX(r, w))).toBe(w);
    expect(valueAtX(r, 0)).toBe(100);
    expect(valueAtX(r, 2000)).toBe(900);
  });
  it('a circle of 3x the thumb diameter grabs the thumb', () => {
    const x = thumbX(r, 300);
    for (const [dx, dy] of [[0, 0], [0, -20], [0, 20], [20, 0], [-20, 0], [0, -29], [21, 21]]) {
      expect(hitTarget(r, 300, x + dx, cy + dy)).toBe('thumb');
    }
  });
  it('a band 3x the track height (>= 48px) sets the value; outside it nothing', () => {
    const far = thumbX(r, 800);
    expect(hitTarget(r, 300, far, cy - 29)).toBe('track');
    expect(hitTarget(r, 300, far, cy + 29)).toBe('track');
    expect(hitTarget(r, 300, far, cy - 31)).toBeNull();
    expect(hitTarget(r, 300, far, cy + 31)).toBeNull();
    expect(hitTarget({ ...r, height: 10 }, 300, far, cy - 5 + 23)).toBe('track');
    expect(hitTarget(r, 300, r.left - 2, cy)).toBeNull();
  });
});

describe('speed scale pointer handling', () => {
  /** @type {HTMLInputElement} */
  let input;
  /** @type {HTMLElement} */
  let zone;
  const rect = { left: 31, top: 593, width: 328, height: 20, x: 31, y: 593, right: 359, bottom: 613, toJSON() {} };
  const cy = 603;
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="speed-scale" data-testid="speed-scale">
        <label for="wpm-slider">Words per minute <output id="wpm-value">300</output></label>
        <input id="wpm-slider" data-testid="wpm-slider" type="range" min="100" max="900" step="25" value="300">
      </div>`;
    input = /** @type {HTMLInputElement} */ (document.getElementById('wpm-slider'));
    zone = /** @type {HTMLElement} */ (document.querySelector('.speed-scale'));
    input.getBoundingClientRect = () => /** @type {DOMRect} */ (rect);
  });
  const fire = (type, x, y, pointerType = 'touch') => {
    const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(e, 'pointerId', { value: 7 });
    Object.defineProperty(e, 'pointerType', { value: pointerType });
    zone.dispatchEvent(e);
  };

  it('a touch beside the thumb grabs it without a jump and drags by the movement', () => {
    const onChange = vi.fn();
    createSpeedScale({ onChange });
    const x = thumbX(rect, 300);
    fire('pointerdown', x + 18, cy - 18);
    fire('pointerup', x + 18, cy - 18);
    expect(input.value).toBe('300');
    expect(onChange).not.toHaveBeenCalled();
    fire('pointerdown', x, cy + 22);
    fire('pointermove', x + (thumbX(rect, 500) - x), cy + 22);
    fire('pointerup', x + (thumbX(rect, 500) - x), cy + 22);
    expect(input.value).toBe('500');
    expect(onChange).toHaveBeenLastCalledWith({ wpm: 500 });
  });
  it('a tap on the track band sets the value there; a vertical swipe does nothing', () => {
    const onChange = vi.fn();
    createSpeedScale({ onChange });
    const x = thumbX(rect, 700);
    fire('pointerdown', x, cy - 25);
    fire('pointermove', x + 1, cy - 45);
    fire('pointerup', x + 1, cy - 80);
    expect(input.value).toBe('300');
    fire('pointerdown', x, cy + 25);
    fire('pointerup', x, cy + 25);
    expect(input.value).toBe('700');
    expect(onChange).toHaveBeenLastCalledWith({ wpm: 700 });
  });
  it('a mouse press on the track jumps at once, like the native range', () => {
    createSpeedScale({ onChange: () => {} });
    fire('pointerdown', thumbX(rect, 200), cy, 'mouse');
    expect(input.value).toBe('200');
    fire('pointerup', thumbX(rect, 200), cy, 'mouse');
  });
  it('presses outside the zone are ignored', () => {
    createSpeedScale({ onChange: () => {} });
    fire('pointerdown', thumbX(rect, 800), cy - 35);
    fire('pointerup', thumbX(rect, 800), cy - 35);
    expect(input.value).toBe('300');
  });
});
