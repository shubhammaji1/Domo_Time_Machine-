import {
  canonical,
  digest,
  ensure,
  keyOf,
  requireColumns,
  type Row,
  type Snapshot,
} from '../core/model.js';
import { compareSchemas } from '../schema/index.js';

export interface Evidence {
  kind: 'added' | 'removed' | 'updated' | 'ambiguous';
  key: string;
  before: { row: number; value: Row }[];
  after: { row: number; value: Row }[];
  changedColumns: string[];
}
export function compare(before: Snapshot, after: Snapshot, keys: string[] = [], afterKeys = keys) {
  ensure(
    keys.length === afterKeys.length &&
      new Set(keys).size === keys.length &&
      new Set(afterKeys).size === afterKeys.length,
    'Invalid key mapping',
  );
  requireColumns(before.rows, keys);
  requireColumns(after.rows, afterKeys);
  const group = (rows: Row[], cols: string[]) => {
    const map = new Map<string, { row: number; value: Row }[]>();
    rows.forEach((value, row) => {
      const key = cols.length ? keyOf(value, cols) : canonical(value);
      const g = map.get(key) ?? [];
      g.push({ row, value });
      map.set(key, g);
    });
    return map;
  };
  const left = group(before.rows, keys),
    right = group(after.rows, afterKeys);
  let added = 0,
    removed = 0,
    updated = 0,
    unchanged = 0,
    ambiguousBefore = 0,
    ambiguousAfter = 0;
  const evidence: Evidence[] = [],
    duplicates: { side: string; key: string; rows: number[] }[] = [];
  if (keys.length)
    for (const [side, map] of [
      ['before', left],
      ['after', right],
    ] as const)
      for (const [key, values] of map)
        if (values.length > 1) duplicates.push({ side, key, rows: values.map((v) => v.row) });
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const l = left.get(key) ?? [],
      r = right.get(key) ?? [];
    const rightByContent = new Map<string, typeof r>();
    for (const row of r) {
      const content = canonical(row.value),
        bucket = rightByContent.get(content) ?? [];
      bucket.push(row);
      rightByContent.set(content, bucket);
    }
    const matchedRows = new Set<number>();
    const unmatched: typeof l = [];
    for (const row of l) {
      const match = rightByContent.get(canonical(row.value))?.pop();
      if (match) {
        unchanged++;
        matchedRows.add(match.row);
      } else unmatched.push(row);
    }
    const remaining = r.filter((row) => !matchedRows.has(row.row));
    if (!unmatched.length && !remaining.length) continue;
    let kind: Evidence['kind'];
    const changedColumns: string[] = [];
    if (!l.length || (!keys.length && !unmatched.length)) {
      kind = 'added';
      added += remaining.length;
    } else if (!r.length || (!keys.length && !remaining.length)) {
      kind = 'removed';
      removed += unmatched.length;
    } else if (l.length === 1 && r.length === 1) {
      kind = 'updated';
      updated++;
      const a = unmatched[0]!.value,
        b = remaining[0]!.value;
      for (const c of new Set([...Object.keys(a), ...Object.keys(b)]))
        if (
          Object.hasOwn(a, c) !== Object.hasOwn(b, c) ||
          canonical(a[c] ?? null) !== canonical(b[c] ?? null)
        )
          changedColumns.push(c);
    } else {
      kind = 'ambiguous';
      ambiguousBefore += unmatched.length;
      ambiguousAfter += remaining.length;
    }
    evidence.push({ kind, key, before: unmatched, after: remaining, changedColumns });
  }
  const schemaChanges = compareSchemas(before.metadata.schema, after.metadata.schema);
  const warnings: string[] = [];
  if (!keys.length)
    warnings.push('Multiset comparison: updates appear as removed and added records.');
  if (duplicates.length)
    warnings.push(
      'Duplicate business keys: unmatched records within shared repeated-key groups are ambiguous.',
    );
  if (
    before.metadata.dataCompleteness !== 'complete' ||
    after.metadata.dataCompleteness !== 'complete'
  )
    warnings.push(
      'At least one capture is not declared complete; findings apply only to captured records.',
    );
  return {
    schemaVersion: 1,
    beforeSnapshotId: before.metadata.id,
    afterSnapshotId: after.metadata.id,
    beforeRows: before.rows.length,
    afterRows: after.rows.length,
    added,
    removed,
    updated,
    unchanged,
    ambiguousBefore,
    ambiguousAfter,
    duplicateKeyGroups: duplicates.length,
    duplicates,
    schemaChanges,
    warnings,
    comparisonComplete: !ambiguousBefore && !ambiguousAfter,
    status: ambiguousBefore || ambiguousAfter ? 'ambiguous' : 'complete',
    matching: keys.length ? { keys, afterKeys } : 'multiset',
    evidence,
    evidenceHash: digest(evidence),
  };
}
