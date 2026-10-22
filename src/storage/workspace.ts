import { createReadStream, createWriteStream } from 'node:fs';
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  stat,
  lstat,
  readdir,
  rmdir,
  link,
} from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join, extname } from 'node:path';
import { z } from 'zod';
import {
  canonical,
  captureOptions,
  digest,
  ensure,
  limits,
  schemaOf,
  type CaptureOptions,
  type Snapshot,
  type SnapshotMetadata,
} from '../core/model.js';
import { hashFile, parseFile } from '../snapshots/import.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const metadataSchema = captureOptions
  .extend({
    schemaVersion: z.literal(1),
    id: z.string().regex(uuid),
    capturedAt: z.string().datetime(),
    format: z.enum(['csv', 'json', 'ndjson']),
    rowCount: z.number().int().min(0).max(limits.rows),
    columnCount: z.number().int().min(0).max(256),
    schemaHash: checksum,
    contentHash: checksum,
    originalHash: checksum,
    sourceType: z.literal('local'),
    canonicalization: z.literal('dtm-v1'),
    schema: z
      .array(
        z
          .object({
            name: z.string(),
            types: z.array(z.enum(['string', 'number', 'boolean'])),
            nullable: z.boolean(),
            optional: z.boolean(),
          })
          .strict(),
      )
      .max(256),
  })
  .strict();
