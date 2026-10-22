import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { project, artifactDirectory } from './artifacts.mjs';
const evidence = join(project, 'qa-report/evidence');
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'pack', '--json'], {
  cwd: project,
  env: process.env,
  encoding: 'utf8',
  timeout: 120000,
});
await writeFile(
  join(evidence, 'local-pack-command.json'),
  JSON.stringify({ status: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2),
);
assert.equal(result.status, 0);
const pack = JSON.parse(result.stdout)[0];
await writeFile(join(evidence, 'local-pack.json'), JSON.stringify(pack, null, 2));
const metadata = JSON.parse(await readFile(join(evidence, 'registry.json')));
function unpack(buffer) {
  const data = gunzipSync(buffer),
    entries = new Map();
  for (let offset = 0; offset + 512 <= data.length;) {
    const header = data.subarray(offset, offset + 512);
    const string = (from, length) =>
      header
        .subarray(from, from + length)
        .toString()
        .split('\0')[0];
    const name = string(0, 100);
    if (!name) break;
    const size = parseInt(string(124, 12).trim(), 8) || 0;
    entries.set(name.replace(/^package\//, ''), {
      bytes: data.subarray(offset + 512, offset + 512 + size),
      mode: string(100, 8),
      type: string(156, 1),
    });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const published = unpack(
  await readFile(join(evidence, `published-domo-time-machine-${metadata.version}.tgz`)),
);
const local = unpack(await readFile(join(artifactDirectory('packages'), pack.filename)));
const differences = [];
for (const name of new Set([...published.keys(), ...local.keys()])) {
  const a = published.get(name),
    b = local.get(name);
  if (!a || !b || sha(a.bytes) !== sha(b.bytes))
    differences.push({
      name,
      publishedHash: a ? sha(a.bytes) : null,
      localHash: b ? sha(b.bytes) : null,
    });
}
const dist = [...local.keys()].filter((name) => name.startsWith('dist/'));
for (const name of dist)
  assert.equal(
    sha(local.get(name).bytes),
    sha(await readFile(join(project, name))),
    `Stale local tarball: ${name}`,
  );
const runtimeDifferences = differences.filter((d) => d.name.startsWith('dist/'));
assert.deepEqual(
  runtimeDifferences,
  [],
  'Runtime differs between current source build and published release; review required',
);
for (const entries of [published, local]) {
  for (const required of [
    'package.json',
    'README.md',
    'LICENSE',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/cli/index.js',
  ])
    assert.ok(entries.has(required));
  assert.ok(entries.get('dist/cli/index.js').bytes.toString().startsWith('#!/usr/bin/env node'));
  // Windows npm tarballs can store 0644. npm's bin-links installation code
  // applies executable mode on POSIX; do not infer a failed Linux install here.
  assert.ok(parseInt(entries.get('dist/cli/index.js').mode, 8) & 0o400);
  assert.ok(
    ![...entries.keys()].some((name) =>
      /(^|\/)(\.env|node_modules|qa-report|\.artifacts)(\/|$)|\.map$|\.sqlite$/.test(name),
    ),
  );
}
const sourceHashes = {};
async function walk(dir) {
  for (const entry of await readdir(join(project, dir), { withFileTypes: true })) {
    const path = dir + '/' + entry.name;
    if (entry.isDirectory()) await walk(path);
    else sourceHashes[path] = sha(await readFile(join(project, path)));
  }
}
await walk('src');
const report = {
  createdAt: new Date().toISOString(),
  publishedVersion: metadata.version,
  localVersion: JSON.parse(local.get('package.json').bytes).version,
  publishedIntegrity: metadata.dist.integrity,
  localIntegrity: pack.integrity,
  publishedFileCount: published.size,
  localFileCount: local.size,
  compiledFilesVerified: dist.length,
  runtimeDifferences,
  differences,
  sourceHashes,
  publishedCliMode: published.get('dist/cli/index.js').mode,
  localCliMode: local.get('dist/cli/index.js').mode,
  note: 'Compressed archives differ because development scripts/dependencies and documentation changed locally. All runtime JS and declarations match the published release byte for byte. Registry signatures present; signature and provenance cryptographic verification not performed.',
};
await writeFile(join(evidence, 'artifact-comparison.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
