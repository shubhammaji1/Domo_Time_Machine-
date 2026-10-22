import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  VERSION,
  compare,
  schemaOf,
  replay,
  makeCapsule,
  inspectCapsule,
  digest,
  replayCapsule,
  type Row,
  type Snapshot,
} from '../../src/index.js';
const snapshot = (rows: Row[]) =>
  ({
    rows,
    metadata: { id: digest(rows), schema: schemaOf(rows), dataCompleteness: 'complete' },
  }) as Snapshot;
const spec = {
  version: 1,
  name: 'total',
  inputs: { data: 'source' },
  steps: [
    {
      id: 'out',
      input: 'data',
      operation: 'aggregate',
      groupBy: [],
      measures: [{ column: 'amount', operation: 'sum', as: 'total' }],
    },
  ],
  output: 'out',
};
it('tracks package metadata version instead of a hardcoded CLI version', async () => {
  expect(VERSION).toBe(JSON.parse(await readFile('package.json', 'utf8')).version);
});
it('rejects non-unique destination mappings', () => {
  expect(() =>
    compare(snapshot([{ a: 'x', b: 'x' }]), snapshot([{ c: 'x' }]), ['a', 'b'], ['c', 'c']),
  ).toThrow('key mapping');
});
it('compares replay assertions numerically and rejects invalid numeric aggregation', () => {
  expect(
    replay(
      {
        ...spec,
        assertions: [{ table: 'out', column: 'total', aggregation: 'sum', equals: '0.30' }],
      },
      { data: [{ amount: '0.1' }, { amount: '0.2' }] },
    ).passed,
  ).toBe(true);
  expect(() => replay(spec, { data: [{ amount: '1' }, { amount: '' }] })).toThrow(
    'Invalid numeric',
  );
  const failed = replay(
    {
      ...spec,
      steps: [{ id: 'out', input: 'data', operation: 'select', columns: ['amount'] }],
      assertions: [{ table: 'out', column: 'amount', aggregation: 'sum', equals: '1' }],
    },
    { data: [{ amount: '1' }, { amount: 'bad' }] },
  );
  expect(failed.passed).toBe(false);
  expect(failed.assertions[0]?.excluded.invalid).toBe(1);
  expect(replay(spec, { data: [{ amount: '1' }, { amount: null }] }).warnings[0]).toContain(
    '1 null',
  );
});
it('rejects invalid replay limits for single-row inputs', () => {
  for (const maxRows of [NaN, Infinity, 1.5, -1])
    expect(() => replay(spec, { data: [{ amount: '1' }] }, { maxRows })).toThrow('row limit');
});
it('requires exact capsule input identities and truthful column manifests', () => {
  const data = { data: [{ amount: '1' }] };
  expect(() =>
    makeCapsule(
      spec,
      { ...data, unrelated: [{ private: 'synthetic' }] },
      { mode: 'synthetic', reviewed: true },
    ),
  ).toThrow('inputs');
  const cap = makeCapsule(spec, data, { mode: 'synthetic', reviewed: true });
  cap.payload.inputs.wrong = cap.payload.inputs.data!;
  delete cap.payload.inputs.data;
  cap.checksum = digest(cap.payload);
  expect(() => inspectCapsule(cap)).toThrow('input mismatch');
  const manifest = makeCapsule(spec, data, { mode: 'synthetic', reviewed: true });
  manifest.payload.privacy.includedColumns.data = [];
  manifest.checksum = digest(manifest.payload);
  expect(() => inspectCapsule(manifest)).toThrow('manifest');
});
it('replays original schema-v1 capsules after a patch upgrade', async () => {
  const fixture = JSON.parse(await readFile('tests/fixtures/capsule-v0.1.0.json', 'utf8'));
  expect(fixture.payload.softwareVersion).toBe('0.1.0');
  const result = replayCapsule(fixture);
  expect(result.passed).toBe(true);
  expect(result.capsuleProducerVersion).toBe('0.1.0');
  expect(result.engineVersion).toBe(VERSION);
});
