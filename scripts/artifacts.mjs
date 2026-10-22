import { mkdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';

export const project = fileURLToPath(new URL('../', import.meta.url));
export function artifactDirectory(category) {
  if (!['tmp', 'packages', 'npm-cache', 'demos', 'legacy-workspaces', 'reports'].includes(category))
    throw new Error('Unknown artifact category');
  const root = resolve(project, '.artifacts');
  const target = resolve(root, category);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe artifact path');
  mkdirSync(root, { recursive: true });
  if (lstatSync(root).isSymbolicLink()) throw new Error('Artifact directory cannot be a symlink');
  mkdirSync(target, { recursive: true });
  if (lstatSync(target).isSymbolicLink()) throw new Error('Artifact category cannot be a symlink');
  return target;
}
