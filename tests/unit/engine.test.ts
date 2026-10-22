import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  Workspace,
  compare,
  digest,
  schemaOf,
  canonical,
  metric,
  investigate,
  replay,
  makeCapsule,
  replayCapsule,
  inspectCapsule,
  type Row,
  type Snapshot,
} from '../../src/index.js';
let root: string, ws: Workspace;
beforeEach(async () => {
  root = await mkdtemp(resolve('.artifacts/tmp/.demo-workspace-test-'));
  ws = new Workspace(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
function snap(rows: Row[]): Snapshot {
  return {
    rows,
    metadata: {
      schemaVersion: 1,
      id: digest(rows),
      name: 'test',
      datasetName: 'test',
      capturedAt: '2026-10-18T00:00:00Z',
      format: 'json',
      rowCount: rows.length,
      columnCount: schemaOf(rows).length,
      schema: schemaOf(rows),
      schemaHash: digest(schemaOf(rows)),
      contentHash: digest(rows),
      originalHash: digest(rows),
      sourceType: 'local',
      keyColumns: [],
      dataCompleteness: 'complete',
      canonicalization: 'dtm-v1',
    },
  };
}
async function capture(data: string, name: string, extension = 'json') {
  const file = join(root, name + '.' + extension);
  await writeFile(file, data);
  return ws.capture(file, { name });
}
const bookings: Row[] = [
  { Booking_ID: 'BK101', Fare: '5000', Currency: 'INR' },
  { Booking_ID: 'BK102', Fare: '3000', Currency: 'INR' },
];
const tickets: Row[] = [
  { Booking_ID: 'BK101', Ticket: 'Original' },
  { Booking_ID: 'BK101', Ticket: 'Reissue' },
  { Booking_ID: 'BK102', Ticket: 'Original' },
];
const joinSpec = {
  version: 1,
  name: 'join',
  inputs: { bookings: 'bookings', tickets: 'tickets' },
  steps: [
    {
      id: 'joined',
      operation: 'left_join',
      left: 'bookings',
      right: 'tickets',
      on: [{ left: 'Booking_ID', right: 'Booking_ID' }],
    },
  ],
  output: 'joined',
};
describe('immutable captures', () => {
  it('imports quoted/multiline CSV without numeric coercion', async () => {
    await ws.init();
    const m = await capture('id,amount,note\r\n001,0.10,"two\nlines"\r\n002,,"a,b"', 'csv', 'csv');
    const s = await ws.get(m.id);
    expect(s.rows[0]).toEqual({ id: '001', amount: '0.10', note: 'two\nlines' });
    expect(s.rows[1]!.amount).toBe('');
    expect(m.rowCount).toBe(2);
  });
  it('preserves JSON types and missing/null/empty distinctions', async () => {
    await ws.init();
    await capture('[{"id":1,"v":null},{"id":2},{"id":3,"v":""},{"id":4,"v":0}]', 'types');
    const s = await ws.get('types');
    expect(s.rows[0]!.v).toBeNull();
    expect(Object.hasOwn(s.rows[1]!, 'v')).toBe(false);
    expect(s.metadata.schema.find((c) => c.name === 'v')).toMatchObject({
      nullable: true,
      optional: true,
      types: ['number', 'string'],
    });
  });
  it('imports NDJSON and empty JSON', async () => {
    await ws.init();
    await capture('{"a":1}\n{"a":2}\n', 'ndjson', 'ndjson');
    await capture('[]', 'empty');
    expect((await ws.get('ndjson')).rows).toHaveLength(2);
    expect((await ws.get('empty')).rows).toEqual([]);
  });
  it('rejects overwrite, unsafe numbers, duplicate headers and invalid UTF-8', async () => {
    await ws.init();
    await capture('[{"id":1}]', 'same');
    await expect(capture('[]', 'same')).rejects.toThrow();
    await expect(capture('[{"id":9007199254740993}]', 'unsafe')).rejects.toThrow();
    await expect(capture('id,id\n1,2', 'headers', 'csv')).rejects.toThrow();
    const file = join(root, 'invalid.csv');
    await writeFile(file, Buffer.from([0x61, 0x0a, 0xff]));
    await expect(ws.capture(file, { name: 'encoding' })).rejects.toThrow();
    expect((await ws.list()).length).toBe(1);
  });
  it('detects content, original and metadata tampering', async () => {
    await ws.init();
    const m = await capture('[{"id":1}]', 'integrity');
    const dir = join(root, 'snapshots', m.id);
    const original = await readFile(join(dir, 'rows.ndjson'));
    await writeFile(join(dir, 'rows.ndjson'), '{}\n');
    await expect(ws.get('integrity')).rejects.toThrow('integrity');
    await writeFile(join(dir, 'rows.ndjson'), original);
    await writeFile(join(dir, 'original'), '[]');
    expect((await ws.doctor()).failures).toEqual([m.id]);
  });
  it('rejects traversal references and unsafe columns', async () => {
    await ws.init();
    await expect(ws.get('../../etc/passwd')).rejects.toThrow('not found');
    await expect(capture('[{"__proto__":"x"}]', 'proto')).rejects.toThrow();
  });
});
describe('record diff', () => {
  it('classifies added removed updated unchanged independently', () => {
    const a = snap([{ id: 1, v: 'a' }, { id: 2 }, { id: 3, v: null }]);
    const b = snap([{ id: 1, v: 'b' }, { id: 3, v: null }, { id: 4 }]);
    expect(compare(a, b, ['id'])).toMatchObject({
      added: 1,
      removed: 1,
      updated: 1,
      unchanged: 1,
      comparisonComplete: true,
    });
  });
  it('reports repeated-key ambiguity without choosing an arbitrary row', () => {
    const a = snap([
      { id: 1, v: 1 },
      { id: 1, v: 2 },
    ]);
    const b = snap([
      { id: 1, v: 1 },
      { id: 1, v: 3 },
    ]);
    expect(compare(a, b, ['id'])).toMatchObject({
      updated: 0,
      unchanged: 1,
      ambiguousBefore: 1,
      ambiguousAfter: 1,
      duplicateKeyGroups: 2,
      status: 'ambiguous',
    });
  });
  it('tracks excess exact duplicate multiplicities in multiset mode', () => {
    expect(compare(snap([{ a: 1 }]), snap([{ a: 1 }, { a: 1 }]))).toMatchObject({
      unchanged: 1,
      added: 1,
    });
  });
  it('supports composite keys, mapped keys and case sensitive matching', () => {
    expect(compare(snap([{ a: 'x', b: 1 }]), snap([{ a: 'x', b: 2 }]), ['a', 'b'])).toMatchObject({
      added: 1,
      removed: 1,
    });
    expect(compare(snap([{ a: 1 }]), snap([{ b: 1 }]), ['a'], ['b']).updated).toBe(1);
    expect(compare(snap([{ id: 'X' }]), snap([{ id: 'x' }]), ['id']).added).toBe(1);
  });
  it('distinguishes null from absent, zero and empty values; detects schema changes', () => {
    const d = compare(snap([{ id: 1, x: null }]), snap([{ id: 1, x: '' }]), ['id']);
    expect(d.updated).toBe(1);
    expect(d.schemaChanges).toHaveLength(1);
    expect(
      compare(snap([{ id: 1 }]), snap([{ id: 1, x: null }]), ['id']).evidence[0]!.changedColumns,
    ).toEqual(['x']);
  });
  it('handles empty snapshots', () =>
    expect(compare(snap([]), snap([]))).toMatchObject({ added: 0, updated: 0, unchanged: 0 }));
  it('preserves exact Unicode codepoints', () => {
    expect(compare(snap([{ id: 'é' }]), snap([{ id: 'e\u0301' }]), ['id']).added).toBe(1);
  });
});
describe('decimal metrics and evidence', () => {
  it('sums decimals exactly, separately counts exclusions', () => {
    expect(
      metric([{ x: '0.1' }, { x: '0.2' }, { x: null }, {}, { x: '' }], {
        name: 'x',
        column: 'x',
        aggregation: 'sum',
      }),
    ).toMatchObject({ value: '0.3', nulls: 1, missing: 1, invalid: 1 });
    expect(metric([], { name: 'x', column: 'x', aggregation: 'sum' }).value).toBeNull();
  });
  it.each([
    ['count', '3'],
    ['count_distinct', '2'],
    ['average', '2'],
    ['minimum', '1'],
    ['maximum', '3'],
    ['null_count', '0'],
    ['duplicate_key_count', '1'],
  ] as const)('calculates %s', (aggregation, expected) => {
    expect(
      metric(
        [{ x: '1' }, { x: '3' }, { x: '2' }].map((r, i) =>
          aggregation === 'count_distinct' || aggregation === 'duplicate_key_count'
            ? { x: String(i % 2) }
            : r,
        ),
        { name: 'x', column: 'x', aggregation },
      ).value,
    ).toBe(expected);
  });
  it('rejects mixed currencies and mismatched declarations', () => {
    expect(() =>
      metric(
        [
          { x: '1', c: 'INR' },
          { x: '2', c: 'USD' },
        ],
        { name: 'x', column: 'x', aggregation: 'sum', currencyColumn: 'c' },
      ),
    ).toThrow('currencies');
  });
  it('traces grouped fare change to BK101 without asserting business causality', () => {
    const joined = replay(joinSpec, { bookings, tickets });
    const report = investigate(
      snap(bookings),
      snap(joined.rows),
      ['Booking_ID'],
      [{ name: 'Fare', column: 'Fare', aggregation: 'sum', groupBy: ['Booking_ID'] }],
    );
    expect(report.metrics[0]).toMatchObject({
      absoluteChange: '5000',
      before: { value: '8000' },
      after: { value: '13000' },
    });
    expect(
      report.metrics[0]!.groupedContributions.find((g) => g.group.includes('BK101'))!.change,
    ).toBe('5000');
    expect(report.findings.some((f) => f.classification === 'hypothesis')).toBe(true);
  });
});
describe('safe deterministic replay', () => {
  it('reproduces join multiplication and preserves immutable inputs', () => {
    const hash = digest(bookings);
    const result = replay(joinSpec, { bookings, tickets });
    expect(result.rows).toHaveLength(3);
    expect(result.steps[0]!.expansionFactor).toBe('1.5');
    expect(digest(bookings)).toBe(hash);
    expect(replay(joinSpec, { bookings, tickets }).outputHash).toBe(result.outputHash);
  });
  it('handles inner, left, many-to-many and null join keys', () => {
    const spec = { ...joinSpec, inputs: { bookings: 'b', tickets: 't' } };
    expect(
      replay(spec, {
        bookings: [{ Booking_ID: null }, { Booking_ID: 'x' }],
        tickets: [{ Booking_ID: null }],
      }).rows,
    ).toHaveLength(2);
    expect(
      replay(
        { ...spec, steps: [{ ...spec.steps[0], operation: 'inner_join' }] },
        { bookings: [{ Booking_ID: 'x' }], tickets: [{ Booking_ID: 'y' }] },
      ).rows,
    ).toHaveLength(0);
    expect(
      replay(spec, {
        bookings: [{ Booking_ID: 'x' }, { Booking_ID: 'x' }],
        tickets: [{ Booking_ID: 'x' }, { Booking_ID: 'x' }],
      }).rows,
    ).toHaveLength(4);
  });
  it('filters, selects, renames, derives, deduplicates, sorts and aggregates', () => {
    const result = replay(
      {
        version: 1,
        name: 'ops',
        inputs: { source: 's' },
        steps: [
          {
            id: 'filtered',
            operation: 'filter',
            input: 'source',
            column: 'x',
            operator: 'gt',
            value: '1',
          },
          { id: 'selected', operation: 'select', input: 'filtered', columns: ['x'] },
          { id: 'renamed', operation: 'rename', input: 'selected', columns: { x: 'amount' } },
          {
            id: 'derived',
            operation: 'derive',
            input: 'renamed',
            as: 'double',
            left: 'amount',
            right: { value: '2' },
            operator: 'multiply',
          },
          { id: 'unique', operation: 'deduplicate', input: 'derived', keys: ['amount'] },
          { id: 'sorted', operation: 'sort', input: 'unique', columns: ['amount'] },
          {
            id: 'total',
            operation: 'aggregate',
            input: 'sorted',
            groupBy: [],
            measures: [{ column: 'double', operation: 'sum', as: 'total' }],
          },
        ],
        output: 'total',
        assertions: [{ table: 'total', column: 'total', aggregation: 'sum', equals: '10' }],
      },
      { source: [{ x: '1' }, { x: '2' }, { x: '2' }, { x: '3' }] },
    );
    expect(result.rows).toEqual([{ total: '10' }]);
    expect(result.passed).toBe(true);
  });
  it('evaluates a candidate without losing legitimate ticket counts', async () => {
    const { parse } = await import('yaml');
    const spec = parse(await readFile('examples/booking-reconciliation/candidate.yaml', 'utf8'));
    const run = replay(spec, { bookings, tickets });
    expect(run.passed).toBe(true);
    expect(run.rows).toHaveLength(2);
    expect(
      metric(run.rows, { name: 'tickets', column: 'TicketCount', aggregation: 'sum' }).value,
    ).toBe('3');
  });
  it('fails configured assertions', () => {
    expect(
      replay(
        {
          ...joinSpec,
          assertions: [{ table: 'joined', column: 'Fare', aggregation: 'sum', equals: '8000' }],
        },
        { bookings, tickets },
      ).passed,
    ).toBe(false);
  });
  it('rejects arbitrary SQL, forward references and collisions', () => {
    expect(() =>
      replay({ ...joinSpec, sql: "COPY x TO '/etc/passwd'" }, { bookings, tickets }),
    ).toThrow();
    expect(() =>
      replay(
        { ...joinSpec, steps: [{ id: 'bad', operation: 'sql', query: 'INSTALL httpfs' }] },
        { bookings, tickets },
      ),
    ).toThrow();
    expect(() => replay({ ...joinSpec, output: 'missing' }, { bookings, tickets })).toThrow();
  });
  it('enforces cancellation, timeout and output bounds', () => {
    const abort = new AbortController();
    abort.abort();
    expect(() => replay(joinSpec, { bookings, tickets }, { signal: abort.signal })).toThrow(
      'cancelled',
    );
    expect(() => replay(joinSpec, { bookings, tickets }, { maxRows: 2 })).toThrow('limit');
    expect(() => replay(joinSpec, { bookings, tickets }, { milliseconds: -1 })).toThrow(
      'time limit',
    );
  });
});
describe('portable privacy-reviewed capsules', () => {
  it('requires review, rejects tampering and replays without workspace files', () => {
    expect(() =>
      makeCapsule(joinSpec, { bookings, tickets }, { mode: 'reviewed', reviewed: false }),
    ).toThrow('review');
    const capsule = makeCapsule(
      joinSpec,
      { bookings, tickets },
      { mode: 'synthetic', reviewed: true },
    );
    expect(replayCapsule(JSON.parse(JSON.stringify(capsule))).rows).toHaveLength(3);
    const changed = structuredClone(capsule);
    changed.payload.inputs.bookings![0]!.Fare = '1';
    expect(() => inspectCapsule(changed)).toThrow('integrity');
  });
  it('rejects malicious executable/archived metadata', () => {
    const cap = makeCapsule(joinSpec, { bookings, tickets }, { mode: 'synthetic', reviewed: true });
    expect(() => inspectCapsule({ ...cap, files: { '../../escape': 'evil' } })).toThrow();
  });
});
describe('property invariants', () => {
  it('row order preserves multiset equality, identity diff and no-op replay', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.integer({ min: 0, max: 100 }), v: fc.string() }), {
          maxLength: 80,
        }),
        (rows) => {
          const a = snap(rows),
            b = snap([...rows].reverse());
          const diff = compare(a, b);
          expect(diff.added + diff.removed + diff.updated).toBe(0);
          expect(diff.unchanged).toBe(rows.length);
          expect(compare(a, a, ['id']).unchanged).toBe(rows.length);
          const beforeHash = digest(rows);
          if (rows.length)
            expect(
              replay(
                {
                  version: 1,
                  name: 'noop',
                  inputs: { data: 'd' },
                  steps: [
                    { id: 'result', operation: 'select', input: 'data', columns: ['id', 'v'] },
                  ],
                  output: 'result',
                },
                { data: rows },
              ).rows,
            ).toEqual(rows);
          expect(digest(rows)).toBe(beforeHash);
          expect(canonical({ b: 1, a: null })).toBe(canonical({ a: null, b: 1 }));
        },
      ),
      { numRuns: 100 },
    );
  });
});
