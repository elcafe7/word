"""scripts/make_archives.py: all-editions archives are complete and deterministic."""

import hashlib
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "make_archives.py"
DATE = "20261119"
NAMES = ("word-geneva1599.html", "word-kjv.html", "word-kjv1611.html")
FIXED_MTIME = 1795046400  # 2026-11-19 00:00:00 UTC


def run(mode, html, out, *extra, date=DATE):
    return subprocess.run(
        [sys.executable, str(SCRIPT), mode, "--html-dir", str(html), "--out-dir", str(out),
         "--date", date, "--license", str(ROOT / "LICENSE"), *extra],
        capture_output=True, text=True, check=False,
    )


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.html = Path(self.tmp.name) / "html"
        self.html.mkdir()
        for i, n in enumerate(NAMES):
            (self.html / n).write_bytes(f"<html>{n} {i}</html>\n".encode() * 50)
        (self.html / "SHA256SUMS").write_text("ignored\n")  # non-edition file must not be packed
        self.out = Path(self.tmp.name) / "out"
        self.root = f"word-offline-{DATE}-all-editions"

    def build(self, out=None):
        proc = run("build", self.html, out or self.out)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return (out or self.out) / f"{self.root}.zip", (out or self.out) / f"{self.root}.tar.gz"

    def test_contents(self):
        z, t = self.build()
        want = sorted(f"{self.root}/{n}" for n in (*NAMES, "LICENSE", "README.txt"))
        with zipfile.ZipFile(z) as zf:
            self.assertEqual(sorted(zf.namelist()), want)
            self.assertEqual(zf.namelist(), want)  # stored sorted
            self.assertEqual(zf.read(f"{self.root}/LICENSE"), (ROOT / "LICENSE").read_bytes())
            readme = zf.read(f"{self.root}/README.txt").decode()
            for n in NAMES:
                self.assertIn(n, readme)
                self.assertEqual(zf.read(f"{self.root}/{n}"), (self.html / n).read_bytes())
            self.assertIn("double-click", readme)
        with tarfile.open(t, "r:gz") as tf:
            self.assertEqual(tf.getnames(), want)
            for m in tf.getmembers():
                self.assertEqual((m.mtime, m.uid, m.gid, m.mode), (FIXED_MTIME, 0, 0, 0o644))

    def test_deterministic_and_gzip_header(self):
        z1, t1 = self.build()
        z2, t2 = self.build(Path(self.tmp.name) / "out2")
        self.assertEqual(sha(z1), sha(z2))
        self.assertEqual(sha(t1), sha(t2))
        raw = t1.read_bytes()
        self.assertEqual(raw[:3], b"\x1f\x8b\x08")
        self.assertEqual(raw[3] & 0x08, 0, "gzip header must not carry a file name")
        self.assertEqual(raw[4:8], b"\0\0\0\0", "gzip header must not carry a timestamp")
        with zipfile.ZipFile(z1) as zf:
            for zi in zf.infolist():
                self.assertEqual(zi.date_time, (2026, 11, 19, 0, 0, 0))

    def test_verify_passes_and_detects_tampering(self):
        self.build()
        self.assertEqual(run("verify", self.html, self.out).returncode, 0)
        (self.html / "word-kjv.html").write_bytes(b"changed")
        proc = run("verify", self.html, self.out)
        self.assertNotEqual(proc.returncode, 0)
        proc = run("verify", self.html, self.out, "--contents-only")
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("differs from source", proc.stderr)

    def test_bad_inputs(self):
        self.assertNotEqual(run("build", self.html, self.out, date="2026-11-19").returncode, 0)
        empty = Path(self.tmp.name) / "empty"
        empty.mkdir()
        proc = run("build", empty, self.out)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("no word-*.html", proc.stderr)


if __name__ == "__main__":
    unittest.main()
