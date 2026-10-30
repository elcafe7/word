// Deterministic clock for engine/player tests: timers fire in time order, fractional ms allowed.
export function createFakeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map();
  const clock = {
    now: () => t,
    setTimer: (fn, ms) => {
      seq += 1;
      timers.set(seq, { fn, at: t + ms, seq });
      return seq;
    },
    clearTimer: (id) => {
      timers.delete(id);
    },
    /** Advance until `ms` from now, firing due timers in order. */
    advance(ms) {
      const target = t + ms;
      for (;;) {
        let next = null;
        for (const tm of timers.values()) {
          if (tm.at <= target && (!next || tm.at < next.at || (tm.at === next.at && tm.seq < next.seq))) next = tm;
        }
        if (!next) break;
        timers.delete(next.seq);
        t = next.at;
        next.fn();
      }
      t = target;
    },
    /** Fire timers one by one until `pred()` is true or `limit` ms pass. */
    runUntil(pred, limit = 600000) {
      const stop = t + limit;
      while (!pred() && t < stop) {
        let next = null;
        for (const tm of timers.values()) if (!next || tm.at < next.at || (tm.at === next.at && tm.seq < next.seq)) next = tm;
        if (!next) return false;
        timers.delete(next.seq);
        t = next.at;
        next.fn();
      }
      return pred();
    },
    pending: () => timers.size,
  };
  return clock;
}

/** Let queued promise callbacks run. */
export async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}
