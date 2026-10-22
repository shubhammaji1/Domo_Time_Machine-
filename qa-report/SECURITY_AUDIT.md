# Security controls, evidence and limits

Verified 2026-10-20T08:35:32.594Z; published domo-time-machine@0.1.1; Windows 10.0.26200, x64.

No reportable product security vulnerability was confirmed in this pass; no Critical/High security finding. This is a partial, sequential source review with dynamic synthetic checks, not a comprehensive security certification. Product source boundaries, SECURITY.md and packaging were traced; third-party implementations and every developer fixture were not exhaustively audited.

Full and production-only npm audits report zero known advisories at execution time: [audit-all](evidence/audit-all.json), [audit-production](evidence/audit-production.json). This does not prove the dependency graph is vulnerability-free. Runtime dependency tree and tarball entrypoints are recorded. No install/postinstall hooks, implicit telemetry, server, eval, SQL execution or production network/write path was found in core source. Source/config search found no supported credential exposure; opaque strings/checksums and synthetic data were not treated as credentials.

Traversal strings remain logical names; snapshot paths use validated UUIDs. Prototype keys, nested cells, unsafe integers, oversized sources/columns, invalid UTF-8 and symlink snapshot entries reject. Writes use exclusive creation, private permission hints, per-name locks and atomic commit. Metadata/original/normalized hashes detect changes. Terminal output escapes control/bidi characters; syntax diagnostics redact raw rows. Regression filenames are JSON-encoded, not shell-interpolated. Capsule export requires explicit review and contains all referenced values; there is no automatic anonymity.

Limits: trusted root ancestors and OS ACLs are required; Windows mode hints are not a full access policy. A writer with filesystem authority can recompute unauthenticated hashes. No encryption, authenticated provenance, power-loss guarantee or OS resource/network sandbox is claimed. Standard Node network entry points were blocked in installed dataset tests, not every possible native syscall. CLI metrics configuration-file memory bounds and long-duration stress were not exhaustively tested. No real Domo auth/security boundary exists yet.

Security report finalization: **COMPLETE — PARTIAL REVIEW COVERAGE** (checked 2026-10-22T05:54:18.212977Z). The saved scan was successfully finalized on continuation. No confirmed reportable vulnerabilities were recorded within partial review coverage. The earlier completion subprocess failure did not provide a diagnostic cause. The plugin retained original-snapshot results and warnings about temporary target unavailability and directory changes; this is not certification of every current file.

The security-scan plugin's source coverage remains partial. This QA document summarizes executed control tests and does not replace the canonical scan. Independent review and remote platform execution remain follow-up work.
