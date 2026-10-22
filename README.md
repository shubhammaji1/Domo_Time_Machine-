# Domo Time Machine

**Travel Back. Reproduce the Failure. Prove the Fix.**

One independently installable npm package for offline dataset forensics. Includes
a TypeScript/JavaScript SDK and a CLI. No frontend, server, database, cloud account
or Domo authentication is needed. Requires Node 22.13+.

## Installation

```sh
npm install domo-time-machine
npx domo-time-machine --help
```

Version **0.1.1 is published** (verified 2026-10-20). Additional checkout changes
remain local until a future release is explicitly authorized. To evaluate the
current checkout, build and install its local tarball:

```sh
npm ci
npm run build
npm pack
npm exec --offline --package=./.artifacts/packages/domo-time-machine-0.1.1.tgz -- domo-time-machine --help
```

To install persistently, create a fresh project outside this repository and pass
the absolute tarball path to `npm install`. The package provides the `domo-time-machine` binary and ESM APIs
with `.d.ts` declarations. CommonJS callers can use dynamic `import()`.

## CLI

```sh
npx domo-time-machine init
npx domo-time-machine capture before.csv --name before --dataset bookings --key Booking_ID --completeness complete
npx domo-time-machine capture after.ndjson --name after --dataset bookings
npx domo-time-machine snapshots list
npx domo-time-machine snapshots inspect before
npx domo-time-machine diff before after --key Booking_ID
npx domo-time-machine --format text diff before after --key Booking_ID
npx domo-time-machine schema compare before after
npx domo-time-machine schema history --dataset bookings
npx domo-time-machine validate before --column Fare --currency INR --expected 8000
npx domo-time-machine investigate before after --key Booking_ID --metric Fare --currency INR --currency-column Currency
npx domo-time-machine doctor
```

Use `--workspace <directory>` for a different storage location. Global
`--format json|text` applies to every data-reporting command. The diff text format
is a compact summary; other text reports print readable field/value paths.
`--out <file>` on diff/investigate/replay writes the complete JSON evidence report
using exclusive creation. Existing files are never overwritten.

Exit codes: **0** successful operation, **1** failed financial/replay assertion,
diff gate or doctor integrity check, **2** invalid arguments/configuration or
execution failure. Add `diff --fail-on-change` for CI comparison gates.

Capture CSV, JSON arrays or NDJSON. CSV cells remain strings; JSON scalar types
are preserved. Missing, null, empty string and zero remain distinct. Default
completeness is `unknown`; only declare `complete` when justified by the export.
`capture --dry-run` reports size/name without creating a snapshot; it is not a
full parsing check.

Composite keys use commas. `--after-key` maps before/after key names positionally.
Without keys, diff uses unordered multiset comparison. Repeated business keys
are reported, exact records cancel by multiplicity, and unmatched repeated-key
records remain ambiguous rather than being paired arbitrarily.

## TypeScript / JavaScript SDK

```ts
import {
  Workspace,
  compare,
  compareSchemas,
  schemaHistory,
  validateFinancial,
  investigate,
  type Snapshot,
  type FinancialRule,
} from 'domo-time-machine';

const store = new Workspace('./evidence');
await store.capture('./before.csv', {
  name: 'before',
  datasetName: 'bookings',
  keyColumns: ['Booking_ID'],
});
await store.capture('./after.json', { name: 'after', datasetName: 'bookings' });
const before: Snapshot = await store.get('before'); // verifies artifact integrity
const after = await store.get('after');
const difference = compare(before, after, ['Booking_ID']);
const schema = compareSchemas(before.metadata.schema, after.metadata.schema);
const history = schemaHistory(await store.list(), 'bookings');
const rule: FinancialRule = { column: 'Fare', currency: 'INR', expected: '8000' };
const validation = validateFinancial(before.rows, rule);
const report = investigate(
  before,
  after,
  ['Booking_ID'],
  [
    {
      name: 'fare',
      column: 'Fare',
      aggregation: 'sum',
      currency: 'INR',
      currencyColumn: 'Currency',
      groupBy: ['Booking_ID'],
    },
  ],
);
console.log({ difference, schema, history, validation, report });
```

See [public API reference](docs/API.md) for contracts, replay and capsule examples.
SDK imports read package-version metadata but do not access datasets, create workspaces or make network requests.

Financial validation uses decimal arithmetic and a currency column (`Currency`
by default). Mixed/missing currencies, missing/null/invalid amounts, empty totals
and amounts beyond the configured absolute tolerance fail the gate. There is no
automatic FX conversion. Use decimal **strings** to avoid losing precision before
the SDK receives values. Raw metric aggregations report excluded cells separately;
the stricter financial validator does not approve a partial total.

## Booking reconciliation and deterministic replay

```sh
npm run demo
```

Run `npm run demo` from a source checkout after `npm ci`; it is a contributor
script. For an installed package, use the CLI and the bundled fixtures below.
The demonstration executes actual synthetic fixtures in a fresh workspace, reproduces a faulty
one-to-many join (fare 13000 versus booking total 8000), identifies BK101's +5000
contribution, runs a booking-grain candidate (8000, with all three ticket records
accounted for by TicketCount), and verifies a portable replay capsule.

