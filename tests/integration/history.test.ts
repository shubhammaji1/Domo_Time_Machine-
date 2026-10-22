import { it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Workspace, compare, schemaHistory, canonical, type Row } from '../../src/index.js';

it('preserves five historical versions, timestamp ties and independent source chronology', async () => {
  const root = await mkdtemp(resolve('.artifacts/tmp/history-'));
  try {
    const ws = new Workspace(root);
    const versions: Row[][] = [
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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    const captured = [];
    for (let i = 0; i < versions.length; i++) {
      const file = join(root, `v${i}.json`);
      await writeFile(file, JSON.stringify(versions[i]));
      captured.push(
        await ws.capture(file, {
          name: `v${i}`,
          datasetName: 'history',
          keyColumns: ['id'],
          dataCompleteness: 'complete',
          sourceUpdatedAt: `2026-01-0${(i % 2) + 1}T00:00:00Z`,
        }),
      );
    }
    const first = await ws.get(captured[0]!.id);
    const d = compare(first, await ws.get('v1'), ['id']);
    expect(d).toMatchObject({ added: 1, removed: 1, updated: 1, unchanged: 1 });
    expect(new Set(captured.map((m) => m.id)).size).toBe(5);
    expect(new Set(captured.map((m) => m.capturedAt)).size).toBe(1);
    const listed = await ws.list();
    expect(listed.map((m) => m.id)).toEqual(
      captured.map((m) => m.id).sort((a, b) => a.localeCompare(b)),
    );
    expect(schemaHistory(listed, 'history')).toHaveLength(5);
    for (let i = 0; i < versions.length; i++) {
      expect(canonical((await new Workspace(root).get(captured[i]!.id)).rows)).toBe(
        canonical(versions[i]),
      );
      expect(await readFile(join(root, 'snapshots', captured[i]!.id, 'original'), 'utf8')).toBe(
        JSON.stringify(versions[i]),
      );
    }
    expect(compare(await ws.get('v3'), await ws.get('v4'), ['id'])).toMatchObject({
      unchanged: 2,
      updated: 0,
    });
    expect(captured[3]!.contentHash).not.toBe(captured[4]!.contentHash);
    await expect(ws.capture(join(root, 'v0.json'), { name: 'v0' })).rejects.toThrow();
    expect(canonical((await ws.get('v0')).rows)).toBe(canonical(versions[0]));
  } finally {
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
