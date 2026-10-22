# Real-user end-to-end verification — 2026-10-20

This is the historical pre-publication 0.1.0/0.1.1 comparison. npm 0.1.1 was later
published on 2026-10-20 and independently retested; current results are retained
in the source checkout's `qa-report/EXECUTIVE_SUMMARY.md`.

**At the time of this comparison, public 0.1.0 had reproducible edge-case defects
and local 0.1.1 was an unpublished candidate.** Tests reduce regression risk; they cannot establish
that every input, machine or future dependency version is issue-free.

## What was actually tested

The public release was installed from `https://registry.npmjs.org/` into a fresh
consumer project and a cold npm cache, using normal installation without
`--ignore-scripts`. Its recorded integrity was:

```
sha512-d5XCYvAlQnBM6ptORH9O8w4qVatjHTXEvqQT+Es1vGaHmNjMU67AdlU6wB9IVQRAA1B3v3Kxl4ytPkkDlyXlog==
```

The candidate was separately built, packed and installed in fresh consumer
projects. Tests invoke its installed CLI and import its installed SDK by package
name. They do not import repository TypeScript implementations. npm verifies the
installed dependency tree, and the TypeScript consumer disables inherited ambient
types with `types: []`. Dataset operations execute with common network entry points
blocked. Installation and registry metadata checks intentionally require network.

User paths include spaces and Unicode. Regression exports additionally use `#`
and `%` filenames. The consumer suite covers:

- Normal npm installation and npm-exec/npx command discovery.
- CSV/JSON/NDJSON capture, quoted CSV fields, CRLF, UTF-8 BOM and Unicode.
- Verified inspection, immutable names, report overwrite prevention and doctor.
- Added/missing/updated rows, ambiguous repeated keys, typed keys and row ordering.
- Schema comparison/history, exact currency validation and financial failure gates.
- Evidence-backed fare contributions and human-readable/JSON reports.
- Actual booking join multiplication and booking-grain candidate assertions.
- Capsule preview/review, manifest integrity, fresh-environment replay and regression scripts.
- Exact decimals, numeric assertion normalization, rejected invalid aggregation,
  immutable replay inputs, cancellation and invalid limits.
- Capsule alias validation and rejection of unrelated input data.
- External TypeScript declaration compilation and package/CLI version alignment.

## Measured results

| Target                | Host/runtime                                 | Consumer scenarios                          |
| --------------------- | -------------------------------------------- | ------------------------------------------- |
| Public 0.1.0          | Windows x64, Node 22.22.0                    | 12 passed, 8 failed in the initial baseline |
| Local 0.1.1 candidate | Windows x64, Node 22.22.0                    | 20 passed, 0 failed                         |
| Local 0.1.1 candidate | Windows x64, Node 24.22.0                    | 20 passed, 0 failed                         |
| Local 0.1.1 candidate | Windows x64, Node 22.13.0 (declared minimum) | 20 passed, 0 failed                         |

The core/unit/integration/security suite passed **48 tests across seven files**,
including 100 generated property cases. Type checking and ESLint passed. Additional
packaging verification checks the npm file list, clean installation, generated
declarations, offline SDK/CLI operation and CommonJS dynamic import. The full npm
advisory audit returned **zero known vulnerabilities** on 2026-10-20.

The published baseline is preserved as a failed result, not relabeled as passing
after local fixes. Some candidate tests were strengthened further after baseline
capture, notably fractional limits and special regression filenames. The source
and candidate have a new version; public 0.1.0 has not changed.

## Defects reproduced and corrected

| Published failure                                                              | Local correction                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| BOM-prefixed NDJSON rejected                                                   | Strip the initial BOM during parsing, retain exact original bytes       |
| Regression script could not find a capsule in another directory                | Compute the relative filesystem path from the exported script           |
| Repeated destination key mapping accepted                                      | Enforce uniqueness on both sides of explicit mappings                   |
| Equivalent assertion values such as 8000 and 8000.00 disagreed                 | Compare exact decimal values                                            |
| Invalid numeric cells silently omitted during replay totals                    | Reject invalid aggregates and fail assertions with invalid contributors |
| Capsule export accepted extra inputs but created a capsule it could not replay | Reject undeclared inputs at preview/export                              |
| Capsule inspection compared alias counts but not identity                      | Validate exact aliases and column manifests                             |
| CLI version remained hardcoded after a package patch bump                      | Read the installed package's version metadata                           |

Additional regression protections include explicit limits validation, safe CLI
diagnostics, file-URL typing, and successful replay of a real synthetic capsule
exported by public 0.1.0 under candidate 0.1.1.

## Repeat the checks

```sh
npm run prepublishOnly
npm run test:package
npm run test:e2e
npm run test:e2e:published
```

`prepublishOnly` includes unit checks and the local installed-package suite. The
published check is deliberately separate: until the patch is released, it should
continue to expose known public-release defects rather than blocking candidate CI
on an immutable old package. Neither command publishes anything.

Machine-readable results are retained locally under `.artifacts/reports/`:

- `user-e2e-published.json` — initial public baseline.
- `user-e2e-local-v22.22.0.json` — current LTS development runtime.
- `user-e2e-local-v24.22.0.json` — Node 24 LTS.
- `user-e2e-local-v22.13.0.json` — minimum supported runtime.

Failing consumer workspaces contain only synthetic fixtures and are retained for
reproduction. Successful temporary consumers are removed. Reports/caches/workspaces
are excluded from the published package.

## Practical limits

Linux/macOS were not executed locally; Windows/Linux Node 22/24 jobs are configured
in GitHub Actions but no remote CI run is claimed. No live Domo tenant or permissions
were tested; the read-only connector remains a design, not an advertised transport.
No production datasets, credentials or Domo writes were used.

Dataset/replay size limits, observational schema inference, explicit decimal-string
requirements, cooperative cancellation and trusted-local-filesystem assumptions
remain documented in SEMANTICS.md and SECURITY.md. No million-row, arbitrary Magic
ETL, encryption, authenticated-provenance or universal filesystem guarantee is made.

Release action remains with the owner: review the 0.1.1 candidate and completed
platform checks before explicitly authorizing publication. **No new npm release
was performed during these tests.**
