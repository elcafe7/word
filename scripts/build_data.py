#!/usr/bin/env python3
"""Build Word's static scripture data from Verse's SQLite databases (SPEC §5, §6.1).

Reads ONLY kjv.db, kj16.db and gen.db (public-domain texts), read-only, and writes
public/data/index.json plus one JSON file per chapter (each also as .json.gz and,
when the `brotli` module imports, .json.br).

Exit codes: 0 ok, 1 data assertion failed, 2 bad arguments.
Stdlib only (+ optional brotli).
"""
import argparse
import gzip
import hashlib
import io
import json
import os
import re
import shutil
import sqlite3
import sys

try:  # optional
    import brotli  # type: ignore
except Exception:  # pragma: no cover - depends on the box
    brotli = None

ALLOWED_EDITIONS = ("kjv", "kj16", "gen")  # hard allowlist: never anything else
# Where kjv.db, kj16.db and gen.db live: --db-dir, else $WORD_DB_DIR, else repo-relative data/bible_versions
# (the layout of elcafe7/verse and of the public Word repo).
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_DIR = os.environ.get("WORD_DB_DIR") or os.path.join(REPO_ROOT, "data", "bible_versions")
DEFAULT_VERSE_COMMIT = "8ec8a9b146c42f01f3b5e81809046c13cf107c43"  # elcafe7/verse main: Geneva 1599 rebuild
EDITION_META = {
    "kjv": ("King James Version (Oxford 1769)", "KJV"),
    "kj16": ("King James Version (1611 Original)", "KJV 1611"),
    "gen": ("Geneva Bible (1599)", "Geneva"),
}
ATTRIBUTION = "Public domain text"

# Appendix A: (n, name, abbr, aliases)
BOOKS = [
    (1, 'Genesis', 'Gen', ('ge', 'gn', 'gen', 'genesis')),
    (2, 'Exodus', 'Exod', ('ex', 'exo', 'exod', 'exodus')),
    (3, 'Leviticus', 'Lev', ('le', 'lev', 'leviticus')),
    (4, 'Numbers', 'Num', ('nu', 'num', 'numbers')),
    (5, 'Deuteronomy', 'Deut', ('de', 'dt', 'deut', 'deuteronomy')),
    (6, 'Joshua', 'Josh', ('jos', 'josh', 'joshua')),
    (7, 'Judges', 'Judg', ('jdg', 'judg', 'judges')),
    (8, 'Ruth', 'Ruth', ('ru', 'ruth')),
    (9, '1 Samuel', '1Sam', ('1sa', '1sam', '1samuel')),
    (10, '2 Samuel', '2Sam', ('2sa', '2sam', '2samuel')),
    (11, '1 Kings', '1Kgs', ('1ki', '1kgs', '1kings')),
    (12, '2 Kings', '2Kgs', ('2ki', '2kgs', '2kings')),
    (13, '1 Chronicles', '1Chr', ('1ch', '1chr', '1chronicles')),
    (14, '2 Chronicles', '2Chr', ('2ch', '2chr', '2chronicles')),
    (15, 'Ezra', 'Ezra', ('ezr', 'ezra')),
    (16, 'Nehemiah', 'Neh', ('neh', 'nehemiah')),
    (17, 'Esther', 'Esth', ('est', 'esth', 'esther')),
    (18, 'Job', 'Job', ('job',)),
    (19, 'Psalm', 'Ps', ('ps', 'psa', 'psalm', 'psalms')),
    (20, 'Proverbs', 'Prov', ('pr', 'pro', 'prov', 'proverbs')),
    (21, 'Ecclesiastes', 'Eccl', ('ec', 'ecc', 'eccl', 'ecclesiastes')),
    (22, 'Song of Solomon', 'Song', ('so', 'sos', 'song', 'canticles', 'songofsolomon')),
    (23, 'Isaiah', 'Isa', ('is', 'isa', 'isaiah')),
    (24, 'Jeremiah', 'Jer', ('jr', 'jer', 'jeremiah')),
    (25, 'Lamentations', 'Lam', ('la', 'lam', 'lamentations')),
    (26, 'Ezekiel', 'Ezek', ('eze', 'ezk', 'ezek', 'ezekiel')),
    (27, 'Daniel', 'Dan', ('da', 'dn', 'dan', 'daniel')),
    (28, 'Hosea', 'Hos', ('hos', 'hosea')),
    (29, 'Joel', 'Joel', ('jl', 'joe', 'joel')),
    (30, 'Amos', 'Amos', ('am', 'amos')),
    (31, 'Obadiah', 'Obad', ('ob', 'obad', 'obadiah')),
    (32, 'Jonah', 'Jonah', ('jon', 'jonah')),
    (33, 'Micah', 'Mic', ('mi', 'mic', 'micah')),
    (34, 'Nahum', 'Nah', ('na', 'nah', 'nahum')),
    (35, 'Habakkuk', 'Hab', ('hab', 'habakkuk')),
    (36, 'Zephaniah', 'Zeph', ('zep', 'zeph', 'zephaniah')),
    (37, 'Haggai', 'Hag', ('hag', 'haggai')),
    (38, 'Zechariah', 'Zech', ('zec', 'zech', 'zechariah')),
    (39, 'Malachi', 'Mal', ('mal', 'malachi')),
    (40, 'Matthew', 'Matt', ('mt', 'mat', 'matt', 'matthew')),
    (41, 'Mark', 'Mark', ('mk', 'mrk', 'mark')),
    (42, 'Luke', 'Luke', ('lk', 'lu', 'luke')),
    (43, 'John', 'John', ('jn', 'jhn', 'joh', 'john')),
    (44, 'Acts', 'Acts', ('ac', 'acts')),
    (45, 'Romans', 'Rom', ('ro', 'rom', 'romans')),
    (46, '1 Corinthians', '1Cor', ('1co', '1cor', '1corinthians')),
    (47, '2 Corinthians', '2Cor', ('2co', '2cor', '2corinthians')),
    (48, 'Galatians', 'Gal', ('ga', 'gal', 'galatians')),
    (49, 'Ephesians', 'Eph', ('eph', 'ephesians')),
    (50, 'Philippians', 'Phil', ('php', 'phil', 'philippians')),
    (51, 'Colossians', 'Col', ('col', 'colossians')),
    (52, '1 Thessalonians', '1Thess', ('1th', '1thess', '1thessalonians')),
    (53, '2 Thessalonians', '2Thess', ('2th', '2thess', '2thessalonians')),
    (54, '1 Timothy', '1Tim', ('1ti', '1tim', '1timothy')),
    (55, '2 Timothy', '2Tim', ('2ti', '2tim', '2timothy')),
    (56, 'Titus', 'Titus', ('tit', 'titus')),
    (57, 'Philemon', 'Phlm', ('phm', 'phlm', 'philemon')),
    (58, 'Hebrews', 'Heb', ('heb', 'hebrews')),
    (59, 'James', 'Jas', ('jam', 'jas', 'james')),
    (60, '1 Peter', '1Pet', ('1pe', '1pet', '1peter')),
    (61, '2 Peter', '2Pet', ('2pe', '2pet', '2peter')),
    (62, '1 John', '1John', ('1jn', '1jhn', '1john')),
    (63, '2 John', '2John', ('2jn', '2jhn', '2john')),
    (64, '3 John', '3John', ('3jn', '3jhn', '3john')),
    (65, 'Jude', 'Jude', ('jude',)),
    (66, 'Revelation', 'Rev', ('re', 'rv', 'rev', 'revelation', 'revelations')),
]

