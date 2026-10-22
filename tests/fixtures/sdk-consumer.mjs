import assert from 'node:assert/strict';
import * as sdk from 'domo-time-machine';
const checks = [];
async function check(name, test) {
  try {
    await test();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, error: error.message });
  }
}
const snapshot = (rows) => ({
  rows,
  metadata: { id: sdk.digest(rows), schema: sdk.schemaOf(rows), dataCompleteness: 'complete' },
});
const scenario = (steps, output = 'out', assertions = []) => ({
  version: 1,
  name: 'consumer',
  inputs: { data: 'data' },
  steps,
  output,
  assertions,
});
await check('exact decimals and strict financial gates', () => {
  const rows = [
    { Fare: '0.1', Currency: 'INR' },
    { Fare: '0.2', Currency: 'INR' },
  ];
  assert.equal(sdk.metric(rows, { name: 'fare', column: 'Fare', aggregation: 'sum' }).value, '0.3');
  assert.equal(
    sdk.validateFinancial(rows, { column: 'Fare', currency: 'INR', expected: '0.30' }).passed,
    true,
  );
  assert.equal(
    sdk.validateFinancial([...rows, { Fare: null, Currency: 'INR' }], {
      column: 'Fare',
      currency: 'INR',
      expected: '0.3',
    }).passed,
    false,
  );
  assert.equal(
    sdk.validateFinancial([...rows, { Fare: '1', Currency: 'USD' }], {
      column: 'Fare',
      currency: 'INR',
      expected: '1.3',
    }).passed,
    false,
  );
});
await check('typed keys, missing fields, duplicate ambiguity and row-order invariance', () => {
  const a = snapshot([{ id: 'A', value: null }, { id: 'B' }]);
  const b = snapshot([
    { id: 'B', value: '' },
    { id: 'A', value: null },
  ]);
  const diff = sdk.compare(a, b, ['id']);
  assert.equal(diff.updated, 1);
  assert.equal(diff.unchanged, 1);
  const repeated = sdk.compare(
    snapshot([
      { id: 'A', value: 1 },
      { id: 'A', value: 2 },
    ]),
    snapshot([
      { id: 'A', value: 1 },
      { id: 'A', value: 3 },
    ]),
    ['id'],
  );
  assert.equal(repeated.status, 'ambiguous');
  assert.equal(repeated.updated, 0);
  assert.equal(sdk.compare(a, snapshot([...a.rows].reverse())).unchanged, 2);
});
await check('duplicate destination key mappings are rejected', () => {
  assert.throws(
    () =>
      sdk.compare(
        snapshot([{ a: 'x', b: 'x' }]),
        snapshot([{ key: 'x' }]),
        ['a', 'b'],
        ['key', 'key'],
      ),
    /key mapping/i,
  );
});
const inputs = {
  data: [
    { id: 'A', Fare: '5000' },
    { id: 'B', Fare: '3000' },
  ],
};
const total = scenario([
  {
    id: 'out',
    input: 'data',
    operation: 'aggregate',
    groupBy: [],
    measures: [{ column: 'Fare', operation: 'sum', as: 'total' }],
  },
]);
await check('replay assertions accept equivalent decimal spellings', () => {
  const run = sdk.replay(
    {
      ...total,
      assertions: [{ table: 'out', column: 'total', aggregation: 'sum', equals: '8000.00' }],
    },
    inputs,
  );
  assert.equal(run.passed, true);
});
await check('invalid numeric cells cannot silently pass replay totals', () => {
  assert.throws(
    () => sdk.replay(total, { data: [{ Fare: '5000' }, { Fare: 'not-an-amount' }] }),
    /invalid numeric/i,
  );
});
await check('replay preserves input data and is deterministic', () => {
  const before = sdk.digest(inputs);
  const first = sdk.replay(total, inputs);
  assert.equal(sdk.replay(total, inputs).outputHash, first.outputHash);
  assert.equal(sdk.digest(inputs), before);
  assert.equal(first.rows[0].total, '8000');
});
await check('replay validates limits and cancellation', () => {
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => sdk.replay(total, inputs, { signal: controller.signal }), /cancelled/i);
  assert.throws(() => sdk.replay(total, inputs, { maxRows: NaN }), /limit|options/i);
  assert.throws(
    () => sdk.replay(total, { data: [inputs.data[0]] }, { maxRows: 1.5 }),
    /limit|options/i,
  );
});
await check('reviewed capsules round trip with integrity verification', () => {
  const capsule = sdk.makeCapsule(total, inputs, { mode: 'synthetic', reviewed: true });
  assert.equal(sdk.replayCapsule(JSON.parse(JSON.stringify(capsule))).rows[0].total, '8000');
  const corrupt = structuredClone(capsule);
  corrupt.payload.inputs.data[0].Fare = '1';
  assert.throws(() => sdk.inspectCapsule(corrupt), /integrity/i);
});
await check(
  'capsule export rejects undeclared inputs instead of producing an unreplayable capsule',
  () => {
    assert.throws(
      () =>
        sdk.makeCapsule(
          total,
          { ...inputs, unrelated: [{ sensitive: 'synthetic-private' }] },
          { mode: 'synthetic', reviewed: true },
        ),
      /input/i,
    );
  },
);
await check('capsule inspection validates alias identity, not only alias count', () => {
  const capsule = sdk.makeCapsule(total, inputs, { mode: 'synthetic', reviewed: true });
  capsule.payload.inputs.wrong = capsule.payload.inputs.data;
  delete capsule.payload.inputs.data;
  capsule.checksum = sdk.digest(capsule.payload);
  assert.throws(() => sdk.inspectCapsule(capsule), /input/i);
});
console.log(JSON.stringify(checks));
process.exitCode = checks.some((c) => !c.passed) ? 1 : 0;
