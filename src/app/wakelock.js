/** Screen Wake Lock while playing — no-op when unsupported or denied. */

let sentinel = null;
let want = false;
let inited = false;

function api() {
  return (typeof navigator !== 'undefined' && navigator.wakeLock) || null;
}

async function acquire() {
  const wl = api();
  if (!wl || !want || document.hidden) return;
  if (sentinel && !sentinel.released) return;
  try {
    sentinel = await wl.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {
    sentinel = null; // unsupported permission / battery / policy — fine
  }
}

/** Hold the screen awake while playing. Safe to call repeatedly. */
export async function request() {
  want = true;
  await acquire();
}

/** Release on pause, end, or stop. */
export async function release() {
  want = false;
  const s = sentinel;
  sentinel = null;
  if (!s || s.released) return;
  try { await s.release(); } catch { /* ignore */ }
}

/** Re-acquire after tab focus if we still want the lock (some browsers drop it on hide). */
export function init() {
  if (inited) return;
  inited = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (want) void acquire();
  });
}