```sh
npx domo-time-machine capture node_modules/domo-time-machine/examples/booking-reconciliation/bookings.csv --name bookings
npx domo-time-machine capture node_modules/domo-time-machine/examples/booking-reconciliation/tickets.ndjson --name tickets
npx domo-time-machine replay node_modules/domo-time-machine/examples/booking-reconciliation/faulty.yaml
npx domo-time-machine replay node_modules/domo-time-machine/examples/booking-reconciliation/candidate.yaml
```

Replay DSL v1 supports select, rename, filter, inner/left join, group/aggregate,
deduplicate, sort and derived arithmetic. It accepts no code, arbitrary SQL,
filesystem paths or network operations. Assertions and output hashes support
regression testing. Candidate scenarios never mutate original snapshots. This
engine models supported operations; it does not execute arbitrary Magic ETL files.
Ticket fees, cancellations and legitimate reissue charges need business-specific rules.

## Incident capsules

```sh
npx domo-time-machine capsule create node_modules/domo-time-machine/examples/booking-reconciliation/candidate.yaml
npx domo-time-machine capsule create node_modules/domo-time-machine/examples/booking-reconciliation/candidate.yaml --reviewed --synthetic --out incident.json
npx domo-time-machine capsule inspect incident.json
npx domo-time-machine capsule replay incident.json
npx domo-time-machine capsule regression incident.json --out regression.mjs
node regression.mjs
```

The first command previews every included value. Review before using `--reviewed`;
use `--synthetic` only for synthetic inputs. Plain JSON capsules contain embedded
inputs, DSL, assertions and integrity hashes. There is no automatic anonymization,
minimization or executable-code import. Prefer a minimized synthetic reproduction.

## Development and verification

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run demo
npm run test:package
npm run test:e2e
```

The development commands above require a source checkout. `test:package` packs the package, inspects its contents, installs into a fresh
project, invokes the executable through npm exec (the same mechanism as npx),
compiles a TypeScript consumer and runs installed SDK/CLI workflows with network
access disabled. Tests cover booking reconciliation, missing rows, schema changes,
duplicate joins, financial discrepancies, storage safety and malicious inputs.
GitHub Actions defines Windows/Linux and Node 22/24 checks; remote CI execution is
separate from local verification.
`npm run test:e2e` runs black-box CLI/SDK workflows against a fresh installation
of the local tarball. `npm run test:e2e:published` separately downloads and tests
the current public release from a cold npm cache. Results are written under
`.artifacts/reports`, and failing synthetic workspaces are retained for reproduction.
Registry tests are opt-in and require network access for installation; all dataset
operations after installation run with network entry points blocked.
`npm run test:coverage` measures V8 source coverage. `npm run qa:audit` performs
the extended registry audit, interruption/concurrency checks and repeated supported
size benchmarks in a consumer outside this repository. `npm run qa:checks` saves
quality-gate logs. Read `qa-report/EXECUTIVE_SUMMARY.md` in the source checkout;
audit evidence is intentionally excluded from npm archives.

Generated files are consolidated under `.artifacts/`: npm downloads in `npm-cache`,
package archives in `packages`, saved demonstrations in `demos`, and disposable
test/benchmark work in `tmp`. Existing demonstration workspaces from earlier builds
are preserved in `legacy-workspaces`. No generated archive or test workspace is
written into the project root by these scripts. The local `.npmrc` also directs
plain `npm pack` output into `.artifacts/packages`.

Use `npm run clean` to remove `dist`, temporary test files and generated archives.
It preserves saved demos, archived workspaces, npm cache and installed dependencies.
`npm run build` or the automatic `prepack` hook regenerates `dist` before packaging
or direct `npm publish`. `node_modules` is required for development and `dist` is
the compiled SDK/CLI used by the installed package; both are intentionally retained
after verification. Nothing under `.artifacts` is included in the npm package.
Direct `npm publish` also runs type checking, lint, formatting checks and tests
through `prepublishOnly` before rebuilding the package. No script publishes automatically.

Current limits: 64 MiB source, 128 MiB normalized evidence, 100,000 rows, 256 columns,
50 replay steps, 100,000 output rows per step and cooperative 15-second replay
checks. Imports stream CSV/NDJSON but bounded normalized rows stay in memory.
Nested JSON, unsafe integers and header-only CSV are rejected. Dates are strings.

v0.1 priorities are CLI/SDK, immutable captures, comparison/schema history,
financial validation and packaging. Existing tested replay/investigation and
capsule features are retained as experimental APIs planned for stabilization in
v0.2/v0.3. A read-only Domo connector is [designed](docs/DOMO_INTEGRATION.md), not
implemented. AI is future optional scope. No production writes or automatic
publication exist. See [verification report](docs/DEVELOPMENT_REPORT.md),
[semantics](docs/SEMANTICS.md), and [security](SECURITY.md).
For the published-release defects, candidate fixes and executed runtime matrix,
see [real-user end-to-end verification](docs/END_TO_END_REPORT.md).
