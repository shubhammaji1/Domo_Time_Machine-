import { canonical, type Column, type SnapshotMetadata } from '../core/model.js';
export interface SchemaChange {
  column: string;
  kind: 'added' | 'removed' | 'changed';
  before: Column | undefined;
  after: Column | undefined;
}
/** Confirmed observational changes only; column rename inference is not performed. */
export function compareSchemas(before: Column[], after: Column[]): SchemaChange[] {
  return [...new Set([...before.map((c) => c.name), ...after.map((c) => c.name)])]
    .sort()
    .flatMap((name) => {
      const b = before.find((c) => c.name === name),
        a = after.find((c) => c.name === name);
      return canonical(b ?? null) === canonical(a ?? null)
        ? []
        : [
            {
              column: name,
              kind: !b ? ('added' as const) : !a ? ('removed' as const) : ('changed' as const),
              before: b,
              after: a,
            },
          ];
    });
}
export function schemaHistory(snapshots: SnapshotMetadata[], datasetName?: string) {
  const sorted = snapshots
    .filter((s) => !datasetName || s.datasetName === datasetName)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
  const previous = new Map<string, SnapshotMetadata>();
  return sorted.map((snapshot) => {
    const before = previous.get(snapshot.datasetName);
    previous.set(snapshot.datasetName, snapshot);
    return {
      datasetName: snapshot.datasetName,
      snapshotId: snapshot.id,
      capturedAt: snapshot.capturedAt,
      schemaHash: snapshot.schemaHash,
      previousSnapshotId: before?.id ?? null,
      changes: before ? compareSchemas(before.schema, snapshot.schema) : [],
      schema: snapshot.schema,
    };
  });
}
