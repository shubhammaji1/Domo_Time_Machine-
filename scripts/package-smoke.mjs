import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactDirectory } from './artifacts.mjs';
const project = fileURLToPath(new URL('../', import.meta.url));
const packDirectory = artifactDirectory('packages');
const temporary = artifactDirectory('tmp');
const cache = artifactDirectory('npm-cache');
const childEnvironment = {
  ...process.env,
  npm_config_cache: cache,
  TEMP: temporary,
  TMP: temporary,
};
const candidates = [
  process.env.npm_execpath,
  resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
];
for (const key of Object.keys(childEnvironment))
  if (/^npm_config_(package|call)$/i.test(key)) delete childEnvironment[key];
const npmCli = candidates.find((p) => p && /npm-cli\.js$/.test(p) && existsSync(p));
if (!npmCli) throw new Error('Cannot locate npm CLI');
function run(file, args, cwd = project) {
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
    env: childEnvironment,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || result.error?.message || result.stdout || 'Command failed');
  return result.stdout;
}
const pack = JSON.parse(run(npmCli, ['pack', '--json']))[0];
for (const required of ['dist/cli/index.js', 'dist/index.js', 'dist/index.d.ts'])
  if (!pack.files.some((f) => f.path === required))
    throw new Error('Required entry missing: ' + required);
if (
  pack.files.some((f) =>
    /(?:\.artifacts|\.sqlite|\.db$|original|rows\.ndjson|\.demo-workspace|node_modules|studio|apps\/|server\/|\.tsx$)/.test(
      f.path,
    ),
  )
)
  throw new Error('Unexpected evidence, database, frontend or server in tarball');
const clean = await mkdtemp(join(temporary, 'install-'));
let summary;
try {
  await writeFile(
    join(clean, 'package.json'),
    JSON.stringify({ name: 'fresh-install-smoke', private: true, type: 'module' }),
  );
  run(
    npmCli,
    [
      'install',
      '--prefer-offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(packDirectory, pack.filename),
    ],
    clean,
  );
  const installed = join(clean, 'node_modules/domo-time-machine');
  const pkg = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  if (
    pkg.workspaces ||
    pkg.optionalDependencies ||
    Object.keys(pkg.dependencies).some((n) => /react|fastify|duckdb|sqlite|next/.test(n))
  )
    throw new Error('Forbidden architecture dependency');
  const help = run(npmCli, ['exec', '--offline', '--', 'domo-time-machine', '--help'], clean);
  if (!help.includes('capture') || /studio|server/.test(help))
    throw new Error('npx-style executable contract failed');
  const deny = join(project, 'tests/fixtures/deny-network.cjs');
  const cli = join(installed, 'dist/cli/index.js');
  const command = (args) => run(cli, args, clean);
  command(['init']);
  command([
    'capture',
    join(project, 'examples/booking-reconciliation/bookings.csv'),
    '--name',
    'bookings',
  ]);
  command([
    'capture',
    join(project, 'examples/booking-reconciliation/tickets.ndjson'),
    '--name',
    'tickets',
  ]);
  command(['validate', 'bookings', '--column', 'Fare', '--currency', 'INR', '--expected', '8000']);
  const execution = JSON.parse(
    command(['replay', join(project, 'examples/booking-reconciliation/faulty.yaml')]),
  );
  if (execution.rows.length !== 3 || !execution.passed) throw new Error('Installed replay failed');
  command(['schema', 'history']);
  command(['doctor']);
  const consumer = `import { Workspace, compare, compareSchemas, schemaHistory, validateFinancial, investigate, replay, makeCapsule, replayCapsule, type Snapshot, type CaptureOptions, type FinancialRule, type Scenario, type DomoReadOnlySource } from 'domo-time-machine';
const options: CaptureOptions = { name: 'sdk', datasetName: 'bookings' };
const store = new Workspace('./sdk-evidence');
await store.capture(${JSON.stringify(join(project, 'examples/booking-reconciliation/bookings.csv'))}, options);
const snapshot: Snapshot = await store.get('sdk');
const rule: FinancialRule = { column: 'Fare', currency: 'INR', expected: '8000' };
if (!validateFinancial(snapshot.rows, rule).passed) throw new Error('SDK validation');
if (compare(snapshot, snapshot, ['Booking_ID']).unchanged !== 2) throw new Error('SDK diff');
if (compareSchemas(snapshot.metadata.schema, snapshot.metadata.schema).length) throw new Error('SDK schema');
if (schemaHistory(await store.list()).length !== 1) throw new Error('SDK history');
if (investigate(snapshot,snapshot,['Booking_ID'],[{name:'fare',column:'Fare',aggregation:'sum'}]).metrics[0]?.absoluteChange !== '0') throw new Error('SDK investigation');
const scenario: Scenario = {version:1,name:'total',inputs:{bookings:'sdk'},steps:[{id:'out',input:'bookings',operation:'aggregate',groupBy:[],measures:[{column:'Fare',operation:'sum',as:'total'}]}],output:'out'};
const inputs = {bookings:snapshot.rows};
if (replay(scenario,inputs).rows[0]?.total !== '8000') throw new Error('SDK replay');
if (replayCapsule(makeCapsule(scenario, inputs, {mode:'synthetic',reviewed:true})).rows[0]?.total !== '8000') throw new Error('SDK capsule');
type FutureReads = keyof DomoReadOnlySource;
const read: FutureReads = 'exportCsv';
console.log('Installed TypeScript SDK offline workflow passed', read);
`;
  await writeFile(join(clean, 'consumer.mts'), consumer);
  run(
    join(project, 'node_modules/typescript/bin/tsc'),
    [
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--skipLibCheck',
      'consumer.mts',
    ],
    clean,
  );
  run(join(clean, 'consumer.mjs'), [], clean); // also exercised below with networking denied
  const blocked = spawnSync(process.execPath, ['--require', deny, cli, 'snapshots', 'list'], {
    cwd: clean,
    encoding: 'utf8',
    env: childEnvironment,
  });
  if (blocked.status !== 0) throw new Error('Offline CLI workflow failed');
  // Separate fresh path because captures are immutable and names are unique.
  const blockedDir = join(clean, 'offline-sdk');
  await import('node:fs/promises').then((fs) => fs.mkdir(blockedDir));
  const blockedSdk = spawnSync(process.execPath, ['--require', deny, join(clean, 'consumer.mjs')], {
    cwd: blockedDir,
    encoding: 'utf8',
    env: childEnvironment,
  });
  if (blockedSdk.status !== 0) throw new Error(blockedSdk.stderr || 'Offline SDK workflow failed');
  const cjs = spawnSync(
    process.execPath,
    [
      '--eval',
      "import('domo-time-machine').then(m=>{if(typeof m.Workspace!=='function')process.exit(1)})",
    ],
    { cwd: clean, encoding: 'utf8', env: childEnvironment },
  );
  if (cjs.status !== 0) throw new Error('CommonJS dynamic import failed');
  summary = {
    tarball: join('.artifacts', 'packages', pack.filename),
    files: pack.files.length,
    unpackedBytes: pack.unpackedSize,
    cleanInstall: true,
    npxStyleInvocation: true,
    typescriptConsumer: true,
    offlineSdkAndCli: true,
  };
} finally {
  await rm(clean, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
console.log(JSON.stringify(summary));
