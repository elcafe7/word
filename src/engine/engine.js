// Word RSVP engine — original code written for Word (not derived from any third-party RSVP project).
import { frameDelay } from './pacing.js';
import { frameEnd } from './frames.js';
import { clamp, uniqueSorted } from './rsvp-utils.js';

/**
 * Timer-driven RSVP playback over one token array.
 * Callbacks: onWord(index, end) for every frame shown; onStateChange(playing);
 * onChapterEnd() after the last frame's time has elapsed (the last frame stays current).
 * @param {object} o
 */
export function createEngine(o) {
  const tokens = o.tokens;
  const sorted = { sorted: uniqueSorted(o.paraStarts?.length ? o.paraStarts : [0]) };
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((id) => clearTimeout(id));
  const onWord = o.onWord ?? (() => {});
  const onChapterEnd = o.onChapterEnd ?? (() => {});
  const onStateChange = o.onStateChange ?? (() => {});
  let wpm = o.wpm ?? 300;
  let frameSize = o.frameSize ?? 1;
  let mults = { comma: 1.5, sentence: 2, para: 2.5, ...(o.mults ?? {}) };
  const len = tokens.length;
  let index = clamp(o.index ?? 0, 0, Math.max(0, len - 1));
  let end = computeEnd(index);
  let playing = false;
  let timer = null;
  let shownSincePlay = 0;
  let destroyed = false;

  function computeEnd(i) {
    return len ? frameEnd(tokens, i, frameSize, sorted) : 0;
  }
  function isParaEnd(e) {
    if (e >= len) return true;
    const s = sorted.sorted;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (s[m] < e) lo = m + 1;
      else hi = m;
    }
    return s[lo] === e;
  }
  function stopTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function show() {
    end = computeEnd(index);
    onWord(index, end);
  }
  function schedule() {
    const words = tokens.slice(index, end);
    const ms = frameDelay({ words, wpm, mults, paraEnd: isParaEnd(end), rampStep: shownSincePlay });
    shownSincePlay += words.length;
    timer = setTimer(tick, ms);
  }
  function tick() {
    timer = null;
    if (!playing || destroyed) return;
    if (end >= len) {
      playing = false;
      onStateChange(false);
      onChapterEnd();
      return;
    }
    index = end;
    show();
    schedule();
  }

  return {
    play() {
      if (playing || destroyed || !len) return;
      playing = true;
      shownSincePlay = 0;
      onStateChange(true);
      show();
      schedule();
    },
    pause() {
      if (!playing) return;
      playing = false;
      stopTimer();
      onStateChange(false);
    },
    toggle() {
      if (playing) this.pause();
      else this.play();
    },
    seek(i) {
      if (destroyed || !len) return;
      index = clamp(i, 0, len - 1);
      if (playing) {
        stopTimer();
        shownSincePlay = 0;
        show();
        schedule();
      } else {
        show();
      }
    },
    setWpm(v) {
      wpm = v;
    },
    setFrameSize(n) {
      frameSize = n;
      if (!playing && len) show();
    },
    setMults(m) {
      mults = { ...mults, ...m };
    },
    getMults() {
      return { ...mults };
    },
    getIndex() {
      return index;
    },
    getFrameEnd() {
      return end;
    },
    isPlaying() {
      return playing;
    },
    destroy() {
      stopTimer();
      playing = false;
      destroyed = true;
    },
  };
}
