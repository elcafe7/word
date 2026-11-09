# Release verification: maintainer notes

How releases of Word (offline HTML files) are verified, and the repository settings the
release workflow assumes. Workflows: [`release.yml`](../.github/workflows/release.yml),
[`scorecard.yml`](../.github/workflows/scorecard.yml); Dependabot:
[`dependabot.yml`](../.github/dependabot.yml).

Release files keep their existing names: `word-geneva1599.html`,
`word-kjv.html`, `word-kjv1611.html` and `SHA256SUMS`, built by
`scripts/build-offline.sh` as before (a local build of 0c5d44e with the
same tag and date reproduces the offline-20261029 files byte for byte).
`SHA256SUMS` now also lists the SBOM, scan report and `verification.json`;
`sha256sum -c --ignore-missing SHA256SUMS` still works for a single file.
Tags are `offline-YYYYMMDD` (or `offline-YYYYMMDD-N`). The files carry the
build date (America/New_York), as before.

**Heads-up:** a scan of the current `package-lock.json` (Nov 9, 2026) finds
advisories in the build tooling (vite 7.3.1, vitest 4.0.17,
@vitest/mocker 4.0.17, esbuild 0.27.7; 4 rated High/Critical). The next
tagged release will be blocked, with a fix issue, until those are upgraded.
Dependabot (npm, weekly) will propose the bumps.

## What runs

- **Tag push (`offline-*`)**, in this order:
  1. **build-scan**: build, SBOM (syft, CycloneDX JSON), OSV-Scanner (pinned
     version, binary checked against a pinned SHA-256) and the severity gate
     (`scripts/osv_gate.py`), then `SHA256SUMS` written and verified.
  2. **virustotal** (optional, see below).
  3. **release**: re-checks `SHA256SUMS`, checks `verification.json` says
     pass / 0 known vulnerabilities, attests (actions/attest-build-provenance,
     plus an SBOM attestation) and publishes the release.
- **workflow_dispatch**: dry run of step 1. Files are kept as a 14-day
  workflow artifact. It never attests, publishes or opens issues.
- **Gate**: any advisory with CVSS 7.0 or higher fails the release. Scored
  advisories below 7.0 also hold it, so a published report and badge always
  say 0 known vulnerabilities. Advisories with no CVSS score don't block;
  each one is a `::warning::` annotation and is listed as "Unscored" in the
  report, the job summary and any blocked-release issue.
- **Permissions**: top-level `contents: read`. Only the release job gets
  `contents: write` (plus `id-token: write` and `attestations: write` for
  attestations, and `issues: write` to close a blocked-release issue). The
  blocked job gets `issues: write` only. Checkouts use
  `persist-credentials: false`. `github.ref_name` reaches shell steps only
  through `env`, never inline in `run:`.
- **Actions** are pinned to full commit SHAs with a `# vX.Y.Z` comment;
  Dependabot (`github-actions`, weekly) bumps both together.

## When a check fails: nothing is published

If the OSV gate, a checksum check or VirusTotal (when on) fails, the run
publishes **nothing**: no release, no release assets, no scan report on a
release and no `verification.json`. Instead:

- The findings stay in the run as workflow artifacts (`scan-report`,
  `virustotal-report`). Release files are not even uploaded as an artifact
  when the OSV scan fails.
- The job summary shows the findings, a **Suggested fix** (fixed versions
  from OSV where known) and a **Fix prompt** to paste into a PR or a coding
  agent. Unscored advisories are listed there too.
- The `blocked` job opens an issue titled
  **"Release blocked: &lt;tag&gt; security check failed"**, assigned to
  `elcafe7`, with the same findings and fix prompt. A later failed run on
  the same tag comments on that issue instead of opening a new one.
- Fix the findings, then release again: a new tag from the fixed commit,
  or a re-run when nothing in the repo has to change (for example a
  VirusTotal analysis that timed out). Only a fully clean run publishes, and
  that run closes the issue.

## VirusTotal (off by default)

The VirusTotal check runs before anything is published, only when **both**
are set, and only on a public repo, on the files the release would publish
(VirusTotal shares uploads with its partners, so it never sees anything that
isn't about to be public anyway). Any engine rating a file malicious, or an
analysis that doesn't finish in 15 minutes, blocks the release; "suspicious"
ratings are warnings:

- repository variable `ENABLE_VIRUSTOTAL` = `true`
- repository secret `VT_API_KEY` (Nate adds this himself)

Free public API limits: 4 requests/minute, 500/day.

## Badge data (`verification.json`)

Each published release attaches `verification.json`, also covered by
`SHA256SUMS` and the provenance attestation. It is only written when the
scan is clean, so a published copy always says `"result": "pass"` and
`"known_vulnerabilities": 0` (`unscored` counts advisories with no CVSS
score, which are listed in the report):

```json
{
  "schema": 1,
  "tool": "OSV-Scanner",
  "tool_version": "2.7.0",
  "date": "2026-11-09",
  "scanned_at": "2026-11-09T17:00:00Z",
  "result": "pass",
  "known_vulnerabilities": 0,
  "unscored": 0,
  "threshold_cvss": 7.0,
  "report_url": "https://github.com/elcafe7/word/releases/download/<tag>/<report>.md",
  "release": "<tag>",
  "repository": "elcafe7/word",
  "stale_after_days": 30
}
```

A release's copy: `https://github.com/elcafe7/word/releases/download/<tag>/verification.json`
(prefer the tag URL over `/releases/latest/`, which can point at a different
kind of release).
GitHub release downloads don't send CORS headers, so a download page should
copy this file at deploy time (or fetch it server-side). Browser-side
`fetch()` won't work.

Download-page copy:

- Within 30 days of `date`:
  **Verified by OSV-Scanner on &lt;date&gt; · 0 known vulnerabilities · [view report](report_url)**
  (for example "Verified by OSV-Scanner on Nov 9, 2026 · 0 known vulnerabilities · view report").
- After 30 days (`stale_after_days`): change "Verified by" to **"Last scanned by
  OSV-Scanner on &lt;date&gt;"**. The OSV database keeps growing, so an old
  scan is a dated record, not a current guarantee.
- Only show the badge when `result` is `pass` (always true for a published file).

Page wiring is deferred until the first verified release exists.

## Checking a release

```bash
sha256sum -c --ignore-missing SHA256SUMS          # Linux (macOS: shasum -a 256 -c --ignore-missing SHA256SUMS)
gh attestation verify <file> -R elcafe7/word
osv-scanner scan source -L <sbom>.cdx.json        # re-scan against today's OSV data
```

## Recommended repository settings (not applied; needs Nate's OK)

These are recommendations only. The PR that added this file changed no
settings.

1. **Tag ruleset for release tags.** Settings → Rules → Rulesets → New tag ruleset:
   - Name: `release tags`; Enforcement: Active
   - Target tags: include pattern `offline-*`
   - Rules: Restrict creations, Restrict updates, Restrict deletions, Block force pushes
   - Bypass list: only `elcafe7` (Nate), so only Nate can create or move
     release tags. This matters because the tag push alone triggers a signed,
     published release.
2. **Secret scanning**: Settings → Code security → Secret scanning: Enable.
3. **Push protection**: Settings → Code security → Secret scanning → Push protection: Enable.
4. **Actions secrets/variables**: add `VT_API_KEY` and `ENABLE_VIRUSTOTAL=true` only
   if VirusTotal is wanted (see above).

