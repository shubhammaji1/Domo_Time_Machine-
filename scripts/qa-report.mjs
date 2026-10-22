import { readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { project, artifactDirectory } from './artifacts.mjs';
import { format, resolveConfig } from 'prettier';
const root = join(project, 'qa-report'),
  evidence = join(root, 'evidence');
const read = async (name) => JSON.parse(await readFile(join(evidence, name), 'utf8'));
for (const name of await readdir(artifactDirectory('reports'))) {
  if (/^user-e2e-(published|local)-v(22\.22\.0|22\.13\.0|24\.22\.0)\.json$/.test(name))
    await copyFile(join(artifactDirectory('reports'), name), join(evidence, name));
}
const audit = await read('audit-v22.22.0.json'),
  registry = await read('registry.json'),
  vitest = await read('vitest.json');
const coverage = await read('coverage/coverage-summary.json'),
  artifacts = await read('artifact-comparison.json');
const publicRuns = await Promise.all(
  ['22.13.0', '22.22.0', '24.22.0'].map((v) => read(`user-e2e-published-v${v}.json`)),
);
const local = await read('user-e2e-local-v22.22.0.json');
const gates = await read('quality-gates.json');
const securityCompletion = await read('security-completion.json');
const table = (headers, rows) =>
  `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map((r) => '| ' + r.map((v) => String(v).replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ') + ' |').join('\n')}\n`;
const prettierConfig = await resolveConfig(join(project, 'README.md'));
const report = async (name, title, body) =>
  writeFile(
    join(root, name + '.md'),
    await format(
      `# ${title}\n\nVerified ${audit.createdAt}; published ${audit.package}; Windows ${audit.osRelease}, ${audit.architecture}.\n\n${body.trim()}\n`,
      { ...prettierConfig, filepath: name + '.md' },
    ),
  );
const unsupported = [
  {
    id: 'B-DOMO',
    status: 'BLOCKED',
    reason: 'REAL DOMO VALIDATION NOT PERFORMED; no implemented transport or authorized tenant.',
  },
  {
    id: 'B-LINUX',
    status: 'BLOCKED',
    reason: 'Linux execution environment unavailable; CI definition is not a completed run.',
  },
  { id: 'B-MAC', status: 'BLOCKED', reason: 'macOS execution environment unavailable.' },
  { id: 'S-NODE20', status: 'SKIPPED', reason: 'Outside package engines >=22.13.0.' },
  {
    id: 'S-1M',
    status: 'SKIPPED',
    reason: '1,000,000 rows exceed the explicit 100,000-row limit.',
  },
  {
    id: 'S-WRITES',
    status: 'SKIPPED',
    reason: 'Production rollback/restore writes are unsupported and prohibited.',
  },
  { id: 'S-AI', status: 'SKIPPED', reason: 'Optional AI is future scope, not a core dependency.' },
  { id: 'U-CI', status: 'UNVERIFIED', reason: 'New GitHub Actions jobs were not run remotely.' },
  {
    id: 'U-PROVENANCE',
    status: 'UNVERIFIED',
    reason:
      'Registry signatures exist; signature/provenance cryptographic verification not performed; repository field absent.',
  },
  {
    id: 'U-POWER',
    status: 'UNVERIFIED',
    reason:
      'No physical power-loss, OS full disk, ACL denial or hostile local race testing; ENOSPC was injected before rename.',
  },
  {
    id: 'U-LOAD',
    status: 'UNVERIFIED',
    reason:
      'No sustained soak, million-file history, OS cold-cache or isolated peak-memory benchmark.',
  },
  {
    id: 'U-INDEPENDENT',
    status: 'UNVERIFIED',
    reason:
      'Security review was sequential; no independent second reviewer or exhaustive dependency-source audit.',
  },
];
const passed =
  vitest.numPassedTests +
  audit.passed +
  local.passed +
  publicRuns.reduce((n, r) => n + r.passed, 0);
const failed =
  vitest.numFailedTests +
  audit.failed +
  local.failed +
  publicRuns.reduce((n, r) => n + r.failed, 0);
const totals = {
  passed,
  failed,
  blocked: 3,
  skipped: 4,
  unverified: 5,
  note: 'Counts combine Vitest cases and named black-box check groups; commands, property iterations and benchmark repetitions are not counted again. Blocked/skipped/unverified are planned validation groups, not fabricated Vitest cases.',
};
const scorecard = [
  [
    'Core functionality',
    25,
    8,
    'Installed workflows, independent expected values, financial gates pass.',
  ],
  [
    'Historical integrity',
    20,
    8,
    'Five versions, exact originals, crash and collision checks pass; power-loss unverified.',
  ],
  [
    'Security',
    15,
    7,
    'Input/control tests and advisory audits pass; partial single-reviewer source audit.',
  ],
  ['CLI / SDK', 10, 8, 'ESM, strict TS, CJS dynamic import and installed CLI pass.'],
  [
    'Domo integration',
    10,
    null,
    'Not implemented; excluded from offline-package score, live validation BLOCKED.',
  ],
  ['Performance', 10, 7, 'Three samples per supported size; no production SLA or soak evidence.'],
  ['Documentation', 5, 5, 'Two published README defects; local fixes verified separately.'],
  [
    'Packaging / CI',
    5,
    7,
    'Real tarball consumers and hashes pass; remote matrix and provenance unverified.',
  ],
];
const score =
  scorecard.reduce((n, r) => n + (r[2] === null ? 0 : r[1] * r[2]), 0) /
  scorecard.filter((r) => r[2] !== null).reduce((n, r) => n + r[1], 0);
const knownDocFailures = audit.checks.filter(
  (c) => !c.passed && c.name.startsWith('published README'),
).length;
const coreFailures = failed - knownDocFailures;
const verdict = coreFailures ? 'NOT PRODUCTION READY' : 'READY FOR CONTROLLED BETA';
const summary = {
  package: audit.package,
  createdAt: audit.createdAt,
  totals,
  coverage: coverage.total,
  verdict,
  score,
  confidence:
    'Moderate: strong local functional evidence, limited platform/tenant/security independence evidence.',
  criticalBugs: 0,
  highBugs: 0,
  openPublishedBugs: knownDocFailures,
  domoVerified: false,
  securityCompletion,
  unsupported,
  scorecard,
};
await writeFile(join(evidence, 'summary.json'), JSON.stringify(summary, null, 2));
await report(
  'EXECUTIVE_SUMMARY',
  'Release audit executive summary',
  `
**${verdict}** for the offline package. This is not a production certification or evidence of a working Domo connector.

Security report finalization: **${securityCompletion.status}**. ${securityCompletion.detail}

${passed} passed, ${failed} failed check cases/groups; 3 blocked, 4 skipped and 5 unverified validation groups. The two published failures concern README instructions, not the tested runtime. No Critical or High defect was confirmed in this pass. Weighted assessment: **${score.toFixed(1)}/10**, moderate confidence; subjective evidence assessment, not a probability of correctness. Domo's future-feature weight is excluded and remaining weights are normalized from 90 to 100.

Current npm latest is **${registry.version}**, not the older 0.1.0 baseline. Its core workflows pass on Windows Node 22.13.0, 22.22.0 and 24.22.0. Local source retains version 0.1.1 and now has additional QA, CI and documentation changes. Nothing was published or version-bumped during this audit. All ${artifacts.compiledFilesVerified} compiled JS/declaration files match npm byte for byte; local documentation and package metadata differ.

Coverage: ${coverage.total.statements.pct}% statements, ${coverage.total.branches.pct}% branches, ${coverage.total.functions.pct}% functions, ${coverage.total.lines.pct}% lines. The aspirational 90% core branch goal is not met across the whole core; CLI child processes are not instrumented by this Vitest report.

1. Does it install independently? Yes: default, exact and downloaded npm tarball; uninstall/reinstall and actual npx help succeeded outside the repository.
2. Are historical states correct? The five-version oracle and original-byte retrieval passed, including Alice 100→150, removed Bob, new Diana and unchanged Charlie.
3. Is real Domo verified? **BLOCKED — REAL DOMO VALIDATION NOT PERFORMED.** Interfaces/design only.
4. Is data safe? Tests preserved committed snapshots after malformed input, concurrent writes, kill, ENOSPC injection and UUID collision. Checksums are not authentication, encryption or a power-loss guarantee.
5. Do CLI and SDK work? Tested workflows, strict installed declarations, ESM and CJS dynamic import pass. Two published README instructions fail verbatim.
6. Does interruption recover? Prior states remain readable; doctor exposes staging/locks. Recovery is manual after verifying the writer has stopped.
7. Can a new developer use it? Yes with corrected local instructions; published examples need the node_modules fixture prefix and source-only scripts need clear labeling.
8. What are the top fixes? Publish corrected docs only after authorization; execute the remote platform matrix; improve coverage; obtain independent security review; validate Domo only after implementing the connector.
9. What remains untested? See [compatibility](COMPATIBILITY_MATRIX.md), [security](SECURITY_AUDIT.md) and [performance](PERFORMANCE_BENCHMARKS.md).
10. What must be retested? Clean install the final authorized release, rerun both README probes and all core gates, and retain Windows/Linux/macOS CI evidence.

Start with [test results](TEST_RESULTS.md), [bugs](BUG_REPORT.md), [readiness](RELEASE_READINESS.md) and [evidence summary](evidence/summary.json).`,
);
await report(
  'PACKAGE_INVENTORY',
  'Package inventory and actual capabilities',
  `
Registry metadata: [registry.json](evidence/registry.json). Integrity: ${registry.dist.integrity}. Latest tag ${registry['dist-tags'].latest}; engines ${registry.engines.node}; MIT; five runtime dependencies; no declared peer dependencies, workspaces or optional runtime dependencies. Repository/homepage metadata is absent. Registry signature presence does not prove verified provenance.

Bin: domo-time-machine → dist/cli/index.js. Root ESM export has import and types conditions; direct require is not advertised. No subpath/browser export. Runtime import reads package version metadata, creates no workspace and makes no network request. No install/postinstall lifecycle hooks; source build/prepack/prepublish gates are development/release scripts, not consumer install hooks.

${table(
  ['Feature', 'Advertised', 'Implemented', 'Exported', 'Testable / status'],
  [
    [
      'CSV / JSON / NDJSON capture',
      'Yes',
      'Yes',
      'Workspace.capture',
      'PASS; exact types and originals',
    ],
    [
      'Immutable retrieval / metadata history',
      'Yes',
      'Yes',
      'Workspace.get/list/doctor',
      'PASS with documented limits',
    ],
    ['Typed/multiset dataset diff', 'Yes', 'Yes', 'compare', 'PASS; duplicate ambiguity explicit'],
    ['Schema comparison/history', 'Yes', 'Yes', 'compareSchemas/schemaHistory', 'PASS'],
    [
      'Financial validation',
      'Yes',
      'Yes',
      'validateFinancial/metric',
      'PASS; decimal strings and currency gates',
    ],
    [
      'Replay and what-if scenarios',
      'Experimental',
      'Allowlisted DSL',
      'replay/scenarioSchema',
      'PASS for tested DSL; no native Magic ETL',
    ],
    [
      'Investigation',
      'Experimental',
      'Evidence and hypotheses',
      'investigate',
      'PASS; no causal proof claim',
    ],
    [
      'Incident capsules',
      'Experimental',
      'Reviewed plain JSON',
      'capsule APIs',
      'PASS; no automatic anonymization',
    ],
    [
      'Domo connector',
      'Design/types only',
      'No transport',
      'Types only',
      'NOT IMPLEMENTED; live BLOCKED',
    ],
    ['Production restore, retention deletion', 'No', 'No API', 'No', 'Unsupported'],
    ['AI investigation', 'Future optional', 'No', 'No', 'Not applicable'],
    [
      'UI/server/database',
      'Explicitly prohibited',
      'None required',
      'No',
      'Architecture compliant',
    ],
  ],
)}

All 32 runtime exports are enumerated in [audit JSON](evidence/audit-v22.22.0.json). Utility/schema exports are supporting APIs; installed workflows exercise the documented evaluation surface rather than claiming every possible argument combination. Declarations ship with JS, README, LICENSE, docs and fixtures; no source maps, caches, secrets files, QA output, databases or original captured customer files are included. See [artifact comparison](evidence/artifact-comparison.json).`,
);
await report(
  'TEST_PLAN',
  'Executed plan, boundaries and reproduction',
  `
1. Query current npm metadata, dry-run/pack the registry release, verify integrity and inspect the actual tarball.
2. Create an OS temporary consumer outside the source tree. Install default/latest, exact version and downloaded tarball; uninstall/reinstall; invoke npm exec and actual npx.
3. Execute CLI help/error/option checks, strict installed TypeScript, JavaScript ESM and CJS dynamic import; block standard Node networking entry points during dataset workflows.
4. Verify a five-version oracle, captured-time ties (source test with Date-only fake clock), out-of-order UTC source timestamps, schema/type changes, exact original bytes and row-order semantics.
5. Use independent writers/readers; pause a writer before rename and kill it; inject ENOSPC at commit and a UUID collision; verify doctor/recovery and unrelated UUID reads after corruption.
6. Run safe malicious-input fixtures and advisory audits; trace source controls with the security-scan workflow. No real credentials, Domo tenant writes or undocumented endpoints.
7. Measure three repetitions at 100/1,000/10,000/100,000 rows. Instrument source coverage; compare published/current build/local tarball; add non-publishing CI evidence collection.

Reproduce from a source checkout: npm ci; npm run test:coverage; npm run qa:checks; npm run qa:audit; npm run qa:artifacts; npm run qa:report. Registry checks need network for npm installation/audit; core dataset operations remain offline. qa:audit deliberately returns nonzero while the published README probes fail. Do not weaken those probes to hide failures.

Tests use synthetic data only. Fault preload is test-only and explicit, not a production environment variable API. It intercepts the local commit operation; it does not simulate real hardware failure. Failed consumers remain at the path recorded in audit evidence. Test command outputs contain no authorization headers or credentials. No package publication is part of this plan.`,
);
await report(
  'TEST_RESULTS',
  'Results and measured coverage',
  `
${table(['Suite / artifact', 'Passed', 'Failed', 'Evidence'], [[`Source Vitest (${vitest.numTotalTests} cases)`, vitest.numPassedTests, vitest.numFailedTests, 'evidence/vitest.json'], ...publicRuns.map((r) => [`Published ${r.node}`, r.passed, r.failed, `evidence/user-e2e-published-${r.node}.json`]), ['Local tarball Node 22.22.0', local.passed, local.failed, 'evidence/user-e2e-local-v22.22.0.json'], ['Extended independent audit', audit.passed, audit.failed, 'evidence/audit-v22.22.0.json'], ['Total check cases/groups', passed, failed, 'evidence/summary.json']])}

These counts do not double-count individual CLI calls, the 100 fast-check property iterations or 12 benchmark samples. No automated case was marked skipped in Vitest; blocked/skipped/unverified planned groups are enumerated separately below.

${table(
  ['Validation group', 'Status', 'Reason'],
  unsupported.map((r) => [r.id, r.status, r.reason]),
)}

${table(
  ['Source coverage', 'Statements', 'Branches', 'Functions', 'Lines'],
  Object.entries(coverage)
    .filter(
      ([key]) =>
        key === 'total' || /src[\\/](core|diff|metrics|replay|storage|capsules|cli)/.test(key),
    )
    .map(([name, c]) => [
      name === 'total' ? 'TOTAL' : name.split(/src[\\/]/)[1],
      c.statements.pct + '%',
      c.branches.pct + '%',
      c.functions.pct + '%',
      c.lines.pct + '%',
    ]),
)}

Coverage includes source modules; CLI execution in spawned tsx processes is not merged into the parent Vitest V8 measurement. Do not describe 0% measured CLI coverage as absent CLI execution, or black-box CLI execution as instrumented branch coverage. Core/diff/metrics exceed 90% branches individually, while replay/storage/capsules do not. Review [HTML coverage](evidence/coverage/index.html) and [raw summary](evidence/coverage/coverage-summary.json).

Quality gate command logs are retained separately and are not additional unit cases: [quality-gates.json](evidence/quality-gates.json).

${table(
  ['Gate', 'Exit status'],
  gates.map((g) => [g.name, g.exitCode]),
)}

Initial audit-harness lint errors and Node-24 inherited npm selector errors were corrected and rerun; they are harness defects, not published runtime defects.`,
);
const cliOptions = [
  ['Global', '--workspace, --format json/text, --help, --version'],
  ['capture', '--name, --dataset, --key, --completeness, --dry-run'],
  ['diff', '--key, --after-key, --fail-on-change, --out'],
  ['investigate', '--key, --metric, --metrics, --currency, --currency-column, --out'],
  ['replay', '--out'],
  ['capsule create', '--out, --reviewed, --synthetic'],
  ['capsule regression', '--out'],
  ['schema history', '--dataset'],
  ['validate', '--column, --currency, --currency-column, --expected, --tolerance'],
];
await report(
  'CLI_TEST_RESULTS',
  'CLI command and option verification',
  `
${table(['Command surface', 'Actual supported options'], cliOptions)}

Help was invoked for root, init, capture, snapshots/list/inspect, diff, investigate, replay, capsule/create/inspect/replay/regression, doctor, schema/history/compare and validate. Positive installed workflows cover each leaf command. Remaining-option audit covers mapped key flags, dry-run, completeness rejection, metrics-file loading and diff/investigation/replay output. Financial tolerance/currency cases are also checked through the SDK; not every cross-product of CLI options is separately exercised.

Exit 0 succeeds; exit 1 is a financial/assertion/diff/doctor gate; exit 2 reports malformed inputs/configuration, missing files and unknown commands/options. Negative paths assert nonempty stderr and empty stdout. JSON stdout parses, text reports render, report collisions and duplicate capture names preserve prior bytes. --json/--verbose/--quiet are not supported; tests do not advertise them. --dry-run is a stat/size preview, not full data/config validation.

Actual commands, help output and error text: [commands-v22.22.0.json](evidence/commands-v22.22.0.json). CLI workflows under networking denial use a Node preload guard, not an OS network firewall. Actual npx invocation is included in the independent install check. POSIX shell/bin execution still needs the remote matrix.`,
);
await report(
  'SDK_TEST_RESULTS',
  'SDK contracts and consumer isolation',
  `
ESM import, ordinary JS, strict NodeNext TypeScript without ancestor ambient types or skipLibCheck, and CommonJS dynamic import pass against actual installed packages. Direct require and browser bundling are not advertised/tested. Installed package dependencies resolve without source-tree imports. The TypeScript compiler comes from the source tooling, while package resolution occurs in the independent consumer.

Documented Workspace, comparison/schema, metric/financial, replay/investigation and capsule APIs run on synthetic inputs with independent expected values. Supporting validation/schema/canonical/hash utilities are covered by source tests. Import reads installed package.json for VERSION; no datasets/workspace/network access occurs implicitly. Caller errors throw/reject rather than exiting the host process or logging raw rows.

Known bounds: date values remain strings; sourceUpdatedAt requires UTC Z; JSON callers must use strings for unsafe integers/precise decimals; cancellation is cooperative in a synchronous replay; duplicate keys can remain ambiguous. Exact and limits/schema utilities are publicly exported supporting objects; avoid changing global configuration in a shared process. Capsule input contents are intentionally returned in previews and require caller review.

See strict consumer checks in [published E2E](evidence/user-e2e-published-v22.22.0.json), [local E2E](evidence/user-e2e-local-v22.22.0.json), [source results](evidence/vitest.json) and [installed exports](evidence/audit-v22.22.0.json). No native Domo restoration or arbitrary DataFlow execution API exists.`,
);
await report(
  'TIME_MACHINE_VALIDATION',
  'Historical state, failures and recovery',
  `
The independent oracle begins Alice=100, Bob=200, Charlie=300 and captures Alice=150, Charlie=300, Diana=400. Expected and actual: one added, one removed, one updated, one unchanged. Later versions add/remove schema fields, change amount string→number, preserve null/absent/false, Unicode and a large integer encoded as a string. Reversed row order compares unchanged by key while producing a different ordered content hash. All five prior states and original bytes remain retrievable from new Workspace instances.

The source history test fixes only Date to create identical capturedAt timestamps and verifies UUID tie ordering. SourceUpdatedAt alternates older/newer UTC timestamps; it is retained as metadata, not treated as capture ordering or evidence of when rows changed. Capture time and source change time are distinct. There is no point-in-time server restore; selecting an immutable snapshot is the supported historical access operation.

Four writer processes (same, same, a, b) commit exactly three snapshots. One name collision fails. A writer paused immediately before commit is killed while repeated readers still see only the baseline. Doctor exposes one temporary directory and one lock, no corrupted committed snapshot. The stale name stays locked until deliberate recovery; an unrelated name still captures. Only after stopping the writer and removing its verified synthetic staging/lock did retry succeed.

Injected ENOSPC at rename and forced UUID collision leave prior data intact and clean staged state on handled failure. Corrupt committed metadata is diagnosed: valid UUID reads continue, but list/name lookups/new capture fail closed because they validate all metadata. This is a documented availability limitation, not silent historical corruption. Automatic stale-lock deletion, retention, rollback writes, filesystem power-loss durability and hostile local races are not claimed.

Evidence: audit observations.history/concurrency/crash/injectedFailures/corruption in [audit JSON](evidence/audit-v22.22.0.json); Date-tie test in tests/integration/history.test.ts. Do not blindly remove locks in an active workspace.`,
);
await report(
  'DOMO_INTEGRATION_RESULTS',
  'Domo integration verification status',
  `
**BLOCKED — REAL DOMO VALIDATION NOT PERFORMED.**

The shipped adapter exports TypeScript interfaces only. There is no transport, credential provider, HTTP retry/rate-limit implementation, tenant permission/PDP handling or live export command to exercise. Mocking invented endpoints would test a fabricated connector; those tests were not created. Domo scoring is not applicable to this offline-only implementation and does not receive passing credit.

The design cites official API references, but this audit does not re-verify their live contracts or prove tenant access. No Domo credentials were requested/read, no remote customer dataset was fetched and no production write occurred. Manual authorized CSV/JSON/NDJSON exports can be captured offline; their completeness remains caller-declared.

Before claiming integration: implement the read-only interface against current official documentation; add HTTP contract fixtures for auth/401/403/404/429/5xx/timeouts/truncation, fixed-host redirects, cancellation and bounded export; then run an explicitly authorized sandbox with permission/completeness evidence. Dataset value history cannot be inferred from DataFlow configuration history.`,
);
await report(
  'SECURITY_AUDIT',
  'Security controls, evidence and limits',
  `
No reportable product security vulnerability was confirmed in this pass; no Critical/High security finding. This is a partial, sequential source review with dynamic synthetic checks, not a comprehensive security certification. Product source boundaries, SECURITY.md and packaging were traced; third-party implementations and every developer fixture were not exhaustively audited.

Full and production-only npm audits report zero known advisories at execution time: [audit-all](evidence/audit-all.json), [audit-production](evidence/audit-production.json). This does not prove the dependency graph is vulnerability-free. Runtime dependency tree and tarball entrypoints are recorded. No install/postinstall hooks, implicit telemetry, server, eval, SQL execution or production network/write path was found in core source. Source/config search found no supported credential exposure; opaque strings/checksums and synthetic data were not treated as credentials.

Traversal strings remain logical names; snapshot paths use validated UUIDs. Prototype keys, nested cells, unsafe integers, oversized sources/columns, invalid UTF-8 and symlink snapshot entries reject. Writes use exclusive creation, private permission hints, per-name locks and atomic commit. Metadata/original/normalized hashes detect changes. Terminal output escapes control/bidi characters; syntax diagnostics redact raw rows. Regression filenames are JSON-encoded, not shell-interpolated. Capsule export requires explicit review and contains all referenced values; there is no automatic anonymity.

Limits: trusted root ancestors and OS ACLs are required; Windows mode hints are not a full access policy. A writer with filesystem authority can recompute unauthenticated hashes. No encryption, authenticated provenance, power-loss guarantee or OS resource/network sandbox is claimed. Standard Node network entry points were blocked in installed dataset tests, not every possible native syscall. CLI metrics configuration-file memory bounds and long-duration stress were not exhaustively tested. No real Domo auth/security boundary exists yet.

Security report finalization: **${securityCompletion.status}** (checked ${securityCompletion.checkedAt}). ${securityCompletion.detail}

The security-scan plugin's source coverage remains partial. This QA document summarizes executed control tests and does not replace the canonical scan. Independent review and remote platform execution remain follow-up work.`,
);
const pct = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const perfRows = [100, 1000, 10000, 100000].map((n) => {
  const runs = audit.benchmarks.filter((b) => b.rows === n);
  return [
    n,
    ...['captureMs', 'firstReadMs', 'warmReadMs', 'diffMs', 'replayMs'].map(
      (k) =>
        `${pct(
          runs.map((r) => r[k]),
          0.5,
        ).toFixed(1)} / ${pct(
          runs.map((r) => r[k]),
          0.95,
        ).toFixed(1)}`,
    ),
    runs[0].storageBytes,
  ];
});
await report(
  'PERFORMANCE_BENCHMARKS',
  'Repeated supported-size benchmarks',
  `
Environment: ${audit.cpu}; ${audit.node}; Windows; measurements ran alongside other verification activity and are not isolated production performance claims. Deterministic synthetic NDJSON rows use unique string IDs and amount=0.10. Each size has three fresh-workspace repetitions, then verified read/warm read, a one-row changed keyed comparison and exact aggregate replay with independent expected total rows/10.

Cells below are **median / nearest-rank sample p95 in milliseconds**. With only three samples, p95 is the maximum sample, not an estimate of production tail latency.

${table(['Rows', 'Capture', 'First read', 'Warm read', 'Changed diff', 'Replay', 'Store bytes'], perfRows)}

Per-sample CPU user/system microseconds, end RSS/heap/external memory, process lifetime maxRSS, source bytes and total logical store bytes are retained in [audit benchmarks](evidence/audit-v22.22.0.json). End memory is not per-operation peak memory; lifetime maxRSS cannot be attributed to one sample. File sizes are logical sizes, not actual NTFS allocation. Reads immediately follow capture, so the first read is not an OS cold-cache measurement. Import retains bounded normalized rows in memory; this is not a constant-memory engine.

Three fresh captures per size, five-version history and four-process concurrency provide bounded growth/repetition evidence. No sustained soak, tens-of-thousands snapshot index, measured parallel throughput or cold-start distribution was performed. One million rows are unsupported and skipped; 100,000 rows is the explicit maximum. No arbitrary performance SLA was invented. CI smoke gates verify correctness; benchmark numbers alone are not a release gate.`,
);
await report(
  'COMPATIBILITY_MATRIX',
  'Executed compatibility versus planned CI',
  `
${table(['Package', 'OS', 'Node', 'Status', 'Evidence'], [...publicRuns.map((r) => [r.package, 'Windows x64', r.node, `${r.passed} passed / ${r.failed} failed`, `evidence/user-e2e-published-${r.node}.json`]), [local.package, 'Windows x64', local.node, `${local.passed} passed / ${local.failed} failed`, 'evidence/user-e2e-local-v22.22.0.json'], ['Source tests / V8', 'Windows x64', '22.22.0', `${vitest.numPassedTests} pass`, 'evidence/vitest.json'], ['Current package', 'Linux', '22 / 24', 'BLOCKED locally; CI configured', 'No executed remote evidence'], ['Current package', 'macOS', '22 / 24', 'BLOCKED locally; CI configured', 'No executed remote evidence'], ['Any', 'Any', '20', 'SKIPPED; outside engines', 'No compatibility claim']])}

ESM and NodeNext TS supported; CJS dynamic import tested. Browser bundling and direct require are not advertised. Local NTFS is exercised; network shares, unusual filesystems, POSIX permission enforcement and other architectures are unverified. Tarballs carry CLI mode 0644 and a valid LF shebang. npm's inspected bin-links implementation chmods linked POSIX bins, so the archive mode alone is not evidence of a broken npm installation; actual Linux/macOS npx verification still needs CI.

The initial Node-24 harness inherited npm_config_package=node@24 from npm exec, causing a nested npm invocation to resolve node from a cold cache. Removing that test-runner selector from consumer environments produced a clean 20/20 rerun. This was a harness isolation failure, not a user package regression.`,
);
await report(
  'BUG_REPORT',
  'Reproducible issues and dispositions',
  `
## QA-DOC-001 — Published README misidentifies the installed release

Severity Low; affected published 0.1.1 on all platforms (reproduced Windows Node 22.22.0). Feature: onboarding/release identity. Steps: npm install domo-time-machine@0.1.1; read node_modules/domo-time-machine/README.md. Expected: the release is identified as published. Actual: text calls 0.1.0 published and 0.1.1 a patch candidate. Verified root cause: stale release prose included in immutable npm tarball. Evidence: failed “published README release status” check and embedded publishedReadme in audit JSON. Local fix: update release status with verification date and distinguish future local changes. Runtime release blocker: No. Documentation gate for next release: Yes. Regression: retain the registry README probe; local tarball inspection confirms corrected text. Already-published bytes remain unchanged.

## QA-DOC-002 — Installed booking example references absent consumer-relative fixtures

Severity Medium; affected published 0.1.1, reproduced Windows Node 22.22.0. Feature: first booking workflow. Steps: create an empty consumer; npm install domo-time-machine; run the README booking capture path examples/booking-reconciliation/bookings.csv. Expected: bundled fixture captures two rows. Actual: exit 2, File or snapshot not found. Verified root cause: source-checkout paths and npm run demo were presented without sufficiently explicit source-context labeling. Bare local binary usage also assumes PATH setup. Evidence: failed “published README booking fixture command” and exact stderr/arguments in commands JSON. Local fix: use npx plus node_modules/domo-time-machine/examples/... and label npm run demo/development commands as source-checkout-only. Runtime release blocker: No; onboarding blocker for that copied example: Yes. Regression: retain verbatim published-doc probe; installed-candidate workflow validates corrected bundled-fixture paths. No runtime code was changed.

## Harness defects resolved during this audit

Unused helper bindings initially failed lint; removed before final lint. Cross-drive independent-path assertion initially assumed relative paths start with ..; Windows different drives return absolute paths, now accepted as outside source. Node-version launcher selectors leaked into nested npm exec; isolated consumer environments now remove package/call selectors and Node 24/minimum-22 reruns pass. Archive executable-bit assertion initially assumed POSIX mode was preserved on Windows; inspection of npm bin-links established chmod during installation, so archive mode is recorded rather than misreported as a package vulnerability.

These are audit-harness defects, not additional open package bugs. Handled invalid inputs, duplicate-key ambiguity, manual stale-lock recovery, header-only CSV rejection and corrupt-metadata fail-closed lookup are documented constraints rather than silently “fixed” semantics. The earlier 0.1.0 defects are historical evidence in docs/END_TO_END_REPORT.md; current 0.1.1 runtime checks pass and those failures are not carried forward.

Confirmed open published product/documentation bugs: 2 (Critical 0, High 0, Medium 1, Low 1). See [raw audit](evidence/audit-v22.22.0.json). Broader coverage gaps are tracked separately, not disguised as confirmed vulnerabilities.`,
);
await report(
  'DEVELOPER_EXPERIENCE',
  'Independent developer workflows',
  `
The following supported workflows ran against installed packages; exact commands/output are in commands JSON and E2E reports. Expected results come from synthetic fixture values, not the implementation under test.

${table(
  ['Workflow', 'Fixture / command sequence', 'Independent expectation', 'Negative / failure case'],
  [
    [
      'Historical row reconciliation',
      'v0/v1 JSON; capture, inspect, diff --key id',
      'Alice=100→150; Bob removed; Diana added; Charlie unchanged: 1/1/1/1',
      'Missing key fails; duplicate capture preserves old state',
    ],
    [
      'Financial CI gate',
      'BOM CSV 0.10+0.20 INR; capture; validate --expected 0.30',
      'Exact total 0.3 passes; 9200.55 vs 9200.30 differs 0.25',
      'Mismatched total exit 1; mixed/missing/invalid currency/amounts fail',
    ],
    [
      'Duplicate-join investigation',
      'Bundled bookings/tickets; replay faulty/candidate; investigate Fare',
      'Faulty join 13000 vs booking total 8000; BK101 contributes +5000; candidate counts three tickets',
      'Invalid numeric aggregate fails; ambiguous duplicate evidence never invents pairing',
    ],
    [
      'Schema/history review',
      'Five captures; schema history/compare; original retrieval',
      'Added/removed/type/nullability/optionality recorded; original bytes exact',
      'Corrupt metadata fails validation; valid UUID evidence remains accessible',
    ],
    [
      'Portable incident regression',
      'Reviewed synthetic capsule; copy fresh directory; replay; export regression to reports/',
      'Same expected output hash; paths with spaces/Unicode/#/% work',
      'Unreviewed creation previews only; tampered/extra/wrong alias capsules reject',
    ],
    [
      'Offline automation and recovery',
      'Independent install, network preload, concurrent writers, killed pre-commit capture, doctor',
      'No network required for dataset work; old state readable; partial state uncommitted',
      'Stale name stays locked until verified manual recovery; ENOSPC preserves history',
    ],
  ],
)}

No Domo authentication is needed. The package purpose and bounded offline scope are clear; however published release text and example paths fail a first-time copy/paste experience. Local README now separates installed-user commands from source development scripts. Errors are actionable without echoing raw sensitive input. No invented verbose/quiet/json flags, server URL, Docker, browser or API credential setup is required.

A minimal user path is: create a directory; npm init -y; npm install domo-time-machine; npx domo-time-machine --help; capture node_modules/domo-time-machine/examples/booking-reconciliation/bookings.csv --name bookings; validate bookings --column Fare --currency INR --expected 8000 (prefix CLI operations with npx domo-time-machine). Unsupported native DataFlow replay and production rollback are not counted as successful workflows.`,
);
await report(
  'RELEASE_READINESS',
  'Readiness, scorecard and release gates',
  `
**${verdict}** for bounded offline use, with moderate confidence. Linux/macOS, live Domo and comprehensive independent security certification remain unverified/blocked. A numerical score cannot override a confirmed Critical/High data-integrity or security blocker; none was established in this pass.

${table(
  ['Category', 'Weight', 'Score / 10', 'Evidence / limitation'],
  scorecard.map((r) => [r[0], r[1], r[2] ?? 'N/A', r[3]]),
)}

Normalized score = sum(weight × score) / 90 = **${score.toFixed(1)}/10**. The 10-point Domo weight is excluded because this release advertises design/types, not an implemented connector. This is a qualitative assessment constrained by evidence, not a statistical reliability claim. Real Domo verification is explicitly false.

Passed gates: independent installation; tested historical oracle; financial failure detection; offline CLI/SDK; bounded crash/concurrency behavior; source/build/local/published runtime equality; advisory audits; generated declarations and clean installed consumers. Pending: published README corrections, executed remote matrix, fuller coverage and independent security review. Core 90% branch coverage is aspirational and currently unmet for several modules.

CI now defines Node 22/24 on Windows/Linux/macOS, source coverage and artifact retention; an optional workflow-dispatch job verifies the published release. These definitions were locally inspected, not remotely executed. No publish job, credentials or production Domo operation was added. Published-document probes intentionally keep that optional job red until a future authorized release corrects them.

Publication/version change is not authorized by this audit request and was not performed. The current local archive still uses 0.1.1 for comparison; it must not be published over the immutable existing release. Choose a future version only after explicit owner authorization and final validation.`,
);
await report(
  'RECOMMENDATIONS',
  'Prioritized fixes and required retesting',
  `
1. Ship the corrected onboarding/release documentation in a future explicitly authorized release. Re-run default/exact/tarball installation and both published README probes afterward. Current published 0.1.1 remains immutable.
2. Execute the new remote Windows/Linux/macOS Node 22/24 matrix and retain actual artifacts. Verify npx bin execution and filesystem semantics on each OS; do not convert configured jobs into passing evidence.
3. Increase meaningful capsule/replay/storage branch coverage, and instrument CLI subprocess coverage if a combined percentage is required. Add targeted assertions for uncovered failure paths rather than test-count padding. Current full-suite coverage is recorded honestly.
4. Obtain an independent security review and strengthen release traceability with a verified repository URL and authenticated provenance/signature verification. No credentials should be placed in reports or npm files.
5. Keep Domo integration labeled design-only. Implement documented read-only contracts and synthetic HTTP failure tests before requesting explicit sandbox tenant access. Do not infer historical dataset values from configuration history.

Operational guidance: use decimal strings and explicit currency rules; declare completeness honestly; back up closed workspaces; stop writers before manual orphan/lock recovery. Record supported filesystem/permission assumptions. Add long-history lookup, isolated memory and sustained-load measurements before committing to larger operational workloads or an SLA.

Retest any future runtime change with a failing reproducer first, targeted regression, full Vitest/coverage, typecheck/lint/format, rebuild, npm tarball inspection and an unrelated clean installed consumer. Keep published and local results separate. No version bump or publication occurred here.`,
);
console.log(JSON.stringify(summary, null, 2));
