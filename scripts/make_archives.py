#!/usr/bin/env python3
"""Build the combined all-editions archives for a Word offline release.

Usage:
  make_archives.py build  --html-dir DIR --out-dir DIR --date YYYYMMDD --license LICENSE
  make_archives.py verify --html-dir DIR --out-dir DIR --date YYYYMMDD --license LICENSE [--contents-only]

Writes word-offline-<date>-all-editions.zip and .tar.gz. Each holds one folder,
word-offline-<date>-all-editions/, with every word-*.html edition found in
--html-dir, a short README.txt and LICENSE.

The archives are deterministic: files sorted by name, every mtime fixed to
<date> 00:00:00 UTC, owner root, fixed modes, no gzip name or timestamp. The same
inputs always give byte-identical archives (so a rebuild can be compared).
`verify` rebuilds into a temp dir and checks the rebuild is byte-identical (skipped
with --contents-only), and that every file inside each archive matches its source file exactly.
Standard library only.
"""

import argparse
import calendar
import gzip
import hashlib
import io
import re
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path

EDITIONS = {
    "word-geneva1599.html": "Geneva Bible (1599), 66 books plus the Apocrypha (7 books)",
    "word-kjv.html": "King James Version (Oxford 1769), 66 books (no Apocrypha)",
    "word-kjv1611.html": "King James Version (1611 Original), 66 books plus the Apocrypha (14 books)",
}
DATE_RE = re.compile(r"^[0-9]{8}$")


def fail(msg):
    print(f"make_archives: {msg}", file=sys.stderr)
    sys.exit(1)


def mtime_for(date):
    y, m, d = int(date[:4]), int(date[4:6]), int(date[6:])
    return calendar.timegm((y, m, d, 0, 0, 0))


def readme_text(date, names):
    iso = f"{date[:4]}-{date[4:6]}-{date[6:]}"
    lines = [
        f"Word offline, all editions ({iso})",
        "=" * 40,
        "",
        "Word shows scripture one word at a time. It needs no internet.",
        "Each file below is a complete, self-contained Bible. Pick one and open it.",
        "",
        "Files:",
    ]
    for n in names:
        lines.append(f"  {n}")
        lines.append(f"      {EDITIONS.get(n, 'Word offline edition')}")
    lines += [
        "  LICENSE",
        "      MIT License.",
        "",
        "How to open:",
        "  Computer: double-click the .html file. It opens in your browser",
        "            (Chrome, Edge, Firefox or Safari). Nothing to install.",
        "  Android:  open it from the Files app, choose Chrome, then \"Just once\".",
        "  iPhone/iPad: save the file to Files, open it in the free Koder app, tap Preview.",
        "",
        "Project: https://github.com/elcafe7/word",
        "",
    ]
    return "\n".join(lines).encode("utf-8")


def collect(html_dir, license_path, date):
    html = sorted(p for p in Path(html_dir).glob("word-*.html") if p.is_file())
    if not html:
        fail(f"no word-*.html files in {html_dir}")
    lic = Path(license_path)
    if not lic.is_file():
        fail(f"license not found: {license_path}")
    names = [p.name for p in html]
    members = {p.name: p.read_bytes() for p in html}
    members["LICENSE"] = lic.read_bytes()
    members["README.txt"] = readme_text(date, names)
    return dict(sorted(members.items()))


def build(html_dir, out_dir, date, license_path):
    if not DATE_RE.match(date):
        fail("--date must be YYYYMMDD")
    members = collect(html_dir, license_path, date)
    root = f"word-offline-{date}-all-editions"
    mtime = mtime_for(date)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    zpath = out / f"{root}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for name, data in members.items():
            zi = zipfile.ZipInfo(f"{root}/{name}", date_time=(int(date[:4]), int(date[4:6]), int(date[6:]), 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = (0o100644) << 16
            zi.create_system = 3
            zf.writestr(zi, data, compresslevel=9)

    tpath = out / f"{root}.tar.gz"
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w", format=tarfile.PAX_FORMAT) as tf:
        for name, data in members.items():
            ti = tarfile.TarInfo(f"{root}/{name}")
            ti.size = len(data)
            ti.mtime = mtime
            ti.mode = 0o644
            ti.uid = ti.gid = 0
            ti.uname = ti.gname = "root"
            tf.addfile(ti, io.BytesIO(data))
    with open(tpath, "wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as gz:
            gz.write(buf.getvalue())
    return zpath, tpath, members, root


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def verify(html_dir, out_dir, date, license_path, contents_only=False):
    root = f"word-offline-{date}-all-editions"
    zpath = Path(out_dir) / f"{root}.zip"
    tpath = Path(out_dir) / f"{root}.tar.gz"
    members = collect(html_dir, license_path, date)
    for p in (zpath, tpath):
        if not p.is_file():
            fail(f"missing archive {p}")
    if not contents_only:
        with tempfile.TemporaryDirectory() as tmp:
            z2, t2, _, _ = build(html_dir, tmp, date, license_path)
            if sha(z2) != sha(zpath) or sha(t2) != sha(tpath):
                fail("rebuild is not byte-identical to the archives (not deterministic or inputs changed)")
    with zipfile.ZipFile(zpath) as zf:
        if zf.testzip() is not None:
            fail("zip failed its CRC test")
        got = sorted(zf.namelist())
        want = sorted(f"{root}/{n}" for n in members)
        if got != want:
            fail(f"zip members {got} != {want}")
        for n, data in members.items():
            if zf.read(f"{root}/{n}") != data:
                fail(f"zip member {n} differs from source")
    with tarfile.open(tpath, "r:gz") as tf:
        got = sorted(tf.getnames())
        want = sorted(f"{root}/{n}" for n in members)
        if got != want:
            fail(f"tar members {got} != {want}")
        for n, data in members.items():
            if tf.extractfile(f"{root}/{n}").read() != data:
                fail(f"tar member {n} differs from source")
    print(f"verified {zpath.name} and {tpath.name}: {len(members)} files each, byte-identical to sources")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=("build", "verify"))
    ap.add_argument("--html-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--date", required=True)
    ap.add_argument("--license", required=True)
    ap.add_argument("--contents-only", action="store_true",
                    help="verify: check every file inside the archives against its source, skip the byte-identical rebuild")
    a = ap.parse_args(argv)
    if not DATE_RE.match(a.date):
        fail("--date must be YYYYMMDD")
    if a.mode == "build":
        z, t, _, _ = build(a.html_dir, a.out_dir, a.date, a.license)
        print(z, t)
    else:
        verify(a.html_dir, a.out_dir, a.date, a.license, a.contents_only)


if __name__ == "__main__":
    main()
