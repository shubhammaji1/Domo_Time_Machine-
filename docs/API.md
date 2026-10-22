# Public API

Import from `domo-time-machine`. The package is ESM with generated declarations.
`await import('domo-time-machine')` works from CommonJS. The smoke check compiles
an external TypeScript consumer against the packed declarations and executes it.

## Stable v0.1 evaluation surface

| API                                           | Contract                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `new Workspace(root?)`                        | Configure an explicit local file store; default `.domo-time-machine`                   |
| `store.init()`                                | Create versioned file-store marker, snapshots and lock directories                     |
| `store.capture(file, options)`                | Validate CSV/JSON/NDJSON, retain original, commit immutable snapshot; returns metadata |
| `store.list()`                                | Chronological metadata, validated envelopes; does not load every data file             |
| `store.get(idOrName)`                         | Verify original/content/schema/metadata integrity and return `{metadata, rows}`        |
| `store.doctor()`                              | Return checked count, failures, orphan entries and pending capture locks               |
| `compare(before, after, keys?, afterKeys?)`   | Typed-key or multiset diff, changed fields, ambiguity, duplicates and evidence         |
| `compareSchemas(beforeColumns, afterColumns)` | Added/removed/type/nullability/optionality changes; no inferred rename                 |
| `schemaHistory(metadata, datasetName?)`       | Chronological per-dataset transitions with prior snapshot references                   |
| `metric(rows, definition)`                    | Numeric/distinct/count aggregation, contributors and excluded-cell counts              |
| `validateFinancial(rows, rule)`               | Exact total/currency/excluded-cell/tolerance gate with explicit pass/fail              |
| `schemaOf(rows)`                              | Observational scalar types; date semantics are not inferred                            |

Capture options: required `name`; optional `datasetName`, `keyColumns`,
`dataCompleteness` (`complete|sample|filtered|unknown`), and UTC ISO `sourceUpdatedAt`
(a `Z` suffix is required; offset timestamps must be converted to UTC by the caller).
`capturedAt` is generated at capture time and does not establish source change time.
Names are unique and cannot use the reserved UUID identifier shape.

Metric aggregations: `count`, `count_distinct`, `sum`, `average`, `minimum`,
`maximum`, `null_count`, `duplicate_key_count`. Definition fields: `name`,
`aggregation`, `column` (except count), `keys` (optional duplicate key definition),
`currency`, `currencyColumn`, and `groupBy` for sum contribution analysis.

Financial rule: `column`, `currency`, `expected` (decimal string), optional
`currencyColumn` (default `Currency`) and `tolerance` (default `0`). Invalid rule
syntax throws; invalid financial data produces `passed: false`. `actual` is null
when unavailable. A partial calculated sum is included as evidence but cannot pass.

`Snapshot`, `SnapshotMetadata`, `Row`, `Cell`, `Column`, `Metric`, `FinancialRule`,
`SchemaChange`, and record `Evidence` types are exported. Errors reject/throw;
SDK code never exits the caller's process or logs dataset contents automatically.

## Experimental replay and forensic APIs

```ts
import { replay, investigate, makeCapsule, replayCapsule, type Scenario } from 'domo-time-machine';
const inputs = { bookings: before.rows };
const scenario: Scenario = {
  version: 1,
  name: 'booking-total',
  inputs: { bookings: before.metadata.id },
  steps: [
    {
      id: 'total',
      input: 'bookings',
      operation: 'aggregate',
      groupBy: [],
      measures: [{ column: 'Fare', operation: 'sum', as: 'FareTotal' }],
    },
  ],
  output: 'total',
  assertions: [{ table: 'total', column: 'FareTotal', aggregation: 'sum', equals: '8000' }],
};
const execution = replay(scenario, inputs);
// Only after reviewing every included value:
const capsule = makeCapsule(scenario, inputs, { mode: 'reviewed', reviewed: true });
const reproduced = replayCapsule(capsule);
```

`replay(spec, inputs, {signal?, maxRows?, milliseconds?})` resolves **only supplied
logical input names**, checks the strict DSL, clones inputs and returns rows,
step counts/expansion factors, assertions, settings and an output hash. Limits can
be lowered per call. A pre-aborted signal cancels; this synchronous engine cannot
receive new event-loop input while executing. No worker/server is started.

`investigate(before, after, keys, metrics)` returns record evidence, metric deltas,
grouped sum contributions, observation/hypothesis findings and an integrity hash.
Every referenced row uses a zero-based index into the named snapshot.

Capsules: `previewCapsule`, `makeCapsule`, `inspectCapsule`, `readCapsule`,
`replayCapsule`, `saveJson`, `regressionSource`. Read/import never executes bundled
code. Regression source is generated separately for explicit review/execution.
All filesystem operations are explicit caller actions. `saveJson` never overwrites.
`readCapsule` accepts a filesystem string or file URL. `regressionSource` accepts
a relative JSON filesystem path. The CLI computes this path relative to the
exported script, so a regression harness can live in a different directory and
handle filenames containing spaces, Unicode, `#` or `%`.

Capsules require exactly the scenario's declared input aliases; unrelated inputs
are rejected rather than silently exported. Invalid numeric replay aggregates
throw a diagnostic; numeric assertion comparisons ignore insignificant trailing
zeroes. `VERSION` follows installed package metadata rather than a hardcoded value.

`DomoReadOnlySource`, `DomoCaptureContext`, `DomoDatasetDescription` are **types
only**, documenting future read-only integration. No live transport is shipped.
