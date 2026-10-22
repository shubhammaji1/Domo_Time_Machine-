import { z } from 'zod';
import {
  canonical,
  digest,
  ensure,
  keyOf,
  limits,
  requireColumns,
  validateRow,
  VERSION,
  type Row,
} from '../core/model.js';
import { Exact, metric, numeric, metricSchema } from '../metrics/index.js';

const name = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const base = { id: name };
const unary = { ...base, input: name };
const column = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) => !['__proto__', 'constructor', 'prototype'].includes(value),
    'Reserved column name',
  );
const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
export const stepSchema = z.discriminatedUnion('operation', [
  z.object({ ...unary, operation: z.literal('select'), columns: z.array(column).min(1) }).strict(),
  z.object({ ...unary, operation: z.literal('rename'), columns: z.record(column) }).strict(),
  z
    .object({
      ...unary,
      operation: z.literal('filter'),
      column,
      operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_missing']),
      value: scalar.optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.enum(['left_join', 'inner_join']),
      left: name,
      right: name,
      on: z.array(z.object({ left: column, right: column }).strict()).min(1),
    })
    .strict(),
  z
    .object({
      ...unary,
      operation: z.literal('aggregate'),
      groupBy: z.array(column),
      measures: z
        .array(
          z
            .object({
              column: column.optional(),
              operation: metricSchema.shape.aggregation,
              as: column,
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z
    .object({ ...unary, operation: z.literal('deduplicate'), keys: z.array(column).min(1) })
    .strict(),
  z
    .object({
      ...unary,
      operation: z.literal('sort'),
      columns: z.array(column).min(1),
      descending: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      ...unary,
      operation: z.literal('derive'),
      as: column,
      left: column,
      right: z.union([z.object({ column }).strict(), z.object({ value: z.string() }).strict()]),
      operator: z.enum(['add', 'subtract', 'multiply', 'divide']),
    })
    .strict(),
]);
export const scenarioSchema = z
  .object({
    version: z.literal(1),
    name,
    inputs: z.record(name, z.string().min(1)),
    steps: z.array(stepSchema).min(1).max(limits.steps),
    output: name,
    assertions: z
      .array(
        z
          .object({
            table: name,
            column: column.optional(),
            aggregation: metricSchema.shape.aggregation,
            equals: z.string(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export type Scenario = z.input<typeof scenarioSchema>;
export function replay(
  specification: unknown,
  inputs: Record<string, Row[]>,
  options: { signal?: AbortSignal; maxRows?: number; milliseconds?: number } = {},
) {
  const spec = scenarioSchema.parse(specification);
  ensure(
    options.maxRows === undefined ||
      (Number.isSafeInteger(options.maxRows) && options.maxRows >= 0),
    'Invalid replay row limit options',
  );
  ensure(
    options.milliseconds === undefined ||
      (Number.isFinite(options.milliseconds) && options.milliseconds >= 0),
    'Invalid replay time limit options',
  );
  const maxRows = Math.min(options.maxRows ?? limits.outputRows, limits.outputRows);
  const deadline =
    Date.now() + Math.min(options.milliseconds ?? limits.milliseconds, limits.milliseconds);
  const check = () => {
    ensure(!options.signal?.aborted, 'Replay cancelled');
    ensure(Date.now() <= deadline, 'Replay time limit exceeded');
  };
  const tables = new Map<string, Row[]>();
  for (const key of Object.keys(spec.inputs)) {
    ensure(Object.hasOwn(inputs, key), `Missing replay input: ${key}`);
    ensure(inputs[key]!.length <= maxRows, 'Input row limit exceeded');
    tables.set(key, inputs[key]!.map(validateRow));
  }
  const counts: {
    id: string;
    operation: string;
    rows: number;
    inputRows: number;
    expansionFactor?: string;
  }[] = [];
  const warnings: string[] = [];
  const get = (id: string) => {
    const t = tables.get(id);
    ensure(t, `Unknown or forward table reference: ${id}`);
    return t;
  };
  for (const step of spec.steps) {
    check();
    ensure(!tables.has(step.id), 'Duplicate table identifier');
    const out: Row[] = [];
    const input = 'input' in step ? get(step.input) : get(step.left);
    const append = (row: Row) => {
      check();
      ensure(out.length < maxRows, 'Replay output row limit exceeded');
      out.push(validateRow(row));
    };
    switch (step.operation) {
      case 'select':
        requireColumns(input, step.columns);
        for (const r of input)
          append(
            Object.fromEntries(
              step.columns.filter((c) => Object.hasOwn(r, c)).map((c) => [c, r[c]!]),
            ),
          );
        break;
      case 'rename': {
        requireColumns(input, Object.keys(step.columns));
        const names = [...new Set(input.flatMap(Object.keys))].map((c) =>
          Object.hasOwn(step.columns, c) ? step.columns[c]! : c,
        );
        ensure(new Set(names).size === names.length, 'Rename column collision');
        for (const r of input)
          append(
            Object.fromEntries(
              Object.entries(r).map(([c, v]) => [
                Object.hasOwn(step.columns, c) ? step.columns[c]! : c,
                v,
              ]),
            ),
          );
        break;
      }
      case 'filter': {
        requireColumns(input, [step.column]);
        ensure(
          ['is_null', 'is_missing'].includes(step.operator) || Object.hasOwn(step, 'value'),
          'Filter requires a value',
        );
        for (const r of input) {
          check();
          const v = r[step.column];
          let pass = false;
          switch (step.operator) {
            case 'is_missing':
              pass = !Object.hasOwn(r, step.column);
              break;
            case 'is_null':
              pass = v === null;
              break;
            case 'eq':
              pass = Object.hasOwn(r, step.column) && canonical(v) === canonical(step.value);
              break;
            case 'ne':
              pass = Object.hasOwn(r, step.column) && canonical(v) !== canonical(step.value);
              break;
            default: {
              const a = numeric(v),
                b = numeric(step.value);
              ensure(a && b, 'Numeric filter contains nonnumeric value');
              const cmp = a.cmp(b);
              pass =
                step.operator === 'gt'
                  ? cmp > 0
                  : step.operator === 'gte'
                    ? cmp >= 0
                    : step.operator === 'lt'
                      ? cmp < 0
                      : cmp <= 0;
            }
          }
          if (pass) append(r);
        }
        break;
      }
      case 'left_join':
      case 'inner_join': {
        const right = get(step.right);
        const lk = step.on.map((o) => o.left),
          rk = step.on.map((o) => o.right);
        requireColumns(input, lk);
        requireColumns(right, rk);
        const leftNames = new Set(input.flatMap(Object.keys));
        const rightNames = [...new Set(right.flatMap(Object.keys))];
        const mapping = rightNames.map((c) => [c, leftNames.has(c) ? c + '_right' : c] as const);
        ensure(
          new Set([...leftNames, ...mapping.map((m) => m[1])]).size ===
            leftNames.size + mapping.length,
          'Join output column collision',
        );
        const index = new Map<string, Row[]>();
        for (const r of right) {
          check();
          if (rk.some((c) => r[c] === null || !Object.hasOwn(r, c))) continue;
          const k = keyOf(r, rk);
          const g = index.get(k) ?? [];
          g.push(r);
          index.set(k, g);
        }
        for (const r of input) {
          check();
          const matches = lk.some((c) => r[c] === null || !Object.hasOwn(r, c))
            ? []
            : (index.get(keyOf(r, lk)) ?? []);
          if (!matches.length && step.operation === 'left_join')
            append({ ...r, ...Object.fromEntries(mapping.map(([, dest]) => [dest, null])) });
          for (const match of matches)
            append({
              ...r,
              ...Object.fromEntries(
                mapping
                  .filter(([src]) => Object.hasOwn(match, src))
                  .map(([src, dest]) => [dest, match[src]!]),
              ),
            });
        }
        break;
      }
      case 'aggregate': {
        requireColumns(input, [
          ...step.groupBy,
          ...step.measures.flatMap((m) => (m.column ? [m.column] : [])),
        ]);
        ensure(
          new Set([...step.groupBy, ...step.measures.map((m) => m.as)]).size ===
            step.groupBy.length + step.measures.length,
          'Aggregate column collision',
        );
        const groups = new Map<string, Row[]>();
        if (!step.groupBy.length) groups.set('[]', []);
        for (const r of input) {
          check();
          const k = keyOf(r, step.groupBy);
          const g = groups.get(k) ?? [];
          g.push(r);
          groups.set(k, g);
        }
        for (const group of groups.values()) {
          const row: Row = Object.fromEntries(
            step.groupBy
              .filter((c) => Object.hasOwn(group[0] ?? {}, c))
              .map((c) => [c, group[0]![c]!]),
          );
          for (const m of step.measures) {
            const calculation = metric(group, {
              name: m.as,
              column: m.column,
              aggregation: m.operation,
            });
            ensure(
              !calculation.invalid,
              `Invalid numeric cells in replay step ${step.id}, measure ${m.as}`,
            );
            if (calculation.missing || calculation.nulls)
              warnings.push(
                `Step ${step.id}, measure ${m.as}: ${calculation.missing} missing and ${calculation.nulls} null cells excluded`,
              );
            row[m.as] = calculation.value;
          }
          append(row);
        }
        break;
      }
      case 'deduplicate': {
        requireColumns(input, step.keys);
        const seen = new Set<string>();
        for (const r of input) {
          check();
          const k = keyOf(r, step.keys);
          if (!seen.has(k)) {
            seen.add(k);
            append(r);
          }
        }
        break;
      }
      case 'sort': {
        requireColumns(input, step.columns);
        const sorted = [...input].sort((a, b) => {
          check();
          const l = keyOf(a, step.columns),
            r = keyOf(b, step.columns);
          return (l < r ? -1 : l > r ? 1 : 0) * (step.descending ? -1 : 1);
        });
        sorted.forEach(append);
        break;
      }
      case 'derive': {
        requireColumns(input, [step.left, ...('column' in step.right ? [step.right.column] : [])]);
        ensure(!input.some((r) => Object.hasOwn(r, step.as)), 'Derived column collision');
        for (const r of input) {
          const a = numeric(r[step.left]),
            b = numeric('column' in step.right ? r[step.right.column] : step.right.value);
          ensure(a && b, 'Derived expression requires numeric operands');
          ensure(step.operator !== 'divide' || !b.isZero(), 'Division by zero');
          const n =
            step.operator === 'add'
              ? a.add(b)
              : step.operator === 'subtract'
                ? a.sub(b)
                : step.operator === 'multiply'
                  ? a.mul(b)
                  : a.div(b).toSignificantDigits(40);
          append({ ...r, [step.as]: n.toFixed() });
        }
        break;
      }
    }
    tables.set(step.id, out);
    counts.push({
      id: step.id,
      operation: step.operation,
      rows: out.length,
      inputRows: input.length,
      ...(['left_join', 'inner_join'].includes(step.operation) && input.length
        ? { expansionFactor: new Exact(out.length).div(input.length).toFixed() }
        : {}),
    });
  }
  const rows = get(spec.output);
  const assertions = spec.assertions.map((a) => {
    const calculation = metric(get(a.table), {
      name: 'assertion',
      column: a.column,
      aggregation: a.aggregation,
    });
    const actual = calculation.value;
    const expected = numeric(a.equals);
    ensure(expected, 'Replay assertion expected value must be a supported plain decimal');
    return {
      ...a,
      actual,
      excluded: {
        missing: calculation.missing,
        nulls: calculation.nulls,
        invalid: calculation.invalid,
      },
      passed: !calculation.invalid && actual !== null && new Exact(actual).eq(expected),
    };
  });
  return {
    schemaVersion: 1,
    engine: 'dtm-reference',
    engineVersion: VERSION,
    runtime: process.version,
    settings: {
      decimalPrecision: 120,
      divisionSignificantDigits: 40,
      sort: 'typed-canonical-codepoint',
      nullJoinKeys: 'never-match',
      deduplicate: 'first-input-row',
    },
    inputReferences: spec.inputs,
    inputHashes: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, digest(v)])),
    definition: spec,
    rows,
    steps: counts,
    assertions,
    warnings,
    passed: assertions.every((a) => a.passed),
    outputHash: digest(rows),
    limitations: [
      'Supported DSL only; not a Magic ETL emulator.',
      'Deduplication requires explicit business approval; legitimate ticket charges may need separate accounting rules.',
    ],
  };
}
