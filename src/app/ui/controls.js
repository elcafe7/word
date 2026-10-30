// Status bar, play toggle, Previous/Next verse buttons, minimal toggle (SPEC §10.4).
import { display } from '../ref.js';
import { bookByAbbr, nextVerse, prevVerse } from '../books.js';
import { $, byId } from './dom.js';

export function createControls(index) {
  const statusText = $('status-text');
  const status = $('status');
  const minimalRef = $('minimal-ref');
  const play = $('btn-play');
  const back = $('btn-back');
  const fwd = $('btn-forward');
  const glyph = play.querySelector('.play-glyph');

  return {
    renderPosition(state, edition) {
      // The closed selector shows the reference only; the edition is in the header select (Nate, 2026-10-24)
      // and stays in the accessible name. Minimal mode shows the same reference as a faint, inert label.
      const ref = display(state.book, state.chapter, state.verse);
      statusText.textContent = ref;
      status.setAttribute('aria-label', `${ref}, ${edition.short}, change passage`);
      minimalRef.textContent = ref;
      const atStart = state.abbr === 'Gen' && state.chapter === 1 && state.verse === 1 && state.word === 0;
      const pv = atStart ? null : prevVerse(index, state.abbr, state.chapter, state.verse) ?? { abbr: state.abbr, chapter: state.chapter, verse: state.verse };
      const nv = nextVerse(index, state.abbr, state.chapter, state.verse);
      byId('back-label').textContent = pv ? display(bookByAbbr(index, pv.abbr), pv.chapter, pv.verse) : 'Start of text';
      byId('forward-label').textContent = nv ? display(bookByAbbr(index, nv.abbr), nv.chapter, nv.verse) : 'End of text';
      back.disabled = !pv;
      fwd.disabled = !nv;
    },
    renderPlay(state, wpm) {
      const s = state.ended ? 'ended' : state.playing ? 'playing' : 'paused';
      play.dataset.state = s;
      glyph.textContent = s === 'playing' ? '❚❚' : '▶';
      const label = s === 'playing' ? 'Pause' : 'Play';
      byId('play-label').textContent = label;
      play.setAttribute('aria-label', label);
      byId('wpm-label').textContent = `${wpm} WPM`;
      status.dataset.playing = String(s === 'playing');
    },
    setStatusMode(mode) {
      status.dataset.mode = mode;
      status.tabIndex = mode === 'off' ? -1 : 0;
      minimalRef.hidden = mode === 'off';
    },
    setMinimal(on) {
      const b = $('btn-minimal');
      b.setAttribute('aria-pressed', String(on));
      byId('minimal-status').textContent = on ? 'On' : 'Off';
    },
  };
}
