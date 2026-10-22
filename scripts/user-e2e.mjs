import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { artifactDirectory, project } from './artifacts.mjs';

const published = process.argv.includes('--published');
const pkg = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
const mode = published ? 'published' : 'local';
// Keep the consumer outside the repository so ancestor dependencies cannot mask packaging bugs.
const root = await mkdtemp(join(tmpdir(), `dtm independent ${mode} Ω `));
const cache = published ? join(root, 'cold-npm-cache') : artifactDirectory('npm-cache');
await mkdir(cache, { recursive: true });
const env = {
  ...process.env,
  npm_config_cache: cache,
  TEMP: root,
  TMP: root,
  NODE_PATH: '',
  npm_config_registry: 'https://registry.npmjs.org/',
  npm_config_fetch_timeout: '30000',
  npm_config_fetch_retries: '1',
};
// npm exec --package=node@... passes its own package selector to descendants.
// It must not change what the nested consumer npm exec resolves.
for (const key of Object.keys(env)) if (/^npm_config_(package|call)$/i.test(key)) delete env[key];
const candidates = [
  process.env.npm_execpath,
  resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
];
const npm = candidates.find((p) => p && /npm-cli\.js$/.test(p) && existsSync(p));
assert.ok(npm, 'npm CLI not found');
const checks = [];
let metadata;
let testedVersion = pkg.version;
async function check(name, action) {
  const start = Date.now();
  try {
    await action();
    checks.push({ name, passed: true, durationMs: Date.now() - start });
  } catch (error) {
    checks.push({
      name,
      passed: false,
      durationMs: Date.now() - start,
      error: String(error.stack ?? error).slice(0, 4000),
    });
  }
}
function execute(file, args, { cwd = root, expected = 0, blocked = false } = {}) {
  const preload = blocked ? ['--require', join(project, 'tests/fixtures/deny-network.cjs')] : [];
  const result = spawnSync(process.execPath, [...preload, file, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (expected !== null)
    assert.equal(
      result.status,
      expected,
      `${args.join(' ')}: ${result.stderr || result.stdout || result.error}`,
    );
  return result;
}
await writeFile(
  join(root, 'package.json'),
  JSON.stringify({ name: 'independent-user-consumer', private: true, type: 'module' }),
);
await check('fresh normal npm installation and executable discovery', async () => {
  let target;
  if (published) {
    metadata = JSON.parse(
      execute(npm, ['view', `${pkg.name}@latest`, 'version', 'dist.integrity', '--json']).stdout,
    );
    testedVersion = metadata.version;
    target = `${pkg.name}@${testedVersion}`;
  } else {
    const packed = JSON.parse(execute(npm, ['pack', '--json'], { cwd: project }).stdout)[0];
    target = join(artifactDirectory('packages'), packed.filename);
  }
  execute(npm, ['install', '--no-audit', '--no-fund', ...(published ? [] : ['--offline']), target]);
  const dependencies = JSON.parse(execute(npm, ['ls', '--omit=dev', '--all', '--json']).stdout);
  assert.equal(dependencies.dependencies[pkg.name].version, testedVersion);
  assert.equal(
    execute(npm, ['exec', '--offline', '--', 'domo-time-machine', '--version']).stdout.trim(),
    testedVersion,
  );
  assert.match(
    execute(npm, ['exec', '--offline', '--', 'domo-time-machine', '--help']).stdout,
    /capture/,
  );
});
const cliPath = join(root, 'node_modules', pkg.name, 'dist/cli/index.js');
const command = (args, expected = 0) => execute(cliPath, args, { expected, blocked: true });
const json = (args, expected = 0) => JSON.parse(command(args, expected).stdout);
const before = [
  { Booking_ID: 'BK101', Fare: '5000.10', Currency: 'INR', Status: 'confirmed' },
  { Booking_ID: 'BK102', Fare: '3000.20', Currency: 'INR', Status: 'confirmed' },
  { Booking_ID: 'BK103', Fare: '1200.00', Currency: 'INR', Status: 'confirmed' },
];
const after = [
  { Booking_ID: 'BK101', Fare: '5500.10', Currency: 'INR', Channel: 'web' },
  { Booking_ID: 'BK102', Fare: '3000.20', Currency: 'INR', Channel: 'agent' },
  { Booking_ID: 'BK104', Fare: '700.25', Currency: 'INR', Channel: 'web' },
];
await writeFile(join(root, 'before.json'), JSON.stringify(before));
await writeFile(join(root, 'after.ndjson'), after.map((r) => JSON.stringify(r)).join('\r\n'));
await check('offline capture, inspect and monetary validation', () => {
  json(['init']);
  assert.equal(
    json([
      'capture',
      'before.json',
      '--name',
      'before',
      '--dataset',
      'bookings',
      '--key',
      'Booking_ID',
      '--completeness',
      'complete',
    ]).rowCount,
    3,
  );
  assert.equal(
    json(['capture', 'after.ndjson', '--name', 'after', '--dataset', 'bookings']).rowCount,
    3,
  );
  assert.equal(json(['snapshots', 'inspect', 'before']).integrity, 'verified');
  assert.equal(
    json(['validate', 'before', '--column', 'Fare', '--currency', 'INR', '--expected', '9200.30'])
      .passed,
    true,
  );
  assert.equal(
    json(['validate', 'after', '--column', 'Fare', '--currency', 'INR', '--expected', '9200.30'], 1)
      .difference,
    '0.25',
  );
});
await check('record diff, schema history, investigation and text reports', () => {
  const d = json(['diff', 'before', 'after', '--key', 'Booking_ID', '--fail-on-change'], 1);
  assert.equal(d.added, 1);
  assert.equal(d.removed, 1);
  assert.equal(d.updated, 2);
  assert.equal(d.evidence.find((e) => e.kind === 'removed').before[0].value.Booking_ID, 'BK103');
  assert.equal(json(['schema', 'compare', 'before', 'after']).length, 2);
  assert.equal(json(['schema', 'history', '--dataset', 'bookings']).length, 2);
  assert.match(
    command(['--format', 'text', 'diff', 'before', 'after', '--key', 'Booking_ID']).stdout,
    /1 added/,
  );
  const report = json([
    'investigate',
    'before',
    'after',
    '--key',
    'Booking_ID',
    '--metric',
    'Fare',
    '--currency',
    'INR',
    '--currency-column',
    'Currency',
  ]);
  assert.equal(report.metrics[0].absoluteChange, '0.25');
});
await check('CSV BOM, quoted newlines, Unicode names and string-preserved keys', async () => {
  await writeFile(
    join(root, 'quoted Ω.csv'),
    '\uFEFFid,Fare,Currency,note\r\n001,0.10,INR,"a,b\nsecond line"\r\n002,0.20,INR,é\r\n',
  );
  json(['capture', 'quoted Ω.csv', '--name', 'csv']);
  const inspected = json(['snapshots', 'inspect', 'csv']);
  assert.equal(inspected.preview[0].id, '001');
  assert.equal(inspected.preview[0].note, 'a,b\nsecond line');
  assert.equal(
    json(['validate', 'csv', '--column', 'Fare', '--currency', 'INR', '--expected', '0.30']).passed,
    true,
  );
});
await check('Windows UTF-8 BOM NDJSON capture', async () => {
  await writeFile(join(root, 'bom.ndjson'), '\uFEFF{"id":"é","value":null}\r\n');
  assert.equal(json(['capture', 'bom.ndjson', '--name', 'bom']).rowCount, 1);
});
let capsule;
await check('booking join replay and reviewed capsule portability', async () => {
  const example = join(root, 'node_modules', pkg.name, 'examples/booking-reconciliation');
  // This is the corrected installed-user README path, relative to the consumer.
  json([
    'capture',
    'node_modules/domo-time-machine/examples/booking-reconciliation/bookings.csv',
    '--name',
    'bookings',
  ]);
  json(['capture', join(example, 'tickets.ndjson'), '--name', 'tickets']);
  const faulty = json(['replay', join(example, 'faulty.yaml')]);
  assert.equal(faulty.steps[0].expansionFactor, '1.5');
  assert.equal(faulty.passed, true);
  const candidate = json(['replay', join(example, 'candidate.yaml')]);
  assert.equal(candidate.passed, true);
  assert.equal(candidate.rows.length, 2);
  const preview = json(['capsule', 'create', join(example, 'candidate.yaml')]);
  assert.match(preview.warning, /review/i);
  json([
    'capsule',
    'create',
    join(example, 'candidate.yaml'),
    '--reviewed',
    '--synthetic',
    '--out',
    'incident.json',
  ]);
  capsule = JSON.parse(await readFile(join(root, 'incident.json'), 'utf8'));
  assert.equal(json(['capsule', 'inspect', 'incident.json']).payload.schemaVersion, 1);
  await mkdir(join(root, 'fresh environment'));
  await writeFile(join(root, 'fresh environment/incident.json'), JSON.stringify(capsule));
  const fresh = JSON.parse(
    execute(cliPath, ['capsule', 'replay', 'incident.json'], {
      cwd: join(root, 'fresh environment'),
      blocked: true,
    }).stdout,
  );
  assert.equal(fresh.outputHash, candidate.outputHash);
});
await check('regression harness exported to a different directory', async () => {
  await mkdir(join(root, 'reports'));
  json(['capsule', 'regression', 'incident.json', '--out', 'reports/regression.mjs']);
  assert.match(
    execute(join(root, 'reports/regression.mjs'), [], { blocked: true }).stdout,
    /Capsule reproduced/,
  );
  await copyFile(join(root, 'incident.json'), join(root, 'incident #50% Ω.json'));
  json(['capsule', 'regression', 'incident #50% Ω.json', '--out', 'reports/regression Ω.mjs']);
  assert.match(
    execute(join(root, 'reports/regression Ω.mjs'), [], { blocked: true }).stdout,
    /Capsule reproduced/,
  );
});
await check('invalid inputs fail safely and cannot overwrite reports or captures', async () => {
  const beforeCount = json(['snapshots', 'list']).length;
  await writeFile(join(root, 'invalid.json'), '[{invalid-secret-marker}]');
  const bad = command(['capture', 'invalid.json', '--name', 'invalid'], 2);
  assert.ok(!bad.stderr.includes('invalid-secret-marker'));
  command(['capture', 'before.json', '--name', 'before'], 2);
  command(['diff', 'before', 'after', '--key', 'unknown-column'], 2);
  assert.equal(json(['snapshots', 'list']).length, beforeCount);
  json(['diff', 'before', 'after', '--out', 'report.json']);
  const original = await readFile(join(root, 'report.json'));
  command(['diff', 'before', 'after', '--out', 'report.json'], 2);
  assert.deepEqual(await readFile(join(root, 'report.json')), original);
  const doctor = json(['doctor']);
  assert.equal(doctor.failures.length, 0);
  assert.equal(doctor.orphans.length, 0);
  assert.equal(doctor.pendingCaptures.length, 0);
});
await check('installed TypeScript declarations compile without ancestor types', async () => {
  await writeFile(
    join(root, 'consumer.mts'),
    `import { Workspace, readCapsule, replay, type CaptureOptions, type FinancialRule, type Scenario } from 'domo-time-machine';\nconst capture: CaptureOptions = {name:'typed'};const financial: FinancialRule = {column:'Fare',currency:'INR',expected:'0'}; const store=new Workspace();void [capture,financial,store,replay,readCapsule];let scenario: Scenario | undefined;void scenario;\n`,
  );
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: ['ES2022', 'DOM'],
        types: [],
        skipLibCheck: false,
        noEmit: true,
      },
      include: ['consumer.mts'],
    }),
  );
  execute(join(project, 'node_modules/typescript/bin/tsc'), ['-p', join(root, 'tsconfig.json')]);
});
await copyFile(join(project, 'tests/fixtures/sdk-consumer.mjs'), join(root, 'sdk-consumer.mjs'));
const probe = execute(join(root, 'sdk-consumer.mjs'), [], { blocked: true, expected: null });
try {
  checks.push(...JSON.parse(probe.stdout));
} catch {
  checks.push({
    name: 'installed SDK consumer',
    passed: false,
    error: probe.stderr || probe.stdout,
  });
}
await check('package version and executable version stay aligned after a patch bump', async () => {
  const file = join(root, 'node_modules', pkg.name, 'package.json');
  const original = await readFile(file, 'utf8');
  try {
    const modified = JSON.parse(original);
    modified.version = '0.1.99-e2e.0';
    await writeFile(file, JSON.stringify(modified));
    assert.equal(command(['--version']).stdout.trim(), modified.version);
  } finally {
    await writeFile(file, original);
  }
});
const report = {
  mode,
  package: `${pkg.name}@${testedVersion}`,
  registryMetadata: metadata,
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  createdAt: new Date().toISOString(),
  workspace: root,
  checks,
  passed: checks.filter((c) => c.passed).length,
  failed: checks.filter((c) => !c.passed).length,
};
const reportFile = join(artifactDirectory('reports'), `user-e2e-${mode}-${process.version}.json`);
await writeFile(reportFile, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      mode,
      passed: report.passed,
      failed: report.failed,
      failures: checks.filter((c) => !c.passed).map((c) => ({ name: c.name, error: c.error })),
      reportFile,
    },
    null,
    2,
  ),
);
if (!report.failed)
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
process.exitCode = report.failed ? 1 : 0;
