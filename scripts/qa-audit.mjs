import assert from 'node:assert/strict';
import { spawnSync, fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir, release, cpus } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { artifactDirectory, project } from './artifacts.mjs';

const evidence = resolve(project, 'qa-report/evidence');
await mkdir(evidence, { recursive: true });
const root = await mkdtemp(join(tmpdir(), 'dtm-independent-audit-'));
const consumerRelativePath = relative(project, root);
assert.ok(
  isAbsolute(consumerRelativePath) || consumerRelativePath.startsWith('..'),
  'Consumer must be outside source repository',
);
const env = {
  ...process.env,
  NODE_PATH: '',
  npm_config_cache: artifactDirectory('npm-cache'),
  npm_config_registry: 'https://registry.npmjs.org/',
  npm_config_fetch_timeout: '30000',
  npm_config_fetch_retries: '1',
};
const npm = [
  process.env.npm_execpath,
  resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find((p) => p && existsSync(p) && /npm-cli\.js$/.test(p));
for (const key of Object.keys(env)) if (/^npm_config_(package|call)$/i.test(key)) delete env[key];
assert.ok(npm, 'Run via npm run qa:audit so npm_execpath is available');
const commands = [],
  checks = [],
  observations = {},
  benchmarks = [];
function execute(file, args, { cwd = root, expected = 0, blocked = false } = {}) {
  const r = spawnSync(
    process.execPath,
    [
      ...(blocked ? ['--require', join(project, 'tests/fixtures/deny-network.cjs')] : []),
      file,
      ...args,
    ],
    { cwd, env, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 },
  );
  commands.push({
    file,
    args,
    cwd,
    exitCode: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    error: r.error?.message,
  });
  if (expected !== null)
    assert.equal(r.status, expected, `${args.join(' ')}: ${r.stderr || r.stdout || r.error}`);
  return r;
}
async function check(name, action) {
  const start = performance.now();
  try {
    await action();
    checks.push({ name, passed: true, milliseconds: performance.now() - start });
  } catch (error) {
    checks.push({
      name,
      passed: false,
      error: String(error.stack ?? error),
      milliseconds: performance.now() - start,
    });
  }
  await writeFile(
    join(evidence, `audit-${process.version}.json`),
    JSON.stringify({ node: process.version, checks, observations, benchmarks }, null, 2),
  );
}
const metadata = JSON.parse(execute(npm, ['view', 'domo-time-machine@latest', '--json']).stdout);
await writeFile(join(evidence, 'registry.json'), JSON.stringify(metadata, null, 2));
const version = metadata.version;
await writeFile(
  join(root, 'package.json'),
  JSON.stringify({ name: 'independent-audit-consumer', private: true, type: 'module' }),
);
await check(
  'default latest installation, exact version, uninstall and reinstall from registry tarball',
  async () => {
    execute(npm, ['install', '--no-fund', '--no-audit', 'domo-time-machine']);
    assert.equal(
      JSON.parse(await readFile(join(root, 'node_modules/domo-time-machine/package.json'))).version,
      version,
    );
    execute(npm, ['uninstall', 'domo-time-machine', '--no-audit', '--no-fund']);
    assert.ok(!existsSync(join(root, 'node_modules/domo-time-machine')));
    execute(npm, ['install', '--no-audit', '--no-fund', `domo-time-machine@${version}`]);
    const dry = JSON.parse(
      execute(npm, [
        'pack',
        `domo-time-machine@${version}`,
        '--dry-run',
        '--json',
        '--ignore-scripts',
      ]).stdout,
    )[0];
    await writeFile(join(evidence, 'published-pack-dry-run.json'), JSON.stringify(dry, null, 2));
    const packed = JSON.parse(
      execute(npm, [
        'pack',
        `domo-time-machine@${version}`,
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        root,
      ]).stdout,
    )[0];
    assert.equal(packed.integrity, metadata.dist.integrity);
    await copyFile(join(root, packed.filename), join(evidence, `published-${packed.filename}`));
    execute(npm, ['uninstall', 'domo-time-machine', '--no-audit', '--no-fund']);
    execute(npm, ['install', '--offline', '--no-audit', '--no-fund', join(root, packed.filename)]);
    execute(npm, ['ls', '--all', '--json']);
    assert.equal(
      execute(npm, ['exec', '--offline', '--', 'domo-time-machine', '--version']).stdout.trim(),
      version,
    );
    assert.match(
      execute(join(dirname(npm), 'npx-cli.js'), ['--offline', 'domo-time-machine', '--help'])
        .stdout,
      /capture/,
    );
  },
);
const installed = join(root, 'node_modules/domo-time-machine');
const sdk = await import(pathToFileURL(join(installed, 'dist/index.js')).href);
const { Workspace, compare, schemaHistory, replay, canonical, validateRow } = sdk;
const cli = join(installed, 'dist/cli/index.js');
const command = (args, expected = 0) => execute(cli, args, { blocked: true, expected });
await copyFile(join(project, 'scripts/qa-child.mjs'), join(root, 'capture-child.mjs'));
function child(workspace, file, name, fault = '', uuid = '') {
  const c = fork(join(root, 'capture-child.mjs'), [workspace, file, name], {
    cwd: root,
    env: { ...env, DTM_TEST_FAULT: fault, DTM_TEST_UUID: uuid },
    execPath: process.execPath,
    execArgv: [
      '--require',
      join(project, 'tests/fixtures/deny-network.cjs'),
      '--require',
      join(project, 'tests/fixtures/capture-fault.cjs'),
    ],
    silent: true,
  });
  let stdout = '',
    stderr = '';
  c.stdout.on('data', (b) => (stdout += b));
  c.stderr.on('data', (b) => (stderr += b));
  c.done = new Promise((resolve, reject) => {
    c.once('error', reject);
    c.once('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  return c;
}
const helpCommands = [
  [],
  ['capture'],
  ['snapshots'],
  ['snapshots', 'list'],
  ['snapshots', 'inspect'],
  ['diff'],
  ['investigate'],
  ['replay'],
  ['capsule'],
  ['capsule', 'create'],
  ['capsule', 'inspect'],
  ['capsule', 'replay'],
  ['capsule', 'regression'],
  ['doctor'],
  ['schema'],
  ['schema', 'history'],
  ['schema', 'compare'],
  ['validate'],
  ['init'],
];
await check('every discovered command has help; malformed CLI exits 2 with diagnostics', () => {
  for (const args of helpCommands) assert.match(command([...args, '--help']).stdout, /Usage:/);
  for (const args of [
    ['unknown'],
    ['--json'],
    ['capture'],
    ['capture', 'missing.json'],
    ['diff', 'x'],
    ['validate', 'x'],
    ['capsule', 'regression', 'x'],
    ['init', '--format', 'xml'],
    ['replay', 'missing.yaml'],
    ['schema', 'compare', 'missing', 'other'],
  ]) {
    const r = command(args, 2);
    assert.ok(r.stderr.length > 0);
    assert.equal(r.stdout, '');
  }
});
await check(
  'five versions preserve the independent Alice/Bob/Charlie oracle and original bytes',
  async () => {
    const ws = new Workspace(join(root, 'history'));
    const versions = [
      [
        { id: 'Alice', amount: '100' },
        { id: 'Bob', amount: '200' },
        { id: 'Charlie', amount: '300' },
      ],
      [
        { id: 'Alice', amount: '150' },
        { id: 'Charlie', amount: '300' },
        { id: 'Diana', amount: '400' },
      ],
      [
        { id: 'Alice', amount: '150', status: null },
        { id: 'Charlie', amount: '300', status: 'ok' },
      ],
      [
        { id: 'Alice', amount: 150, active: true },
        { id: 'é', amount: '9007199254740993', date: '2026-01-01' },
      ],
      [
        { id: 'é', amount: '9007199254740993', date: '2026-01-01' },
        { id: 'Alice', amount: 150, active: true },
      ],
    ];
    const captured = [];
    for (let i = 0; i < versions.length; i++) {
      const file = join(root, `v${i}.json`);
      await writeFile(file, JSON.stringify(versions[i]));
      captured.push(
        await ws.capture(file, {
          name: `v${i}`,
          datasetName: 'history',
          dataCompleteness: 'complete',
          sourceUpdatedAt: `2026-01-0${(i % 2) + 1}T00:00:00Z`,
        }),
      );
    }
    const difference = compare(await ws.get('v0'), await ws.get('v1'), ['id']);
    assert.deepEqual(
      [difference.added, difference.removed, difference.updated, difference.unchanged],
      [1, 1, 1, 1],
    );
    assert.equal(schemaHistory(await ws.list()).length, 5);
    assert.equal(new Set(captured.map((m) => m.id)).size, 5);
    for (let i = 0; i < captured.length; i++) {
      assert.equal(
        canonical((await new Workspace(ws.root).get(captured[i].id)).rows),
        canonical(versions[i]),
      );
      assert.equal(
        await readFile(join(ws.root, 'snapshots', captured[i].id, 'original'), 'utf8'),
        JSON.stringify(versions[i]),
      );
    }
    assert.equal(compare(await ws.get('v3'), await ws.get('v4'), ['id']).unchanged, 2);
    assert.notEqual(captured[3].contentHash, captured[4].contentHash);
    observations.history = { captured, firstDiff: difference };
  },
);
await check(
  'four independent writer processes enforce unique names and preserve readers',
  async () => {
    const ws = new Workspace(join(root, 'concurrent'));
    await ws.init();
    const file = join(root, 'race.json');
    await writeFile(file, '[{"id":1}]');
    const children = ['same', 'same', 'a', 'b'].map((name) => child(ws.root, file, name));
    const results = await Promise.all(children.map((c) => c.done));
    assert.equal(results.filter((r) => r.code === 0).length, 3);
    assert.equal(results.filter((r) => r.code === 2).length, 1);
    assert.equal((await ws.list()).length, 3);
    for (const m of await ws.list()) assert.equal((await ws.get(m.id)).rows.length, 1);
    assert.deepEqual((await ws.doctor()).pendingCaptures, []);
    observations.concurrency = results;
  },
);
await check(
  'killed pre-commit writer leaves no committed partial snapshot; doctor and manual recovery work',
  async () => {
    const ws = new Workspace(join(root, 'crash'));
    await ws.init();
    const file = join(root, 'crash.json');
    await writeFile(file, '[{"id":1}]');
    const baseline = await ws.capture(file, { name: 'baseline' });
    const c = child(ws.root, file, 'interrupted', 'PAUSE');
    const timer = setTimeout(() => c.kill(), 10000);
    try {
      await Promise.race([
        new Promise((resolve) => c.once('message', resolve)),
        c.done.then((r) => {
          throw new Error(`Writer exited before stage: ${JSON.stringify(r)}`);
        }),
      ]);
      for (let i = 0; i < 5; i++) {
        assert.equal((await ws.list()).length, 1);
        assert.equal((await ws.get(baseline.id)).rows.length, 1);
      }
      c.kill();
      await c.done;
    } finally {
      clearTimeout(timer);
      if (c.exitCode === null) c.kill();
    }
    const doctor = await new Workspace(ws.root).doctor();
    assert.equal(doctor.checked, 1);
    assert.equal(doctor.orphans.length, 1);
    assert.equal(doctor.pendingCaptures.length, 1);
    assert.equal(doctor.failures.length, 0);
    await assert.rejects(ws.capture(file, { name: 'interrupted' }), /locked/);
    await ws.capture(file, { name: 'unrelated' });
    // Manual recovery only inside this disposable, verified workspace with no live writer.
    for (const name of doctor.orphans)
      await rm(join(ws.root, 'snapshots', name), { recursive: true });
    for (const name of doctor.pendingCaptures)
      await rm(join(ws.root, 'locks', name), { recursive: true });
    await ws.capture(file, { name: 'interrupted' });
    assert.equal((await ws.list()).length, 3);
    observations.crash = {
      doctorBeforeManualRecovery: doctor,
      doctorAfterManualRecovery: await ws.doctor(),
    };
  },
);
await check(
  'injected disk-full commit failure and UUID collision cannot overwrite historical data',
  async () => {
    const ws = new Workspace(join(root, 'failures'));
    await ws.init();
    const file = join(root, 'failure.json');
    await writeFile(file, '[{"id":1}]');
    const before = await ws.capture(file, { name: 'before' });
    const disk = await child(ws.root, file, 'disk', 'ENOSPC').done;
    assert.equal(disk.code, 2);
    assert.match(disk.stderr, /ENOSPC/);
    const collision = await child(ws.root, file, 'collision', '', before.id).done;
    assert.equal(collision.code, 2);
    assert.equal((await ws.list()).length, 1);
    assert.equal((await ws.get(before.id)).metadata.contentHash, before.contentHash);
    assert.deepEqual(await ws.doctor(), {
      checked: 1,
      failures: [],
      orphans: [],
      pendingCaptures: [],
    });
    await ws.capture(file, { name: 'disk' });
    observations.injectedFailures = { disk, collision };
  },
);
await check(
  'corrupt metadata is diagnosed and unrelated snapshots remain readable by UUID',
  async () => {
    const ws = new Workspace(join(root, 'corrupt'));
    const file = join(root, 'corrupt.json');
    await writeFile(file, '[{"id":1}]');
    const a = await ws.capture(file, { name: 'a' }),
      b = await ws.capture(file, { name: 'b' });
    await writeFile(join(ws.root, 'snapshots', a.id, 'metadata.json'), '{invalid');
    assert.equal((await ws.get(b.id)).rows.length, 1);
    assert.deepEqual((await ws.doctor()).failures, [a.id]);
    await assert.rejects(ws.list());
    await assert.rejects(ws.get('b'));
    observations.corruption = {
      affectedId: a.id,
      preservedId: b.id,
      limitation:
        'Name-based reads and new captures fail closed when any committed metadata is corrupt; UUID read remains available.',
    };
  },
);
await check(
  'malicious input, oversize source and failed capture preserve safe snapshots',
  async () => {
    const ws = new Workspace(join(root, 'malicious'));
    await ws.init();
    const invalid = [
      '[{"__proto__":{"polluted":true}}]',
      '[{"constructor":"bad"}]',
      '[{"x":{"nested":1}}]',
      '[{"x":9007199254740992}]',
      '[{"' + 'x'.repeat(257) + '":1}]',
    ];
    for (let i = 0; i < invalid.length; i++) {
      const file = join(root, `bad${i}.json`);
      await writeFile(file, invalid[i]);
      await assert.rejects(ws.capture(file, { name: `bad${i}` }));
    }
    assert.equal({}.polluted, undefined);
    const file = join(root, 'oversize.json');
    const { open } = await import('node:fs/promises');
    const handle = await open(file, 'w');
    await handle.truncate(64 * 1024 * 1024 + 1);
    await handle.close();
    await assert.rejects(ws.capture(file, { name: 'large' }), /64 MiB/);
    for (const ref of ['../../escape', 'C:\\escape', '$(whoami); & Ω'])
      await assert.rejects(ws.get(ref));
    const valid = join(root, 'safe.json');
    await writeFile(
      valid,
      '[{"id":"$(whoami); & Ω","empty":"","null":null,"zero":0,"bool":false}]',
    );
    await ws.capture(valid, { name: '../../literal-name; Ω' });
    assert.equal((await ws.get('../../literal-name; Ω')).rows[0].zero, 0);
    assert.equal((await ws.list()).length, 1);
    assert.equal((await ws.doctor()).orphans.length, 0);
    assert.throws(() => validateRow({ x: Infinity }));
  },
);
await check(
  'installed runtime exports, package entrypoints and CJS dynamic import are usable',
  async () => {
    observations.exports = Object.keys(sdk).sort();
    await writeFile(
      join(root, 'consumer.cjs'),
      "import('domo-time-machine').then(m=>{if(typeof m.Workspace!=='function')process.exitCode=1;console.log(m.VERSION)})",
    );
    assert.equal(execute(join(root, 'consumer.cjs'), [], { blocked: true }).stdout.trim(), version);
    const files = [];
    async function walk(dir, prefix = '') {
      for (const item of await readdir(dir, { withFileTypes: true })) {
        const name = prefix + item.name;
        if (item.isDirectory()) await walk(join(dir, item.name), name + '/');
        else files.push(name);
      }
    }
    await walk(installed);
    assert.ok(files.includes('dist/index.d.ts'));
    assert.ok(files.includes('LICENSE'));
    assert.ok(files.includes('README.md'));
    assert.ok(
      !files.some((f) => /(^|\/)(node_modules|\.artifacts|qa-report|\.env)(\/|$)|\.map$/.test(f)),
    );
    observations.installedFiles = files;
    observations.publishedReadme = await readFile(join(installed, 'README.md'), 'utf8');
  },
);
await check(
  'remaining documented CLI options produce parseable reports and enforce limits',
  async () => {
    const before = join(root, 'v0.json'),
      after = join(root, 'v1.json');
    command([
      'capture',
      before,
      '--name',
      'cli-before',
      '--dataset',
      'cli-history',
      '--key',
      'id',
      '--completeness',
      'complete',
    ]);
    command([
      'capture',
      after,
      '--name',
      'cli-after',
      '--dataset',
      'cli-history',
      '--completeness',
      'sample',
    ]);
    const count = JSON.parse(command(['snapshots', 'list']).stdout).length;
    assert.equal(
      JSON.parse(command(['capture', before, '--name', 'dry', '--dry-run']).stdout).dryRun,
      true,
    );
    assert.equal(JSON.parse(command(['snapshots', 'list']).stdout).length, count);
    const d = JSON.parse(
      command(
        [
          'diff',
          'cli-before',
          'cli-after',
          '--key',
          'id',
          '--after-key',
          'id',
          '--out',
          'cli-diff.json',
          '--fail-on-change',
        ],
        1,
      ).stdout,
    );
    assert.equal(d.updated, 1);
    const metricFile = join(root, 'metrics.json');
    await writeFile(metricFile, '[{"name":"count","aggregation":"count"}]');
    assert.equal(
      JSON.parse(
        command([
          'investigate',
          'cli-before',
          'cli-after',
          '--key',
          'id',
          '--metrics',
          metricFile,
          '--out',
          'cli-investigation.json',
        ]).stdout,
      ).metrics[0].absoluteChange,
      '0',
    );
    const spec = {
      version: 1,
      name: 'cli',
      inputs: { data: 'cli-before' },
      steps: [{ id: 'out', input: 'data', operation: 'select', columns: ['id'] }],
      output: 'out',
    };
    const specFile = join(root, 'cli-scenario.json');
    await writeFile(specFile, JSON.stringify(spec));
    assert.equal(
      JSON.parse(command(['replay', specFile, '--out', 'cli-replay.json']).stdout).rows.length,
      3,
    );
    assert.equal(
      JSON.parse(command(['schema', 'history', '--dataset', 'cli-history']).stdout).length,
      2,
    );
    command(['capture', before, '--name', 'invalid-completeness', '--completeness', 'invalid'], 2);
    assert.match(
      command(['--format', 'text', 'snapshots', 'inspect', 'cli-before']).stdout,
      /integrity/,
    );
  },
);
await check('published README release status matches the verified npm release', () => {
  assert.ok(
    !observations.publishedReadme.includes(version + ' patch candidate'),
    'Published README still calls the installed release a patch candidate',
  );
});
await check('published README booking fixture command works verbatim after npm install', () => {
  command(['capture', 'examples/booking-reconciliation/bookings.csv', '--name', 'readme-bookings']);
});
await check(
  'performance captures, warm reads, changed keyed diffs and replay scale to supported row limit',
  async () => {
    async function bytes(dir) {
      let n = 0;
      for (const item of await readdir(dir, { withFileTypes: true }))
        n += item.isDirectory()
          ? await bytes(join(dir, item.name))
          : (await stat(join(dir, item.name))).size;
      return n;
    }
    for (const rows of [100, 1000, 10000, 100000]) {
      for (let repetition = 0; repetition < 3; repetition++) {
        const dir = join(root, `bench-${rows}-${repetition}`);
        await mkdir(dir);
        const file = join(dir, 'rows.ndjson');
        const data = Array.from({ length: rows }, (_, i) => ({ id: String(i), amount: '0.10' }));
        await writeFile(file, data.map((r) => JSON.stringify(r)).join('\n'));
        const ws = new Workspace(join(dir, 'store'));
        const cpu = process.cpuUsage();
        const start = performance.now();
        const m = await ws.capture(file, { name: 'bench', dataCompleteness: 'complete' });
        const captured = performance.now();
        const a = await ws.get(m.id);
        const retrieved = performance.now();
        await ws.get(m.id);
        const warm = performance.now();
        const changedRows = a.rows.map((r, i) => (i === 0 ? { ...r, amount: '0.20' } : r));
        const b = {
          rows: changedRows,
          metadata: { ...a.metadata, schema: sdk.schemaOf(changedRows) },
        };
        const diffStart = performance.now();
        const d = compare(a, b, ['id']);
        const diffEnd = performance.now();
        assert.equal(d.updated, 1);
        assert.equal(d.unchanged, rows - 1);
        const run = replay(
          {
            version: 1,
            name: 'bench',
            inputs: { data: 'bench' },
            steps: [
              {
                id: 'out',
                input: 'data',
                operation: 'aggregate',
                groupBy: [],
                measures: [{ column: 'amount', operation: 'sum', as: 'total' }],
              },
            ],
            output: 'out',
            assertions: [
              { table: 'out', column: 'total', aggregation: 'sum', equals: String(rows / 10) },
            ],
          },
          { data: a.rows },
        );
        const replayEnd = performance.now();
        assert.equal(run.passed, true);
        benchmarks.push({
          rows,
          repetition,
          captureMs: captured - start,
          firstReadMs: retrieved - captured,
          warmReadMs: warm - retrieved,
          diffMs: diffEnd - diffStart,
          replayMs: replayEnd - diffEnd,
          cpuMicroseconds: process.cpuUsage(cpu),
          endMemory: process.memoryUsage(),
          processLifetimeMaxRssKiB: process.resourceUsage().maxRSS,
          sourceBytes: (await stat(file)).size,
          storageBytes: await bytes(ws.root),
        });
        await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    }
  },
);
observations.limitations = [
  'Three repetitions per size; descriptive median and nearest-rank p95 (maximum of three), not a production tail estimate.',
  'First read follows capture and is not an OS cold-cache measurement.',
  'RSS/heap sampled after each workflow; maxRSS is lifetime high-water mark, not per-operation attribution.',
  '1,000,000 rows unsupported by 100,000-row limit.',
  'No live Domo, Linux/macOS execution or power-loss simulation.',
];
const report = {
  createdAt: new Date().toISOString(),
  package: `domo-time-machine@${version}`,
  registryIntegrity: metadata.dist.integrity,
  node: process.version,
  platform: process.platform,
  osRelease: release(),
  cpu: cpus()[0]?.model,
  architecture: process.arch,
  independentDirectory: root,
  checks,
  passed: checks.filter((c) => c.passed).length,
  failed: checks.filter((c) => !c.passed).length,
  observations,
  benchmarks,
};
await writeFile(join(evidence, `audit-${process.version}.json`), JSON.stringify(report, null, 2));
await writeFile(
  join(evidence, `commands-${process.version}.json`),
  JSON.stringify(commands, null, 2),
);
console.log(
  JSON.stringify(
    {
      package: report.package,
      passed: report.passed,
      failed: report.failed,
      failures: checks.filter((c) => !c.passed),
      evidence,
    },
    null,
    2,
  ),
);
if (!report.failed)
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
process.exitCode = report.failed ? 1 : 0;
