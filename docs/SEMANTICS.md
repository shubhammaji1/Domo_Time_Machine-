# Storage and computation semantics

## Immutable files

Each workspace has a versioned `workspace.json`, `snapshots/<UUID>/metadata.json`,
`rows.ndjson` and `original`, plus transient per-name locks. There is no catalog
database. Listing scans committed UUID directories. Metadata envelopes carry
canonical SHA-256 checksums. Reads verify metadata identity, source bytes,
normalized bytes, row count, column count and schema hash.

A capture acquires an exclusive name lock, stages and validates an original
copy, flushes normalized rows and metadata, then renames its directory on the
same filesystem. That rename commits the capture. Failed imports remove staging
and release the lock. Concurrent same-name captures cannot overwrite each other.
Crashes may leave temporary directories or locks; doctor reports them. It never
steals a lock or silently removes evidence. After confirming no writer is active,
an operator can remove only the reported stale lock/staging entry using OS tools.

The marker is published through a hard link to an already flushed temporary file.
Use a local filesystem supporting atomic rename and hard links (tested on Windows
NTFS); unsupported filesystems fail explicitly. Parent-directory fsync, power-loss
durability and hostile filesystem replacement are not guaranteed. POSIX permission
hints do not replace Windows ACLs. Storage roots/ancestors must be trusted.

Legacy SQLite workspaces are preserved and rejected with an explicit migration
message. Use a new workspace and import the original files from the old snapshot
directories. No automatic migration, deletion or in-place mutation occurs.

`dtm-v1` canonical JSON sorts object fields by JavaScript code-unit order,
preserves array order and exact Unicode codepoints, emits UTF-8 and ordinary JSON
primitive spellings, and omits undefined optional metadata fields. Dataset cells
cannot be undefined. Negative numeric zero normalizes to zero. Decimal spellings
and precision require strings. Missing, null, empty, zero and typed values differ.
Rows use canonical NDJSON with a trailing LF per row. Reordering affects content
hashes; multiset equality remains order-independent. Original input bytes are retained.

Hashes detect differences relative to recorded hashes; a writer able to replace
all evidence can recompute them. No authenticated or tamper-proof provenance is claimed.

## Matching and schema

Keys are case sensitive and typed, including explicit missing-field tags. Composite
keys map positionally. Exact rows cancel by multiplicity. Single records sharing
a key can be updates; unmatched rows within repeated-key groups remain ambiguous.
Duplicate-key groups count each affected side separately. Accounting:

```
beforeRows = removed + updated + unchanged + ambiguousBefore
afterRows  = added + updated + unchanged + ambiguousAfter
```

Diff without keys classifies multiset changes as additions/removals. Schema history
groups datasets independently, sorts by capture timestamp then ID for ties, and
reports observational changes. No rename, date parsing, business-grain validity,
key normalization, source change time or causal claim is inferred automatically.

## Financial and replay semantics

Decimal inputs accept plain finite decimal strings of at most 38 digits (no
exponents). JavaScript numbers already carry caller-side binary precision limits.
Decimal.js uses 120 significant digits and half-even rounding; division, average
and percentages round to 40 significant digits. Supported bounded sums are exact.
Null/missing/invalid cells are excluded from raw metrics with separate counters;
empty totals are null. Financial validation fails on any excluded cells, invalid
currency, empty total or unexpected amount beyond the declared absolute tolerance.
Currency columns are checked; there is no implicit FX conversion.

Replay is the TypeScript/Decimal.js reference engine only. Operations are allowlisted:
select, rename, filter, inner/left join, aggregate/group, deduplicate, sort, derive.
Joins match typed keys, never null/missing join keys, and emit every matching pair.
Right-side colliding fields receive `_right`; unresolved collisions fail.
Deduplicate keeps the first input row at explicit keys. Sort is stable canonical
lexical order, not numeric or locale/date sorting. Derive accepts arithmetic
operands only; invalid values/division by zero fail. Filters use typed exact
equality or decimal inequalities, with explicit null/missing operators.

Replay order, input hashes, engine version, numerical settings and output order
affect reproducibility. Assertions compare exact decimal values, so `8000` and
`8000.00` agree. Invalid numeric cells fail replay aggregation and cannot pass
numeric assertions. Null/missing aggregation exclusions remain explicit warnings.
Capsule input aliases and column manifests must match their declared inputs.
Schema-v1 capsules from earlier patch versions are accepted only when their
recorded output checksum reproduces; the result retains the producer version.
Inputs
are cloned; candidate outputs never overwrite captures. Supported input/step/row
limits and cooperative deadlines are guardrails, not an OS resource sandbox.
This is not a general SQL engine or a Magic ETL emulator.
