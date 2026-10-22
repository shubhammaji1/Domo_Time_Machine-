import { lstatSync, existsSync, rmSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { project } from './artifacts.mjs';

// Deliberately exclude dependency caches, saved demos and archived workspaces.
for (const name of ['dist', '.artifacts/tmp', '.artifacts/packages']) {
  const target = resolve(project, name),
    rel = relative(project, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe cleanup path');
  if (existsSync(target)) {
    const parent = resolve(target, '..');
    if (lstatSync(parent).isSymbolicLink() || lstatSync(target).isSymbolicLink())
      throw new Error('Cleanup refuses symlinks');
    rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
console.log(
  'Removed build output, temporary test files and generated package archives. Saved demos and caches retained.',
);
