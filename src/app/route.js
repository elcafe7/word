// Hash routes for the offline single-file build (offline SPEC §2.4): file.html#/gen/John-3-16.
// The online build keeps path URLs and history directly in main.js; only the WORD_OFFLINE bundle uses this.

/** "/gen/John-3-16" from location.hash ("#/gen/John-3-16"), for ref.js parsePath with base "/". */
export function hashPath(loc = location) {
  return `/${String(loc.hash ?? '').replace(/^#\/?/, '')}`;
}

/** "#/gen/John-3-16" */
export function formatHash(edition, book, chapter, verse) {
  return `#/${edition}/${book.slug}-${chapter}-${verse}`;
}

/** Writes the hash with pushState/replaceState; falls back to location.hash / location.replace when history throws. */
export function writeHash(hash, push, loc = location, hist = history) {
  if (loc.hash === hash) return;
  try {
    if (push) hist.pushState(null, '', hash);
    else hist.replaceState(null, '', hash);
  } catch {
    try {
      if (push) loc.hash = hash;
      else loc.replace(hash);
    } catch {
      /* the hash is a convenience; storage still keeps the place */
    }
  }
}
