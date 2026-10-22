# SDK contracts and consumer isolation

Verified 2026-10-20T08:35:32.594Z; published domo-time-machine@0.1.1; Windows 10.0.26200, x64.

ESM import, ordinary JS, strict NodeNext TypeScript without ancestor ambient types or skipLibCheck, and CommonJS dynamic import pass against actual installed packages. Direct require and browser bundling are not advertised/tested. Installed package dependencies resolve without source-tree imports. The TypeScript compiler comes from the source tooling, while package resolution occurs in the independent consumer.

Documented Workspace, comparison/schema, metric/financial, replay/investigation and capsule APIs run on synthetic inputs with independent expected values. Supporting validation/schema/canonical/hash utilities are covered by source tests. Import reads installed package.json for VERSION; no datasets/workspace/network access occurs implicitly. Caller errors throw/reject rather than exiting the host process or logging raw rows.

Known bounds: date values remain strings; sourceUpdatedAt requires UTC Z; JSON callers must use strings for unsafe integers/precise decimals; cancellation is cooperative in a synchronous replay; duplicate keys can remain ambiguous. Exact and limits/schema utilities are publicly exported supporting objects; avoid changing global configuration in a shared process. Capsule input contents are intentionally returned in previews and require caller review.

See strict consumer checks in [published E2E](evidence/user-e2e-published-v22.22.0.json), [local E2E](evidence/user-e2e-local-v22.22.0.json), [source results](evidence/vitest.json) and [installed exports](evidence/audit-v22.22.0.json). No native Domo restoration or arbitrary DataFlow execution API exists.
