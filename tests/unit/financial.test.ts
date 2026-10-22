import { it, expect } from 'vitest';
import { validateFinancial, schemaHistory, schemaOf, compareSchemas } from '../../src/index.js';
it('validates exact totals and explicit tolerance, never approves partial amounts', () => {
  const rule = { column: 'amount', currency: 'INR', expected: '0.3' };
  expect(
    validateFinancial(
      [
        { amount: '0.1', Currency: 'INR' },
        { amount: '0.2', Currency: 'INR' },
      ],
      rule,
    ).passed,
  ).toBe(true);
  expect(
    validateFinancial([{ amount: '0.31', Currency: 'INR' }], { ...rule, tolerance: '0.01' }).passed,
  ).toBe(true);
  for (const row of [
    { amount: null, Currency: 'INR' },
    { Currency: 'INR' },
    { amount: '', Currency: 'INR' },
    { amount: '0.3', Currency: 'USD' },
  ])
    expect(validateFinancial([row], rule).passed).toBe(false);
  expect(validateFinancial([], rule).passed).toBe(false);
  expect(() => validateFinancial([], { ...rule, tolerance: '-1' })).toThrow();
});
it('records type and nullability evolution without inferring a rename', () => {
  const changes = compareSchemas(
    schemaOf([{ amount: 1 }]),
    schemaOf([{ amount: null }, { amount: '1' }]),
  );
  expect(changes[0]).toMatchObject({
    kind: 'changed',
    before: { types: ['number'], nullable: false },
    after: { types: ['string'], nullable: true },
  });
  expect(schemaHistory([], 'absent')).toEqual([]);
});
