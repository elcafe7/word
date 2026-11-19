# Security report: offline-20261119

- Date and time: 2026-11-19 17:05:14 UTC
- Result: **pass**. Published: every release check passed.
- Release: https://github.com/elcafe7/word/releases/tag/offline-20261119
- Workflow run: https://github.com/elcafe7/word/actions/runs/44573076838

| Tool | Result | Report |
|---|---|---|
| OSV-Scanner | pass (0 advisories; 0 known vulnerabilities at or above the gate) | [osv-scan.json](osv-scan.json), [osv-scan.md](osv-scan.md) |
| SBOM (CycloneDX, syft) | written (2 components) | [sbom.cdx.json](sbom.cdx.json) |
| SHA256SUMS | verified (7 files) | [SHA256SUMS](SHA256SUMS) |
| Build provenance (Sigstore) | attested | [attestation.md](attestation.md) |
| VirusTotal | not enabled | - |
| OpenSSF Scorecard | 5.8/10 (published 2026-11-16T19:44:26Z) | [scorecard.json](scorecard.json) |
| Socket.dev | not configured | - |
| OpenSSF Best Practices | not configured | - |

All times are UTC. Files in this folder are copies of what the workflow
produced for this run; the OSV database keeps growing, so re-scan the SBOM
(`osv-scanner scan source -L sbom.cdx.json`) for today's view.
