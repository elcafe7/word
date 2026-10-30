#!/usr/bin/env bash
# Word offline: three self-contained single-file HTMLs, one per edition (offline SPEC §2.8).
#   scripts/build-offline.sh [YYYYMMDD] [out-dir]
# The date defaults to today in America/New_York; out-dir defaults to
# $WORD_OFFLINE_STAGING/word-offline-<YYYYMMDD-HHMM>/ (WORD_OFFLINE_STAGING defaults to ./release).
# Never overwrites. Deploys and publishes nothing. Needs public/data (npm run data).
set -euo pipefail
cd "$(dirname "$0")/.."

DATE="${1:-$(TZ=America/New_York date +%Y%m%d)}"
[[ "$DATE" =~ ^[0-9]{8}$ ]] || { echo "date must be YYYYMMDD" >&2; exit 2; }
STAMP="$(TZ=America/New_York date +%Y%m%d-%H%M)"
OUT="${2:-${WORD_OFFLINE_STAGING:-release}/word-offline-$STAMP}"
TAG="${WORD_OFFLINE_TAG:-offline-$DATE}"
[[ "$TAG" =~ ^offline-[0-9]{8}(-[0-9]+)?$ ]] || { echo "tag must look like offline-YYYYMMDD" >&2; exit 2; }
ISO="${DATE:0:4}-${DATE:4:2}-${DATE:6:2}"
test -f public/data/index.json || { echo "public/data/index.json missing: run npm run data" >&2; exit 1; }
if [ -e "$OUT" ]; then echo "$OUT exists; never overwrite" >&2; exit 1; fi

COMMIT="$(git rev-parse --short=7 HEAD 2>/dev/null || echo nogit000)"
if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then COMMIT="${COMMIT}+dirty"; fi
mkdir -p "$OUT"
declare -A FILE=([gen]=word-geneva1599.html [kjv]=word-kjv.html [kj16]=word-kjv1611.html)
declare -A BYTES

for ed in gen kjv kj16; do
  dist="dist-offline-$ed"
  rm -rf "$dist"
  WORD_OFFLINE=1 WORD_OFFLINE_EDITION="$ed" WORD_OFFLINE_TAG="$TAG" WORD_BUILD_ID="$COMMIT" WORD_OUT_DIR="$dist" \
    npx vite build --logLevel warn
  # Only the app shell goes into the file; the build must not have copied the data folder's thousands of files.
  rm -rf "$dist/data"
  node scripts/offline/inline.mjs "$dist" public/data "$ed" "$DATE" "$COMMIT" "$OUT/${FILE[$ed]}"
  rm -rf "$dist"
  BYTES[$ed]=$(stat -c %s "$OUT/${FILE[$ed]}")
done

n=$(find "$OUT" -maxdepth 1 -name 'word-*.html' | wc -l)
[ "$n" -eq 3 ] || { echo "expected 3 HTML files, found $n" >&2; exit 1; }
(cd "$OUT" && sha256sum word-geneva1599.html word-kjv.html word-kjv1611.html > SHA256SUMS && sha256sum -c --quiet SHA256SUMS)

printf '{"tag":"%s","files":{"gen":%s,"kjv":%s,"kj16":%s}}\n' "$TAG" "${BYTES[gen]}" "${BYTES[kjv]}" "${BYTES[kj16]}" > "$OUT/offline-release.json"

mb() { awk -v b="$1" 'BEGIN { printf "%.1f", b / 1e6 }'; }
PREV="${WORD_OFFLINE_PREV_TAG:-}"
{
  echo "Word offline: scripture one word at a time, no internet needed. One self-contained HTML file per Bible; download the one you want."
  echo
  echo "- word-geneva1599.html: Geneva Bible (1599), 66 books, $(mb "${BYTES[gen]}") MB"
  echo "- word-kjv.html: King James Version (Oxford 1769), 66 books, $(mb "${BYTES[kjv]}") MB"
  echo "- word-kjv1611.html: King James Version (1611 Original), 66 books, $(mb "${BYTES[kj16]}") MB"
  echo "- SHA256SUMS: checksums for the three files"
  echo
  echo "How to open:"
  echo "- Computer: double-click the file (Chrome, Edge, Firefox or Safari)."
  echo "- Android: open it from the Files app, choose Chrome, then \"Just once\"."
  echo "- iPhone/iPad: save the file to Files, then open it in the free Koder app (https://apps.apple.com/us/app/koder-code-editor/id1447489375) and tap Preview. See the README."
  echo
  if [ -n "$PREV" ]; then echo "New since $PREV:"; echo "- (fill in)"; else echo "First offline release."; fi
  echo
  echo "Built $ISO from commit $COMMIT, data version $(node -p 'require("./public/data/index.json").dataVersion')."
} > "$OUT/RELEASE-NOTES.md"

echo "$OUT"
cat "$OUT/SHA256SUMS"
