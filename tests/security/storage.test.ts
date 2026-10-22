import { it, expect } from 'vitest';
import {
  mkdtemp,
  rm,
  writeFile,
  readdir,
  mkdir,
  readFile,
  rename,
  symlink,
} from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Workspace, digest } from '../../src/index.js';
it('commits only one of concurrent same-name captures and uses no database', async () => {
  const root = await mkdtemp(resolve('.artifacts/tmp/.demo-workspace-race-'));
  const ws = new Workspace(root);
  const source = join(root, 'input.json');
  try {
    await writeFile(source, '[{"id":1}]');
    const results = await Promise.allSettled([
      ws.capture(source, { name: 'same' }),
      new Workspace(root).capture(source, { name: 'same' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await ws.list()).toHaveLength(1);
    expect((await readdir(root)).some((n) => /sqlite|\.db$/.test(n))).toBe(false);
    expect((await ws.doctor()).pendingCaptures).toEqual([]);
    await mkdir(join(root, 'snapshots', '.incomplete.tmp'));
    await mkdir(join(root, 'locks', digest('stale') + '.lock'));
    expect(await ws.doctor()).toMatchObject({
      orphans: ['.incomplete.tmp'],
      pendingCaptures: [digest('stale') + '.lock'],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('refuses a replaced snapshot directory junction and preserves legacy storage', async () => {
  const root = await mkdtemp(resolve('.artifacts/tmp/.demo-workspace-links-'));
  const ws = new Workspace(root);
  try {
    const source = join(root, 'input.json');
    await writeFile(source, '[{"id":1}]');
    const m = await ws.capture(source, { name: 'before' });
    const snapshotDir = join(root, 'snapshots', m.id),
      moved = join(root, 'moved');
    await rename(snapshotDir, moved);
    await symlink(moved, snapshotDir, 'junction');
    await expect(ws.get(m.id)).rejects.toThrow('directory');
    const legacy = join(root, 'legacy');
    await mkdir(legacy);
    await writeFile(join(legacy, 'metadata.sqlite'), 'retained');
    await expect(new Workspace(legacy).init()).rejects.toThrow('Legacy workspace');
    expect(await readdir(legacy)).toEqual(['metadata.sqlite']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('rejects metadata tampering and traversal while preserving exact originals', async () => {
  const root = await mkdtemp(resolve('.artifacts/tmp/.demo-workspace-security-'));
  const ws = new Workspace(root);
  const source = join(root, 'input.json');
  try {
    const original = '[{"secret":"private","id":1}]';
    await writeFile(source, original);
    const m = await ws.capture(source, { name: 'protected' });
    const file = join(root, 'snapshots', m.id, 'metadata.json');
    const envelope = JSON.parse(await readFile(file, 'utf8'));
    envelope.metadata.id = '../../escape';
    await writeFile(file, JSON.stringify(envelope));
    await expect(ws.get(m.id)).rejects.toThrow();
    expect((await ws.doctor()).failures).toEqual([m.id]);
    expect(await readFile(join(root, 'snapshots', m.id, 'original'), 'utf8')).toBe(original);
    await expect(new Workspace(join(root, 'fresh')).get('../../escape')).rejects.toThrow(
      'not found',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
