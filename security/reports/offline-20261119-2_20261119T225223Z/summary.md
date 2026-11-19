# Security report: offline-20261119-2

- Date and time: 2026-11-19 22:52:23 UTC
- Result: **pass**. Published: every release check passed.
- Release: https://github.com/elcafe7/word/releases/tag/offline-20261119-2
- Workflow run: https://github.com/elcafe7/word/actions/runs/44632440780

| Tool | Result | Report |
|---|---|---|
| OSV-Scanner | pass (0 advisories; 0 known vulnerabilities at or above the gate) | [osv-scan.json](osv-scan.json), [osv-scan.md](osv-scan.md) |
| SBOM (CycloneDX, syft) | written (2 components) | [sbom.cdx.json](sbom.cdx.json) |
| SHA256SUMS | verified (9 files) | [SHA256SUMS](SHA256SUMS) |
| Build provenance (Sigstore) | attested | [attestation.md](attestation.md) |
| VirusTotal | not enabled | - |
| OpenSSF Scorecard | 6.8/10 (published 2026-11-19T21:01:37Z) | [scorecard.json](scorecard.json) |
| Socket.dev | not configured | - |
| OpenSSF Best Practices | not configured | - |

All times are UTC. Files in this folder are copies of what the workflow
produced for this run; the OSV database keeps growing, so re-scan the SBOM
(`osv-scanner scan source -L sbom.cdx.json`) for today's view.