NAME_BY_ABBR = {b[2]: b[1] for b in BOOKS}
NAMES = {b[1] for b in BOOKS}

RULES = [
    ("N1", re.compile(r"&#(\d+);"), lambda m: chr(int(m.group(1)))),
    ("N1", re.compile(r"&thorn;"), "þ"),
    ("N2", re.compile(r"\{\\cf\d+\s*\(\d+:\d+\)\s*\}"), ""),
    ("N3", re.compile(r"\s*(\\par\s*)?\{\\cf\d+\s[^{}]*\}"), ""),
    ("N3a", re.compile(r"\\par\b"), ""),
    ("N3b", re.compile(r"\s*\{\([^{}()]*:[^{}()]*\)\}"), ""),
    ("N3c", re.compile(r"\{\(([^{}()]*)\)\}"), r"\1"),
    ("N4", re.compile(r"\s*\{\{.*$", re.S), ""),
    ("N5", re.compile(r"[«»]"), ""),
    ("N6", re.compile(r"[\[\]]"), ""),
    ("N7", re.compile(r"¶\s*"), ""),
    ("N8", re.compile(r"`"), "\u2019"),
]
WS = re.compile(r"\s+")
BAD_CHARS = re.compile(r"[\[\]{}<>\*#¶«»_`\\]")
BAD_ENTITY = re.compile(r"&#\d+;|&[a-z]+;")
HAS_WORD = re.compile(r"\w")


class DataError(Exception):
    pass


def normalize(text):
    t = text or ""
    for _name, pat, rep in RULES:
        t = pat.sub(rep, t)
    return WS.sub(" ", t).strip()


def text_ok(t):
    return not (BAD_CHARS.search(t) or BAD_ENTITY.search(t) or "  " in t
                or t != t.strip() or not HAS_WORD.search(t))


def map_book(edition, db_book):
    if edition == "gen":
        return NAME_BY_ABBR.get(db_book)
    name = "Psalm" if db_book == "Psalms" else db_book
    return name if name in NAMES else None


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def gz(data):
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", compresslevel=9, fileobj=buf, mtime=0) as f:
        f.write(data)
    return buf.getvalue()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_edition(db_dir, edition):
    """Return ({(name, ch): {v: text}}, edition_name, db_sha256)."""
    if edition not in ALLOWED_EDITIONS:
        raise SystemExit(2)
    path = os.path.join(db_dir, f"{edition}.db")
    if not os.path.isfile(path):
        raise DataError(f"missing {path}")
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        meta = dict(conn.execute("SELECT key, value FROM metadata").fetchall())
        rows = conn.execute("SELECT reference, text FROM bible ORDER BY id").fetchall()
    finally:
        conn.close()
    chapters = {}
    for reference, text in rows:
        parts = reference.split(":")
        if len(parts) != 4:
            raise DataError(f"{edition} {reference} bad reference")
        _prefix, db_book, ch, v = parts
        name = map_book(edition, db_book)
        if name is None:
            continue  # Apocrypha / non-canonical
        ch, v = int(ch), int(v)
        if v == 0:
            continue
        t = normalize(text)
        if not text_ok(t):  # every verse must be non-empty and clean (no exceptions since Geneva 1599)
            raise DataError(f"{edition} {name} {ch}:{v}")
        chapters.setdefault((name, ch), {})[v] = t
    return chapters, meta.get("edition_name"), sha256_file(path)


