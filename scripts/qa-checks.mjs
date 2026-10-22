import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactDirectory, project } from './artifacts.mjs';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run via npm run qa:checks');
const out = join(project, 'qa-report/evidence');
await mkdir(out, { recursive: true });
const cases = [
  ['typecheck', ['run', 'typecheck']],
  ['lint', ['run', 'lint']],
  ['format', ['run', 'format:check']],
  ['build', ['run', 'build']],
  ['audit-production', ['audit', '--omit=dev', '--json']],
  ['audit-all', ['audit', '--json']],
  ['dependency-tree', ['ls', '--all', '--json']],
  ['published-e2e', ['run', 'test:e2e:published']],
  ['package-smoke', ['run', 'test:package']],
  ['local-e2e', ['run', 'test:e2e']],
];
const only = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice(7)
  .split(',');
const results = only ? JSON.parse(await readFile(join(out, 'quality-gates.json'), 'utf8')) : [];
for (const [name, args] of cases.filter(([name]) => !only || only.includes(name))) {
  const start = Date.now();
  const r = spawnSync(process.execPath, [npm, ...args], {
    cwd: project,
    env: { ...process.env, npm_config_cache: artifactDirectory('npm-cache') },
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const item = {
    name,
    command: ['node', npm, ...args],
    node: process.version,
    exitCode: r.status,
    milliseconds: Date.now() - start,
    stdout: r.stdout,
    stderr: r.stderr,
    error: r.error?.message,
  };
  const existing = results.findIndex((r) => r.name === name);
  if (existing >= 0) results[existing] = item;
  else results.push(item);
  await writeFile(join(out, `${name}.json`), JSON.stringify(item, null, 2));
  console.log(`${name}: ${r.status === 0 ? 'PASS' : 'FAIL'}`);
}
for (const mode of ['published', 'local']) {
  const name = `user-e2e-${mode}-${process.version}.json`;
  try {
    await writeFile(join(out, name), await readFile(join(artifactDirectory('reports'), name)));
  } catch {
    /* Missing artifact is reported by its failed command above. */
  }
}
await writeFile(
  join(out, 'quality-gates.json'),
  JSON.stringify(
    results.map(({ stdout: _out, stderr: _err, ...r }) => r),
    null,
    2,
  ),
);
process.exitCode = results.some((r) => r.exitCode !== 0) ? 1 : 0;
