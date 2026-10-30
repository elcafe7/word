"""Tests for scripts/build_data.py (SPEC T2). Run: python3 -m unittest scripts/test_build_data.py -v"""
import gzip
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_data  # noqa: E402

DB_DIR = build_data.DEFAULT_DB_DIR
FIXTURES = [
    ("kjv", "John", 3, 16, "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."),
    ("kjv", "John", 3, 17, "For God sent not his Son into the world to condemn the world; but that the world through him might be saved."),
    ("kjv", "Gen", 1, 1, "In the beginning God created the heaven and the earth."),
    ("kjv", "Ps", 23, 1, "The LORD is my shepherd; I shall not want."),
    ("kjv", "Rev", 22, 21, "The grace of our Lord Jesus Christ be with you all. Amen."),
    ("kjv", "John", 4, 1, "When therefore the LORD knew how the Pharisees had heard that Jesus made and baptized more disciples than John,"),
    ("kj16", "John", 3, 16, "For God so loued þ world, that he gaue his only begotten Sonne: that whosoeuer beleeueth in him, should not perish, but haue euerlasting life."),
    ("kj16", "Ezek", 17, 3, "And say, Thus saith the Lord God, A great eagle with great wings, long wing’d, full of feathers, which had diuers colours, camevnto Lebanon, and tooke the highest branch of the Cedar."),
    ("gen", "Gen", 1, 2, "And the earth was without forme and void, and darkenesse was vpon the deepe, and the Spirit of God mooued vpon the waters."),
    ("gen", "Ps", 23, 1, "A Psalme of David. The Lord is my shepheard, I shall not want."),
    ("gen", "Num", 13, 1, "And the Lord spake vnto Moses, saying,"),
    ("gen", "Dan", 3, 23, "And these three men Shadrach, Meshach and Abednego fell downe bound into the middes of the hote fierie fornace."),
    ("gen", "Rev", 17, 11, "And the beast that was, and is not, is euen the eight, and is one of the seuen, and shall goe into destruction."),
    ("gen", "1John", 2, 23, "Whosoeuer denyeth the Sonne, the same hath not the Father."),
    ("gen", "Rev", 13, 12, "And he did all that the first beast could doe before him, and he caused the earth, and them which dwell therein, to worship the first beast, whose deadly wound was healed."),
    ("gen", "John", 3, 16, "For God so loued the worlde, that hee hath giuen his onely begotten Sonne, that whosoeuer beleeueth in him, should not perish, but haue euerlasting life."),
]


def walk(root, suffix):
    out = []
    for d, _dirs, files in os.walk(root):
        out += [os.path.join(d, f) for f in files if f.endswith(suffix)]
    return out


class BuildDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.out = os.path.join(cls.tmp, "data")
        cls.proc = subprocess.run(
            [sys.executable, os.path.join(HERE, "build_data.py"), "--db-dir", DB_DIR, "--out", cls.out],
            capture_output=True, text=True)
        with open(os.path.join(cls.out, "index.json"), encoding="utf-8") as f:
            cls.index = json.load(f)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def chapter(self, ed, abbr, ch, root=None):
        with open(os.path.join(root or self.out, ed, abbr, f"{ch}.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_a_exit_and_summary(self):
        self.assertEqual(self.proc.returncode, 0, self.proc.stderr)
        lines = self.proc.stdout.strip().splitlines()
        self.assertEqual(lines[0], "kjv books=66 chapters=1189 verses=31102 words=789634")
        self.assertEqual(lines[1], "kj16 books=66 chapters=1189 verses=31102 words=790349")
        self.assertEqual(lines[2], "gen books=66 chapters=1189 verses=31102 words=783938")
        br = 3568 if build_data.brotli else 0
        self.assertRegex(lines[3], rf"^dataVersion=[0-9a-f]{{12}} files_json=3568 files_gz=3568 files_br={br}$")

    def test_b_counts(self):
        self.assertEqual(len(walk(self.out, ".json")), 3568)
        self.assertEqual(len(walk(self.out, ".json.gz")), 3568)
        if build_data.brotli is None:
            self.skipTest("brotli module not importable")
        self.assertEqual(len(walk(self.out, ".json.br")), 3568)

    def test_c_fixtures(self):
        for ed, abbr, ch, v, text in FIXTURES:
            with self.subTest(ed=ed, ref=f"{abbr} {ch}:{v}"):
                verses = self.chapter(ed, abbr, ch)["verses"]
                self.assertEqual(verses[v - 1]["v"], v)
                self.assertEqual(verses[v - 1]["text"], text)

    def test_d_index(self):
        ix = self.index
        self.assertEqual(list(ix), ["schema", "dataVersion", "source", "editions", "books"])
        self.assertEqual([e["id"] for e in ix["editions"]], ["kjv", "kj16", "gen"])
        self.assertEqual([e["short"] for e in ix["editions"]], ["KJV", "KJV 1611", "Geneva"])
        self.assertEqual(len(ix["books"]), 66)
        self.assertEqual(sum(len(b["verses"]) for b in ix["books"]), 1189)
        self.assertEqual(sum(sum(b["verses"]) for b in ix["books"]), 31102)
        john = next(b for b in ix["books"] if b["name"] == "John")
        self.assertEqual(len(john["verses"]), 21)
        self.assertEqual(john["verses"][2], 36)
        psalm = next(b for b in ix["books"] if b["name"] == "Psalm")
        self.assertEqual(len(psalm["verses"]), 150)
        self.assertEqual(sum(len(b["aliases"]) for b in ix["books"]), 194)
        self.assertEqual(ix["source"]["verseCommit"], build_data.DEFAULT_VERSE_COMMIT)
        for ed in ("kjv", "kj16", "gen"):
            self.assertRegex(ix["source"]["dbSha256"][ed], r"^[0-9a-f]{64}$")

    def test_e_no_copyrighted_paths(self):
        dirs = sorted(d for d in os.listdir(self.out) if os.path.isdir(os.path.join(self.out, d)))
        self.assertEqual(dirs, ["gen", "kj16", "kjv"])
        for d, sub, files in os.walk(self.out):
            for name in sub + files:
                p = os.path.join(d, name).lower()
                self.assertNotIn("esv", p)
                self.assertNotIn("nasb", p)

    def test_f_refuses_other_editions(self):
        out = os.path.join(self.tmp, "refuse")
        with self.assertRaises(SystemExit) as cm:
            build_data.build(DB_DIR, out, editions=("esv",), log=lambda *_: None)
        self.assertEqual(cm.exception.code, 2)
        self.assertFalse(os.path.exists(out))

    def test_g_only_three_dbs_needed(self):
        only = os.path.join(self.tmp, "only3")
        os.makedirs(only)
        for ed in ("kjv", "kj16", "gen"):
            shutil.copy(os.path.join(DB_DIR, f"{ed}.db"), only)
        out = os.path.join(self.tmp, "only3-out")
        ix = build_data.build(only, out, use_brotli=False, log=lambda *_: None)
        self.assertEqual(ix["dataVersion"], self.index["dataVersion"])

    def test_h_idempotent(self):
        out2 = os.path.join(self.tmp, "second")
        ix2 = build_data.build(DB_DIR, out2, log=lambda *_: None)
        self.assertEqual(ix2["dataVersion"], self.index["dataVersion"])
        rel = os.path.join("kjv", "John", "3.json.gz")
        with open(os.path.join(self.out, rel), "rb") as a, open(os.path.join(out2, rel), "rb") as b:
            self.assertEqual(a.read(), b.read())

    def test_i_no_empty_verses(self):
        # Geneva 1599 (Verse 8ec8a9b) has text for every verse, including Revelation 13:12.
        self.assertTrue(self.chapter("gen", "Rev", 13)["verses"][11]["text"].startswith("And he did all that"))
        empties = []
        for path in walk(self.out, ".json"):
            if path.endswith("index.json"):
                continue
            with open(path, encoding="utf-8") as f:
                ch = json.load(f)
            empties += [(ch["edition"], ch["book"], ch["chapter"], v["v"]) for v in ch["verses"] if v["text"] == ""]
        self.assertEqual(empties, [])

    def test_k_edition_names_and_sources(self):
        self.assertEqual([e["name"] for e in self.index["editions"]],
                         ["King James Version (Oxford 1769)", "King James Version (1611 Original)", "Geneva Bible (1599)"])
        self.assertEqual(self.index["source"]["verseCommit"], "8ec8a9b146c42f01f3b5e81809046c13cf107c43")
        if os.path.realpath(DB_DIR) == os.path.realpath(build_data.DEFAULT_DB_DIR):
            self.assertEqual(self.index["source"]["dbSha256"], {
                "kjv": "b6c72f4e4a9d85e4b859bb91cbe237b626ff78560d3b7410b9fabb8a3d8a3e98",
                "kj16": "85fe83da383151ff2d68633554b5e6576f3a350ab7403ba82447a54751ee76fa",
                "gen": "690c4fd90eb9f3ab6260d3309556eea8716a8ff8a5e04003bc566ff7dafe25d9",
            })

    def test_j_gzip_roundtrip(self):
        for path in walk(self.out, ".json.gz"):
            with open(path, "rb") as g, open(path[:-3], "rb") as j:
                self.assertEqual(gzip.decompress(g.read()), j.read(), path)


if __name__ == "__main__":
    unittest.main()
