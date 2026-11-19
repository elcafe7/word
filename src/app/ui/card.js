// The word card: frame rendering, red letter, fit, loading (SPEC §10.4).
import { splitFrame } from '../../engine/frames.js';
import { $, clear, el } from './dom.js';

/** Shrink the RSVP word so a long frame still fits the card at large text sizes. */
export function fitWord(word, redLetter) {
  word.style.fontSize = '';
  const inner = word.clientWidth;
  if (!inner) return;
  let needed;
  if (redLetter) {
    const [b, o, a] = word.children;
    needed = 2 * Math.max(b.scrollWidth, a.scrollWidth) + o.scrollWidth;
  } else {
    needed = word.firstElementChild ? word.firstElementChild.scrollWidth : 0;
  }
  if (needed > inner) {
    const baseSize = parseFloat(getComputedStyle(word).fontSize) || 32;
    word.style.fontSize = `${Math.floor(((baseSize * inner) / needed) * 10) / 10}px`;
  }
}

export function createCard() {
  const card = $('card');
  const word = $('word');
  const stage = $('stage');
  const loading = $('loading');
  let lastRed = true;
  let lastWidth = 0;

  function fit(redLetter) {
    lastRed = redLetter;
    fitWord(word, redLetter);
  }

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      if (w === lastWidth) return;
      lastWidth = w;
      if (word.childElementCount) fit(lastRed);
    }).observe(stage);
  }
  return {
    /** @param {{index: number, words: string[]}} state @param {{redLetter: boolean}} settings */
    render(state, settings) {
      const words = state.words ?? [];
      word.dataset.index = String(state.index);
      word.dataset.count = String(words.length);
      clear(word);
      card.classList.toggle('no-red', !settings.redLetter);
      if (settings.redLetter) {
        const { before, orp, after } = splitFrame(words);
        word.classList.add('grid');
        word.append(el('span', { class: 'before' }, before), el('span', { class: 'orp', 'data-testid': 'orp' }, orp), el('span', { class: 'after' }, after));
      } else {
        word.classList.remove('grid');
        word.append(el('span', { class: 'whole' }, words.join(' ')));
      }
      fit(settings.redLetter);
    },
    setLoading(on) {
      loading.hidden = !on;
      stage.classList.toggle('is-loading', on);
    },
  };
}
