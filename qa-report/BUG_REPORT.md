# Reproducible issues and dispositions

Verified 2026-10-20T08:35:32.594Z; published domo-time-machine@0.1.1; Windows 10.0.26200, x64.

## QA-DOC-001 — Published README misidentifies the installed release

Severity Low; affected published 0.1.1 on all platforms (reproduced Windows Node 22.22.0). Feature: onboarding/release identity. Steps: npm install domo-time-machine@0.1.1; read node_modules/domo-time-machine/README.md. Expected: the release is identified as published. Actual: text calls 0.1.0 published and 0.1.1 a patch candidate. Verified root cause: stale release prose included in immutable npm tarball. Evidence: failed “published README release status” check and embedded publishedReadme in audit JSON. Local fix: update release status with verification date and distinguish future local changes. Runtime release blocker: No. Documentation gate for next release: Yes. Regression: retain the registry README probe; local tarball inspection confirms corrected text. Already-published bytes remain unchanged.

## QA-DOC-002 — Installed booking example references absent consumer-relative fixtures

Severity Medium; affected published 0.1.1, reproduced Windows Node 22.22.0. Feature: first booking workflow. Steps: create an empty consumer; npm install domo-time-machine; run the README booking capture path examples/booking-reconciliation/bookings.csv. Expected: bundled fixture captures two rows. Actual: exit 2, File or snapshot not found. Verified root cause: source-checkout paths and npm run demo were presented without sufficiently explicit source-context labeling. Bare local binary usage also assumes PATH setup. Evidence: failed “published README booking fixture command” and exact stderr/arguments in commands JSON. Local fix: use npx plus node_modules/domo-time-machine/examples/... and label npm run demo/development commands as source-checkout-only. Runtime release blocker: No; onboarding blocker for that copied example: Yes. Regression: retain verbatim published-doc probe; installed-candidate workflow validates corrected bundled-fixture paths. No runtime code was changed.

## Harness defects resolved during this audit

Unused helper bindings initially failed lint; removed before final lint. Cross-drive independent-path assertion initially assumed relative paths start with ..; Windows different drives return absolute paths, now accepted as outside source. Node-version launcher selectors leaked into nested npm exec; isolated consumer environments now remove package/call selectors and Node 24/minimum-22 reruns pass. Archive executable-bit assertion initially assumed POSIX mode was preserved on Windows; inspection of npm bin-links established chmod during installation, so archive mode is recorded rather than misreported as a package vulnerability.

These are audit-harness defects, not additional open package bugs. Handled invalid inputs, duplicate-key ambiguity, manual stale-lock recovery, header-only CSV rejection and corrupt-metadata fail-closed lookup are documented constraints rather than silently “fixed” semantics. The earlier 0.1.0 defects are historical evidence in docs/END_TO_END_REPORT.md; current 0.1.1 runtime checks pass and those failures are not carried forward.

Confirmed open published product/documentation bugs: 2 (Critical 0, High 0, Medium 1, Low 1). See [raw audit](evidence/audit-v22.22.0.json). Broader coverage gaps are tracked separately, not disguised as confirmed vulnerabilities.