def build(db_dir, out, editions=ALLOWED_EDITIONS, verse_commit=DEFAULT_VERSE_COMMIT,
          use_brotli=True, log=print):
    editions = tuple(editions)
    if any(e not in ALLOWED_EDITIONS for e in editions) or not editions:
        raise SystemExit(2)
    use_brotli = use_brotli and brotli is not None
    out = os.path.abspath(out)
    if out in ("/", os.path.expanduser("~")) or len(out) < 5:
        raise SystemExit(2)

    data, names, shas, verse_counts = {}, {}, {}, {}
    for ed in editions:
        chapters, ed_name, sha = read_edition(db_dir, ed)
        if ed_name != EDITION_META[ed][0]:
            raise DataError(f"{ed} edition_name {ed_name!r}")
        counts = []
        for n, name, abbr, _al in BOOKS:
            per = []
            ch = 1
            while (name, ch) in chapters:
                verses = chapters[(name, ch)]
                if sorted(verses) != list(range(1, len(verses) + 1)):
                    raise DataError(f"{ed} {name} {ch} verse gap")
                per.append(len(verses))
                ch += 1
            if not per:
                raise DataError(f"{ed} {name} missing")
            counts.append(per)
        extra = [k for k in chapters if k[1] > len(counts[[b[1] for b in BOOKS].index(k[0])])]
        if extra:
            raise DataError(f"{ed} {extra[0][0]} {extra[0][1]} chapter gap")
        data[ed], names[ed], shas[ed], verse_counts[ed] = chapters, ed_name, sha, counts
    first = verse_counts[editions[0]]
    for ed in editions:
        if verse_counts[ed] != first:
            raise DataError(f"{ed} versification differs")

    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)

    files = {}  # relpath -> bytes
    for ed in editions:
        words = 0
        nverses = 0
        for (n, name, abbr, _al), per in zip(BOOKS, first):
            for ch in range(1, len(per) + 1):
                verses = data[ed][(name, ch)]
                vs = [{"v": v, "text": verses[v]} for v in range(1, per[ch - 1] + 1)]
                nverses += len(vs)
                words += sum(len(x["text"].split()) for x in vs)
                files[f"{ed}/{abbr}/{ch}.json"] = dumps(
                    {"edition": ed, "book": name, "chapter": ch, "verses": vs})
        log(f"{ed} books={len(BOOKS)} chapters={sum(len(p) for p in first)} verses={nverses} words={words}")

    h = hashlib.sha256()
    for rel in sorted(files):
        h.update(rel.encode("utf-8") + b"\n" + files[rel])
    data_version = h.hexdigest()[:12]

    index = {
        "schema": 1,
        "dataVersion": data_version,
        "source": {"verseCommit": verse_commit, "dbSha256": {ed: shas[ed] for ed in editions}},
        "editions": [{"id": ed, "name": names[ed], "short": EDITION_META[ed][1], "attribution": ATTRIBUTION}
                     for ed in editions],
        "books": [{"n": n, "name": name, "abbr": abbr, "slug": name.replace(" ", "-"),
                   "testament": "OT" if n <= 39 else "NT", "aliases": list(al), "verses": per}
                  for (n, name, abbr, al), per in zip(BOOKS, first)],
    }
    files["index.json"] = dumps(index)

    nj = ng = nb = 0
    for rel, raw in files.items():
        path = os.path.join(out, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(raw)
        nj += 1
        with open(path + ".gz", "wb") as f:
            f.write(gz(raw))
        ng += 1
        if use_brotli:
            with open(path + ".br", "wb") as f:
                f.write(brotli.compress(raw, quality=11))
            nb += 1
    log(f"dataVersion={data_version} files_json={nj} files_gz={ng} files_br={nb}")
    return index


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db-dir", default=DEFAULT_DB_DIR)
    ap.add_argument("--out", default="public/data")
    ap.add_argument("--verse-commit", default=DEFAULT_VERSE_COMMIT)
    ap.add_argument("--no-brotli", action="store_true")
    args = ap.parse_args(argv)  # argparse exits 2 on bad arguments
    if not re.fullmatch(r"[0-9a-f]{7,40}", args.verse_commit):
        print("bad --verse-commit", file=sys.stderr)
        return 2
    try:
        build(args.db_dir, args.out, verse_commit=args.verse_commit, use_brotli=not args.no_brotli)
    except DataError as e:
        print(str(e), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