const envelopeSchema = z.object({ metadata: metadataSchema, checksum }).strict();
const layout = { schemaVersion: 1, storage: 'immutable-files-v1' };
async function absent(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}
async function regular(file: string, maximum: number): Promise<void> {
  const info = await lstat(file);
  ensure(
    info.isFile() && !info.isSymbolicLink() && info.size <= maximum,
    'Invalid or oversized evidence file',
  );
}
/** Database-free, append-only evidence store. One directory rename commits a snapshot. */
export class Workspace {
  readonly root: string;
  constructor(root = '.domo-time-machine') {
    this.root = resolve(root);
  }
  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    ensure(!(await lstat(this.root)).isSymbolicLink(), 'Workspace symlinks are unsupported');
    const marker = join(this.root, 'workspace.json');
    if (await absent(marker)) {
      ensure(
        await absent(join(this.root, 'metadata.sqlite')),
        'Legacy workspace: use a new directory and reimport original artifacts',
      );
      const temp = join(this.root, '.' + randomUUID() + '.init');
      await writeFile(temp, canonical(layout), { flag: 'wx', mode: 0o600, flush: true });
      try {
        await link(temp, marker);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      } finally {
        await rm(temp, { force: true });
      }
    }
    await regular(marker, 1024);
    ensure(
      canonical(JSON.parse(await readFile(marker, 'utf8'))) === canonical(layout),
      'Unsupported workspace storage version',
    );
    for (const name of ['snapshots', 'locks']) {
      const path = join(this.root, name);
      await mkdir(path, { recursive: true, mode: 0o700 });
      const info = await lstat(path);
      ensure(info.isDirectory() && !info.isSymbolicLink(), 'Invalid storage directory');
    }
  }
  private async metadata(id: string): Promise<SnapshotMetadata> {
    ensure(uuid.test(id), 'Invalid snapshot identifier');
    const dir = join(this.root, 'snapshots', id);
    const info = await lstat(dir);
    ensure(info.isDirectory() && !info.isSymbolicLink(), 'Invalid snapshot directory');
    const file = join(dir, 'metadata.json');
    await regular(file, 1024 * 1024);
    const envelope = envelopeSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    ensure(
      envelope.metadata.id === id && digest(envelope.metadata) === envelope.checksum,
      'Snapshot metadata integrity failure',
    );
    return envelope.metadata;
  }
  async list(): Promise<SnapshotMetadata[]> {
    await this.init();
    const result: SnapshotMetadata[] = [];
    for (const name of await readdir(join(this.root, 'snapshots')))
      if (uuid.test(name)) result.push(await this.metadata(name));
    ensure(
      new Set(result.map((m) => m.name)).size === result.length,
      'Duplicate snapshot names in workspace',
    );
    return result.sort(
      (a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id),
    );
  }
  async capture(file: string, options: CaptureOptions): Promise<SnapshotMetadata> {
    const opts = captureOptions.parse(options);
    ensure(!uuid.test(opts.name), 'Snapshot names cannot use reserved UUID identifiers');
    await this.init();
    const lock = join(this.root, 'locks', digest(opts.name) + '.lock');
    try {
      await mkdir(lock, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error('Capture name is locked; inspect doctor before retrying');
      throw error;
    }
    const id = randomUUID();
    const temp = join(this.root, 'snapshots', '.' + id + '.tmp');
    try {
      ensure(
        !(await this.list()).some((m) => m.name === opts.name),
        'Snapshot name already exists',
      );
      const format = extname(file).slice(1).toLowerCase();
      ensure(['csv', 'json', 'ndjson'].includes(format), 'Supported formats: CSV, JSON, NDJSON');
      const info = await stat(file);
      ensure(
        info.isFile() && info.size <= limits.bytes,
        'Input must be a regular file under 64 MiB',
      );
      await mkdir(temp, { mode: 0o700 });
      let bytes = 0;
      await pipeline(
        createReadStream(file),
        new Transform({
          transform(chunk: Buffer, _encoding, cb) {
            bytes += chunk.length;
            cb(bytes > limits.bytes ? new Error('Input size limit exceeded') : null, chunk);
          },
        }),
        createWriteStream(join(temp, 'original'), { flags: 'wx', mode: 0o600, flush: true }),
      );
      const rows = await parseFile(join(temp, 'original'), format as SnapshotMetadata['format']);
      const schema = schemaOf(rows);
      for (const key of opts.keyColumns)
        ensure(
          schema.some((c) => c.name === key),
          `Unknown key column: ${key}`,
        );
      const data = rows.map(canonical).join('\n') + (rows.length ? '\n' : '');
      ensure(Buffer.byteLength(data) <= limits.bytes * 2, 'Normalized snapshot exceeds 128 MiB');
      const metadata: SnapshotMetadata = {
        ...opts,
        schemaVersion: 1,
        id,
        capturedAt: new Date().toISOString(),
        format: format as SnapshotMetadata['format'],
        rowCount: rows.length,
        columnCount: schema.length,
        schemaHash: digest(schema),
        contentHash: createHash('sha256').update(data).digest('hex'),
        originalHash: await hashFile(join(temp, 'original')),
        sourceType: 'local',
        schema,
        canonicalization: 'dtm-v1',
      };
      await writeFile(join(temp, 'rows.ndjson'), data, { flag: 'wx', mode: 0o600, flush: true });
      await writeFile(
        join(temp, 'metadata.json'),
        canonical({ metadata, checksum: digest(metadata) }),
        { flag: 'wx', mode: 0o600, flush: true },
      );
      await rename(temp, join(this.root, 'snapshots', id));
      return metadata;
    } finally {
      await rm(temp, { recursive: true, force: true });
      await rmdir(lock);
    }
  }
  async get(ref: string): Promise<Snapshot> {
    await this.init();
    const metadata = uuid.test(ref)
      ? await this.metadata(ref)
      : (await this.list()).find((m) => m.name === ref);
    ensure(metadata, 'Snapshot not found');
    const dir = join(this.root, 'snapshots', metadata.id);
    await regular(join(dir, 'rows.ndjson'), limits.bytes * 2);
    await regular(join(dir, 'original'), limits.bytes);
    ensure(
      (await hashFile(join(dir, 'rows.ndjson'))) === metadata.contentHash,
      'Snapshot content integrity failure',
    );
    ensure(
      (await hashFile(join(dir, 'original'))) === metadata.originalHash,
      'Original artifact integrity failure',
    );
    const rows = await parseFile(join(dir, 'rows.ndjson'), 'ndjson');
    ensure(
      rows.length === metadata.rowCount &&
        digest(schemaOf(rows)) === metadata.schemaHash &&
        metadata.columnCount === metadata.schema.length,
      'Snapshot schema integrity failure',
    );
    return { metadata, rows };
  }
  async doctor(): Promise<{
    checked: number;
    failures: string[];
    orphans: string[];
    pendingCaptures: string[];
  }> {
    await this.init();
    const names = await readdir(join(this.root, 'snapshots'));
    const ids = names.filter((n) => uuid.test(n));
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await this.get(id);
      } catch {
        failures.push(id);
      }
    }
    return {
      checked: ids.length,
      failures,
      orphans: names.filter((n) => !uuid.test(n)),
      pendingCaptures: await readdir(join(this.root, 'locks')),
    };
  }
}
