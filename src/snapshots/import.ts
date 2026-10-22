import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse';
import { ensure, limits, validateRow, type Row, type SnapshotMetadata } from '../core/model.js';
export async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function parseFile(file: string, format: SnapshotMetadata['format']): Promise<Row[]> {
  const rows: Row[] = [];
  const columns = new Set<string>();
  const add = (value: unknown) => {
    ensure(rows.length < limits.rows, 'Import row limit exceeded');
    const row = validateRow(value);
    Object.keys(row).forEach((c) => columns.add(c));
    ensure(columns.size <= 256, 'Dataset column limit exceeded');
    rows.push(row);
  };
  if (format === 'csv') {
    let headers: string[] = [];
    const stream = createReadStream(file).pipe(
      parse({
        bom: true,
        columns: (names: string[]) => {
          ensure(new Set(names).size === names.length, 'Duplicate CSV headers');
          headers = names;
          ensure(names.length <= 256, 'Column limit exceeded');
          for (const n of names) validateRow({ [n]: '' });
          return names;
        },
        max_record_size: 1024 * 1024,
      }),
    );
    for await (const row of stream) add(row);
    // Header-only schemas are intentionally unsupported instead of losing evidence silently.
    ensure(
      rows.length > 0 || headers.length === 0,
      'Header-only CSV is unsupported; use JSON [] for an empty dataset',
    );
  } else if (format === 'json') {
    const data: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file)),
    );
    ensure(Array.isArray(data), 'JSON input must be an array');
    data.forEach(add);
  } else {
    const reader = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    let firstLine = true;
    for await (const line of reader) {
      const text = firstLine ? line.replace(/^\uFEFF/, '') : line;
      firstLine = false;
      if (text.trim()) add(JSON.parse(text));
    }
  }
  // Reject invalid UTF-8 for every format, without holding the source in memory.
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const chunk of createReadStream(file))
    decoder.decode(chunk as Buffer, { stream: true });
  decoder.decode();
  return rows;
}
