import { rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { artifactDirectory, project } from './artifacts.mjs';
artifactDirectory('packages');
const root = resolve(project),
  target = resolve(root, 'dist');
if (!target.startsWith(root + sep)) throw new Error('Unsafe build output');
rmSync(target, { recursive: true, force: true });
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc'], {
  stdio: 'inherit',
  cwd: root,
});
process.exitCode = result.status ?? 1;
