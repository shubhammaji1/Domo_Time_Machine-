# Package-only refactor and verification

Date: 2026-10-19, Asia/Calcutta. Version: 0.1.0, local evaluation artifact.
No npm publication or production mutation occurred.

## Architecture delivered

One root npm package exposes `dist/index.js` with TypeScript declarations and
the `dist/cli/index.js` executable. Source is organized under src/cli, core,
snapshots, diff, schema, metrics, replay, investigation, capsules, adapters and
storage. No workspace manifest or nested package manifests remain.

React, Studio, Fastify, browser tests, frontend assets, server routes and native
DuckDB dependencies were removed. The package neither requires nor starts a web
server. SQLite was replaced with versioned JSON metadata and immutable snapshot
directories. Five runtime dependencies remain: commander, csv-parse, decimal.js,
yaml and zod. Vite may appear transitively under the development-only Vitest runner;
there is no Vite application or frontend build.

Capture commits by flushed staging files and a same-filesystem directory rename.
Per-name exclusive locks prevent concurrent overwrite; doctor reports incomplete
staging and pending locks. Metadata, original bytes, normalized rows and schemas
are integrity checked. Legacy SQLite workspaces are left intact and rejected with
a migration message; use a fresh workspace and import their original artifacts.

New first-class APIs/commands provide schema comparison/history and strict financial
validation. Financial gates reject partial totals, missing/invalid currency, excluded
amounts, unavailable totals and differences beyond a declared absolute tolerance.
Every reporting command supports JSON/text. Text output escapes terminal controls.
CLI exit codes support CI gates. Public SDK capture options and financial rules
have generated TypeScript declarations.

Existing deterministic replay, what-if scenarios, evidence-backed investigations
and reviewed capsules were retained. These are experimental APIs intended for
v0.2/v0.3 stabilization. Optional live Domo integration is a documented read-only
design and exported types, not a working network connector. AI is future scope.

## Checks executed

Local runtime: Windows x64, Node 22.22.0. npm cache and temporary files were placed
on D:. Windows sandbox realpath restrictions required approved direct execution
for the test runner. PowerShell's npm script shim could not execute in this session;
the native npm.cmd/Node npm CLI entry points were used successfully.

| Check                              | Actual result                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Strict SDK/CLI TypeScript checking | Passed                                                                                             |
| Automated Vitest suite             | 42 tests passed across 6 files                                                                     |
| Property invariants                | 100 generated cases within the property test                                                       |
| Source formatting and ESLint       | Passed after correcting the CommonJS test-fixture lint configuration                               |
| File-store booking demonstration   | 8000 expected, 13000 faulty, 8000 candidate, all 3 tickets counted                                 |
| Capsule replay in fresh directory  | Expected output hash and assertions matched                                                        |
| npm tarball contents               | SDK JS/declarations and executable present; no evidence files, frontend/server assets or databases |
| Clean installation                 | Passed from the local tarball using npm offline cache                                              |
| npx-style command discovery        | npm exec --offline -- domo-time-machine --help passed in the clean install                         |
| External TypeScript consumer       | Compiled against installed declarations and executed real SDK workflows                            |
| Network-disabled installed SDK/CLI | Passed with fetch, HTTP(S) and net connection entry points blocked                                 |
| CommonJS compatibility             | Dynamic import from a CommonJS process passed                                                      |

The clean consumer performs capture, integrity read, comparison, schema history,
financial validation, investigation, replay and capsule replay using public root
imports. The executable check exercises capture, validation, replay, history and
doctor. No global installation or repository source imports are needed by consumers.
Since publication is forbidden without authorization, public registry invocation
has not been represented as an already-published service. The verified executable
is discoverable by the same npm-exec mechanism used by npx after local installation.

Fixtures include booking/ticket CSV and NDJSON plus before/after reconciliation
captures. The latter identify missing BK103, added BK104, removed Status/added
Channel columns, changed fare for BK101 and an exact total difference of 0.25.
Tests also cover mixed currencies, decimal precision, ambiguous repeated keys,
composite/mapped keys, null/missing/empty values, invalid encodings, corrupted
evidence, unsafe JSON integers, concurrent capture, stale locks, traversal-shaped
references, replaced directory junctions, legacy preservation, malicious DSL/capsule
metadata, replay cancellation/limits, terminal escaping and CLI failure exit codes.

Initial sandbox test attempts failed at Windows realpath before tests could run;
the approved execution path passed. The initial lint run flagged require() in the
deliberate CommonJS network-denial fixture; its file-specific configuration was
corrected. These failures are not counted as passing runs. No tests in the final
suite are skipped.

## Limits and remaining release work

- Local filesystems must support hard links and atomic directory rename. Local
  NTFS was exercised. Linux and Node 24 are configured in GitHub Actions but have
  not been executed remotely here; no remote/maintainer configuration was supplied.
- No live Domo tenant, OAuth/PDP validation or production integration was run.
  Official API references and a read-only connector design are recorded in
  DOMO_INTEGRATION.md. No undocumented endpoint implementation exists.
- No encryption, signed provenance, automatic anonymization, retention command,
  hostile local-user protection or comprehensive OS crash/power-loss guarantee.
- Imports are bounded to 64 MiB source / 128 MiB normalized data, 100,000 rows and
  256 columns. Normalized records remain in memory. No million-row/out-of-core or
  Parquet support is claimed. Dates are strings; automatic schema renames and key
  normalization are not implemented.
- Replay uses the reference TypeScript/Decimal.js engine with cooperative checks.
  No arbitrary SQL, Magic ETL emulator, server jobs or worker sandbox exists.
- The package is prepared for local installation and integration into ProofOS via
  public APIs. Publication still needs explicit authorization, name/ownership
  recheck, maintainer metadata and execution of the configured platform matrix.

The final local tarball is an evaluation build, not a blanket production-readiness
claim. No release workflow publishes automatically.

## Advisory and performance checks

The full npm dependency audit returned zero known vulnerabilities on 2026-10-19. Manual file-store benchmarks measured 10,000 rows: import 188.64 ms, verified load 77.82 ms, diff 195.12 ms, end RSS 123,662,336 bytes. For 100,000 rows: import 857.23 ms, verified load 553.13 ms, diff 1,580.11 ms, end RSS 235,802,624 bytes. Source sizes were 298,889 and 3,088,889 bytes. These are single local identity-comparison measurements, not peak memory or performance targets. Replay latency, worst-case duplicate-heavy workloads and one-million-row processing were not benchmarked.

## Folder hygiene follow-up

Generated outputs now live under one ignored .artifacts directory. Thirteen earlier workspaces were preserved under legacy-workspaces, the npm cache was moved under npm-cache, and obsolete browser cache/test-results directories were removed. Package archives go to packages through the local npm configuration, demonstrations to demos, and test/benchmark work to tmp. Tests and benchmarks clean their own temporary directories. The clean command removes only dist, tmp and generated package archives; saved demos, archived workspaces, dependencies and cache are retained. Direct publishing now runs type checking, lint, formatting checks and the 42-test suite before rebuilding. Fresh package installation, SDK/CLI checks and the booking demo passed after reorganization. Windows transient file-lock retries were added after a cleanup attempt encountered EBUSY. No publication was performed.
