import { z } from 'zod';
import { digest, ensure, type Row } from '../core/model.js';
import { Exact, metric, numeric } from './index.js';

export const financialRuleSchema = z
  .object({
    column: z.string().min(1),
    currency: z.string().min(1),
    currencyColumn: z.string().min(1).default('Currency'),
    expected: z.string(),
    tolerance: z.string().default('0'),
  })
  .strict();
export type FinancialRule = z.input<typeof financialRuleSchema>;
/** A gate fails on excluded cells, currency mismatch, empty totals or unexpected amounts. */
export function validateFinancial(rows: Row[], rule: FinancialRule) {
  const parsed = financialRuleSchema.parse(rule);
  const expected = numeric(parsed.expected),
    tolerance = numeric(parsed.tolerance);
  ensure(
    expected && tolerance && !tolerance.isNegative(),
    'Financial expectation and nonnegative tolerance must be plain decimals',
  );
  let calculation: ReturnType<typeof metric> | null = null;
  const issues: string[] = [];
  try {
    calculation = metric(rows, {
      name: parsed.column,
      column: parsed.column,
      aggregation: 'sum',
      currency: parsed.currency,
      currencyColumn: parsed.currencyColumn,
    });
  } catch {
    issues.push('Required financial column or currency validation failed');
  }
  if (calculation?.missing || calculation?.nulls || calculation?.invalid)
    issues.push('Financial cells are missing, null or invalid');
  const actual = calculation?.value ?? null;
  const delta = actual === null ? null : new Exact(actual).sub(expected);
  if (actual === null) issues.push('Financial total is unavailable');
  if (delta && delta.abs().gt(tolerance))
    issues.push('Financial total differs from the configured expectation');
  return {
    schemaVersion: 1,
    rule: parsed,
    actual,
    difference: delta?.toFixed() ?? null,
    passed: issues.length === 0,
    issues,
    calculation,
    inputHash: digest(rows),
  };
}
