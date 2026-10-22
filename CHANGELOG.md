# Changelog

## Unreleased

- Add independent published-package audit, repeated benchmarks, coverage reporting,
  five-version history tests and cross-process interruption/fault checks.
- Expand CI definitions to Windows/Linux/macOS and retain verification artifacts.
- Correct installed-user example paths and distinguish source-only development scripts.

## 0.1.1 — Published 2026-10-20

- Accept UTF-8 BOM prefixes in NDJSON imports, including Windows-produced files.
- Resolve exported regression harnesses against their actual capsule paths;
  support separate directories, Unicode, spaces, percent signs and hash characters.
- Reject duplicate destination keys in explicit comparison mappings.
- Compare replay assertions as decimal values rather than string spellings.
- Reject invalid numeric cells in replay aggregation; expose excluded-cell
  diagnostics and prevent invalid values from passing assertions.
- Validate replay limit options explicitly.
- Require exact capsule input aliases and accurate column manifests; reject
  unrelated inputs before export. Replay valid schema-v1 capsules from 0.1.0 and
  preserve their producer version in the result.
- Derive CLI/SDK versions from installed package metadata.
- Return actionable CLI diagnostics without printing malformed data contents.
- Add installed-consumer end-to-end tests for local and published packages, plus
  regression coverage and CI/pre-publication gates.

Publication was verified from npm registry metadata on 2026-10-20. The earlier
candidate report in docs/END_TO_END_REPORT.md is historical; see the source
checkout's qa-report/EXECUTIVE_SUMMARY.md for the current independent audit.

## 0.1.0

Initial public CLI/SDK release: local immutable captures, comparisons, schema
history, financial validation, reference replay, investigations and incident capsules.
