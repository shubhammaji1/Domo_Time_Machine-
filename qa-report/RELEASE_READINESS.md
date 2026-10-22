# Readiness, scorecard and release gates

Verified 2026-10-20T08:35:32.594Z; published domo-time-machine@0.1.1; Windows 10.0.26200, x64.

**READY FOR CONTROLLED BETA** for bounded offline use, with moderate confidence. Linux/macOS, live Domo and comprehensive independent security certification remain unverified/blocked. A numerical score cannot override a confirmed Critical/High data-integrity or security blocker; none was established in this pass.

| Category             | Weight | Score / 10 | Evidence / limitation                                                                   |
| -------------------- | ------ | ---------- | --------------------------------------------------------------------------------------- |
| Core functionality   | 25     | 8          | Installed workflows, independent expected values, financial gates pass.                 |
| Historical integrity | 20     | 8          | Five versions, exact originals, crash and collision checks pass; power-loss unverified. |
| Security             | 15     | 7          | Input/control tests and advisory audits pass; partial single-reviewer source audit.     |
| CLI / SDK            | 10     | 8          | ESM, strict TS, CJS dynamic import and installed CLI pass.                              |
| Domo integration     | 10     | N/A        | Not implemented; excluded from offline-package score, live validation BLOCKED.          |
| Performance          | 10     | 7          | Three samples per supported size; no production SLA or soak evidence.                   |
| Documentation        | 5      | 5          | Two published README defects; local fixes verified separately.                          |
| Packaging / CI       | 5      | 7          | Real tarball consumers and hashes pass; remote matrix and provenance unverified.        |

Normalized score = sum(weight × score) / 90 = **7.5/10**. The 10-point Domo weight is excluded because this release advertises design/types, not an implemented connector. This is a qualitative assessment constrained by evidence, not a statistical reliability claim. Real Domo verification is explicitly false.

Passed gates: independent installation; tested historical oracle; financial failure detection; offline CLI/SDK; bounded crash/concurrency behavior; source/build/local/published runtime equality; advisory audits; generated declarations and clean installed consumers. Pending: published README corrections, executed remote matrix, fuller coverage and independent security review. Core 90% branch coverage is aspirational and currently unmet for several modules.

CI now defines Node 22/24 on Windows/Linux/macOS, source coverage and artifact retention; an optional workflow-dispatch job verifies the published release. These definitions were locally inspected, not remotely executed. No publish job, credentials or production Domo operation was added. Published-document probes intentionally keep that optional job red until a future authorized release corrects them.

Publication/version change is not authorized by this audit request and was not performed. The current local archive still uses 0.1.1 for comparison; it must not be published over the immutable existing release. Choose a future version only after explicit owner authorization and final validation.
