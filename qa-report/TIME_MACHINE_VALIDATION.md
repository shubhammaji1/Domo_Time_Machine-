# Historical state, failures and recovery

Verified 2026-10-20T08:35:32.594Z; published domo-time-machine@0.1.1; Windows 10.0.26200, x64.

The independent oracle begins Alice=100, Bob=200, Charlie=300 and captures Alice=150, Charlie=300, Diana=400. Expected and actual: one added, one removed, one updated, one unchanged. Later versions add/remove schema fields, change amount string→number, preserve null/absent/false, Unicode and a large integer encoded as a string. Reversed row order compares unchanged by key while producing a different ordered content hash. All five prior states and original bytes remain retrievable from new Workspace instances.

The source history test fixes only Date to create identical capturedAt timestamps and verifies UUID tie ordering. SourceUpdatedAt alternates older/newer UTC timestamps; it is retained as metadata, not treated as capture ordering or evidence of when rows changed. Capture time and source change time are distinct. There is no point-in-time server restore; selecting an immutable snapshot is the supported historical access operation.

Four writer processes (same, same, a, b) commit exactly three snapshots. One name collision fails. A writer paused immediately before commit is killed while repeated readers still see only the baseline. Doctor exposes one temporary directory and one lock, no corrupted committed snapshot. The stale name stays locked until deliberate recovery; an unrelated name still captures. Only after stopping the writer and removing its verified synthetic staging/lock did retry succeed.

Injected ENOSPC at rename and forced UUID collision leave prior data intact and clean staged state on handled failure. Corrupt committed metadata is diagnosed: valid UUID reads continue, but list/name lookups/new capture fail closed because they validate all metadata. This is a documented availability limitation, not silent historical corruption. Automatic stale-lock deletion, retention, rollback writes, filesystem power-loss durability and hostile local races are not claimed.

Evidence: audit observations.history/concurrency/crash/injectedFailures/corruption in [audit JSON](evidence/audit-v22.22.0.json); Date-tie test in tests/integration/history.test.ts. Do not blindly remove locks in an active workspace.
