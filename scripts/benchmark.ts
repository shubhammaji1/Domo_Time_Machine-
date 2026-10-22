import { performance } from 'node:perf_hooks';
import { mkdtemp, writeFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactDirectory } from './artifacts.mjs';
import { Workspace, compare } from '../src/index.js';
const count = Number(process.argv[2] ?? 10000);
if (![10000, 100000].includes(count))
  throw new Error('Supported manual benchmarks: 10000 or 100000. One million exceeds MVP limits.');
const root = await mkdtemp(join(artifactDirectory('tmp'), 'benchmark-'));
try {
  const file = join(root, 'rows.ndjson');
  await writeFile(
    file,
    Array.from({ length: count }, (_, i) => JSON.stringify({ id: String(i), amount: '0.10' })).join(
      '\n',
    ),
  );
  const ws = new Workspace(root);
  const start = performance.now();
  await ws.capture(file, { name: 'bench' });
  const imported = performance.now();
  const snapshot = await ws.get('bench');
  const loaded = performance.now();
  compare(snapshot, snapshot, ['id']);
  console.log(
    JSON.stringify({
      rows: count,
      importMs: imported - start,
      loadMs: loaded - imported,
      diffMs: performance.now() - loaded,
      rssBytes: process.memoryUsage().rss,
      sourceBytes: (await stat(file)).size,
      note: 'RSS sampled at end, not peak. Manual local measurement.',
    }),
  );
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
