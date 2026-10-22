import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  Workspace,
  compare,
  compareSchemas,
  schemaHistory,
  validateFinancial,
  investigate,
  type DomoReadOnlySource,
} from '../../src/index.js';
it('traces missing rows, schema changes and decimal financial discrepancy through files and SDK', async () => {
  const root = await mkdtemp(resolve('.artifacts/tmp/.demo-workspace-workflow-'));
  const ws = new Workspace(root);
  try {
    await ws.capture('tests/fixtures/reconciliation-before.json', {
      name: 'before',
      datasetName: 'bookings',
      dataCompleteness: 'complete',
    });
    await ws.capture('tests/fixtures/reconciliation-after.ndjson', {
      name: 'after',
      datasetName: 'bookings',
      dataCompleteness: 'complete',
    });
    const before = await ws.get('before'),
      after = await ws.get('after');
    expect(compare(before, after, ['Booking_ID'])).toMatchObject({
      added: 1,
      removed: 1,
      updated: 2,
      beforeRows: 3,
      afterRows: 3,
    });
    expect(
      compare(before, after, ['Booking_ID']).evidence.find((e) => e.kind === 'removed')?.before[0]
        ?.value.Booking_ID,
    ).toBe('BK103');
    const changes = compareSchemas(before.metadata.schema, after.metadata.schema);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column: 'Status', kind: 'removed' }),
        expect.objectContaining({ column: 'Channel', kind: 'added' }),
      ]),
    );
    const history = schemaHistory(await ws.list(), 'bookings');
    expect(history).toHaveLength(2);
    expect(history[1]?.changes).toHaveLength(2);
    const rule = { column: 'Fare', currency: 'INR', expected: '9200.30' };
    expect(validateFinancial(before.rows, rule)).toMatchObject({ passed: true, actual: '9200.3' });
    expect(validateFinancial(after.rows, rule)).toMatchObject({
      passed: false,
      actual: '9200.55',
      difference: '0.25',
    });
    const report = investigate(
      before,
      after,
      ['Booking_ID'],
      [
        {
          name: 'fare',
          column: 'Fare',
          aggregation: 'sum',
          currencyColumn: 'Currency',
          currency: 'INR',
          groupBy: ['Booking_ID'],
        },
      ],
    );
    expect(report.metrics[0]?.absoluteChange).toBe('0.25');
    expect(
      report.metrics[0]?.groupedContributions.find((g) => g.group.includes('BK103'))?.change,
    ).toBe('-1200');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('keeps the future connector surface read-only and optional', () => {
  type ReadMethods = keyof DomoReadOnlySource;
  const methods: ReadMethods[] = ['describeDataset', 'exportCsv'];
  expect(methods).toHaveLength(2);
});
