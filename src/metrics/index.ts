import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { canonical, ensure, keyOf, requireColumns, type Row } from '../core/model.js';

// Bounded decimal input length makes this precision sufficient for all supported
// finite sums/products. Division is explicitly rounded to 40 significant digits.
export const Exact = Decimal.clone({ precision: 120, rounding: Decimal.ROUND_HALF_EVEN });
export function numeric(value: unknown): InstanceType<typeof Exact> | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const s = String(value);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) || s.replace(/[^0-9]/g, '').length > 38)
    return null;
  return new Exact(s);
}
export const metricSchema = z
  .object({
    name: z.string().min(1),
    column: z.string().optional(),
    aggregation: z.enum([
      'count',
      'count_distinct',
      'sum',
      'average',
      'minimum',
      'maximum',
      'null_count',
      'duplicate_key_count',
    ]),
    keys: z.array(z.string()).optional(),
    currency: z.string().optional(),
    currencyColumn: z.string().optional(),
    groupBy: z.array(z.string()).default([]),
  })
  .strict();
export type Metric = z.input<typeof metricSchema>;
export function metric(rows: Row[], definition: Metric) {
  const def = metricSchema.parse(definition);
  if (def.aggregation !== 'count')
    ensure(
      def.column || (def.aggregation === 'duplicate_key_count' && def.keys?.length),
      'Metric requires a column or keys',
    );
  requireColumns(rows, [
    ...(def.column ? [def.column] : []),
    ...(def.keys ?? []),
    ...def.groupBy,
    ...(def.currencyColumn ? [def.currencyColumn] : []),
  ]);
  if (def.currencyColumn) {
    const currencies = new Set(rows.map((r) => r[def.currencyColumn!]));
    ensure(
      [...currencies].every((c) => typeof c === 'string' && c.length > 0) && currencies.size <= 1,
      'Mixed or missing currencies require an explicit conversion policy',
    );
    if (def.currency)
      ensure(
        [...currencies].every((c) => c === def.currency),
        'Declared currency mismatch',
      );
  }
  let missing = 0,
    nulls = 0,
    invalid = 0;
  const values: { row: number; value: string; group: string }[] = [];
  if (def.column)
    rows.forEach((r, i) => {
      if (!Object.hasOwn(r, def.column!)) {
        missing++;
        return;
      }
      if (r[def.column!] === null) {
        nulls++;
        return;
      }
      if (!['sum', 'average', 'minimum', 'maximum'].includes(def.aggregation)) {
        values.push({ row: i, value: canonical(r[def.column!]), group: keyOf(r, def.groupBy) });
        return;
      }
      const n = numeric(r[def.column!]);
      if (!n) {
        invalid++;
        return;
      }
      values.push({ row: i, value: n.toFixed(), group: keyOf(r, def.groupBy) });
    });
  let result: string | null;
  switch (def.aggregation) {
    case 'count':
      result = String(rows.length);
      break;
    case 'count_distinct':
      result = String(
        new Set(
          rows
            .filter((r) => Object.hasOwn(r, def.column!) && r[def.column!] !== null)
            .map((r) => canonical(r[def.column!])),
        ).size,
      );
      break;
    case 'null_count':
      result = String(nulls);
      break;
    case 'duplicate_key_count': {
      const keys = def.keys ?? [def.column!];
      result = String(rows.length - new Set(rows.map((r) => keyOf(r, keys))).size);
      break;
    }
    default: {
      if (!values.length) {
        result = null;
        break;
      }
      const nums = values.map((v) => new Exact(v.value));
      if (def.aggregation === 'minimum')
        result = nums.reduce((a, b) => (a.lt(b) ? a : b)).toFixed();
      else if (def.aggregation === 'maximum')
        result = nums.reduce((a, b) => (a.gt(b) ? a : b)).toFixed();
      else {
        const sum = nums.reduce((a, b) => a.add(b), new Exact(0));
        result =
          def.aggregation === 'average'
            ? sum.div(nums.length).toSignificantDigits(40).toFixed()
            : sum.toFixed();
      }
    }
  }
  return {
    definition: def,
    value: result,
    missing,
    nulls,
    invalid,
    contributors: values,
    warnings:
      invalid || missing || nulls
        ? ['Excluded missing, null, and invalid numeric cells are counted separately.']
        : [],
  };
}
