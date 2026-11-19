import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitWord } from '../../src/app/ui/card.js';

function box(el, { clientWidth, scrollWidth, fontSize }) {
  if (clientWidth != null) Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  if (scrollWidth != null) Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  if (fontSize) vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontSize });
  return el;
}

describe('fitWord', () => {
  afterEach(() => vi.restoreAllMocks());

  it('leaves a frame that already fits alone', () => {
    const word = document.createElement('div');
    const span = document.createElement('span');
    word.append(span);
    box(word, { clientWidth: 200 });
    box(span, { scrollWidth: 120 });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontSize: '40px' });
    fitWord(word, false);
    expect(word.style.fontSize).toBe('');
  });

  it('shrinks a plain frame that overflows the card', () => {
    const word = document.createElement('div');
    const span = document.createElement('span');
    word.append(span);
    box(word, { clientWidth: 200 });
    box(span, { scrollWidth: 400 });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontSize: '40px' });
    fitWord(word, false);
    // floor((40 * 200 / 400) * 10) / 10
    expect(word.style.fontSize).toBe('20px');
  });

  it('shrinks a red-letter frame from the orp plus the wider side', () => {
    const word = document.createElement('div');
    const before = document.createElement('span');
    const orp = document.createElement('span');
    const after = document.createElement('span');
    word.append(before, orp, after);
    box(word, { clientWidth: 200 });
    box(before, { scrollWidth: 80 });
    box(orp, { scrollWidth: 20 });
    box(after, { scrollWidth: 120 });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontSize: '50px' });
    fitWord(word, true);
    // needed = 2 * 120 + 20 = 260; floor((50 * 200 / 260) * 10) / 10 = 38.4
    expect(word.style.fontSize).toBe('38.4px');
  });

  it('does nothing when the card has no width yet', () => {
    const word = document.createElement('div');
    const span = document.createElement('span');
    word.append(span);
    box(word, { clientWidth: 0 });
    box(span, { scrollWidth: 400 });
    fitWord(word, false);
    expect(word.style.fontSize).toBe('');
  });
});
