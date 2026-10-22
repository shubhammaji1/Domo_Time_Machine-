import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { z } from 'zod';

export const VERSION: string = (
  createRequire(import.meta.url)('../../package.json') as { version: string }
).version;
export class DomoTimeMachineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomoTimeMachineError';
  }
}
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
export type Column = { name: string; types: string[]; nullable: boolean; optional: boolean };
export const limits = {
  bytes: 64 * 1024 * 1024,
  rows: 100_000,
  outputRows: 100_000,
  steps: 50,
  milliseconds: 15_000,
};
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomoTimeMachineError(message);
}
// Exact code points are preserved. No Unicode normalization or numeric coercion.
// Sorted field names; array order retained; absent fields are distinct from null.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  const serialized = JSON.stringify(value);
  ensure(serialized !== undefined, 'Unsupported canonical value');
  return serialized;
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function validateRow(value: unknown): Row {
  ensure(
    value && typeof value === 'object' && !Array.isArray(value),
    'Each record must be an object',
  );
  const result: Row = Object.create(null) as Row;
  for (const [key, cell] of Object.entries(value)) {
    ensure(
      key.length > 0 &&
        key.length <= 256 &&
        !['__proto__', 'constructor', 'prototype'].includes(key),
      'Invalid column name',
    );
    ensure(
      cell === null || ['string', 'number', 'boolean'].includes(typeof cell),
      'Only scalar cells are supported',
    );
    if (typeof cell === 'number')
      ensure(
        Number.isFinite(cell) && (!Number.isInteger(cell) || Number.isSafeInteger(cell)),
        'Unsafe JSON number: use a decimal string',
      );
    result[key] = cell as Cell;
  }
  ensure(Object.keys(result).length <= 256, 'Column limit exceeded');
  return result;
}
export function schemaOf(rows: Row[]): Column[] {
  const names = [...new Set(rows.flatMap(Object.keys))].sort();
  return names.map((name) => ({
    name,
    types: [
      ...new Set(
        rows.filter((r) => Object.hasOwn(r, name) && r[name] !== null).map((r) => typeof r[name]),
      ),
    ].sort(),
    nullable: rows.some((r) => r[name] === null),
    optional: rows.some((r) => !Object.hasOwn(r, name)),
  }));
}
export const captureOptions = z
  .object({
    name: z.string().min(1).max(128),
    datasetName: z.string().min(1).max(128).default('local'),
    keyColumns: z.array(z.string().min(1)).default([]),
    dataCompleteness: z.enum(['complete', 'sample', 'filtered', 'unknown']).default('unknown'),
    sourceUpdatedAt: z.string().datetime().optional(),
  })
  .strict();
export type CaptureOptions = z.input<typeof captureOptions>;
export interface SnapshotMetadata {
  schemaVersion: 1;
  id: string;
  name: string;
  datasetName: string;
  capturedAt: string;
  sourceUpdatedAt?: string;
  format: 'csv' | 'json' | 'ndjson';
  rowCount: number;
  columnCount: number;
  schemaHash: string;
  contentHash: string;
  originalHash: string;
  sourceType: 'local';
  keyColumns: string[];
  dataCompleteness: 'complete' | 'sample' | 'filtered' | 'unknown';
  schema: Column[];
  canonicalization: 'dtm-v1';
}
export interface Snapshot {
  metadata: SnapshotMetadata;
  rows: Row[];
}
export function keyOf(row: Row, columns: string[]): string {
  return canonical(columns.map((c) => (Object.hasOwn(row, c) ? ['value', row[c]] : ['missing'])));
}
export function requireColumns(rows: Row[], columns: string[]): void {
  const names = new Set(rows.flatMap(Object.keys));
  for (const c of columns) ensure(names.has(c) || rows.length === 0, `Unknown column: ${c}`);
}
