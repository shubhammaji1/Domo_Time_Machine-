import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { artifactDirectory } from './artifacts.mjs';
import {
  Workspace,
  replay,
  investigate,
  metric,
  makeCapsule,
  replayCapsule,
  saveJson,
  regressionSource,
} from '../src/index.js';
const root = await mkdtemp(join(artifactDirectory('demos'), 'booking-'));
const workspace = new Workspace(root);
await workspace.init();
const example = 'examples/booking-reconciliation/';
await workspace.capture(example + 'bookings.csv', {
  name: 'bookings',
  datasetName: 'Booking reconciliation',
  keyColumns: ['Booking_ID'],
  dataCompleteness: 'complete',
});
await workspace.capture(example + 'tickets.ndjson', {
  name: 'tickets',
  datasetName: 'Ticket history',
  dataCompleteness: 'complete',
});
const bookings = await workspace.get('bookings'),
  tickets = await workspace.get('tickets');
const inputs = { bookings: bookings.rows, tickets: tickets.rows };
const faultySpec = parse(await readFile(example + 'faulty.yaml', 'utf8'));
const candidateSpec = parse(await readFile(example + 'candidate.yaml', 'utf8'));
const baseline = replay(faultySpec, inputs),
  candidate = replay(candidateSpec, inputs);
if (!baseline.passed || !candidate.passed) throw new Error('Demo assertions failed');
await saveJson(join(root, 'faulty.json'), baseline.rows);
await saveJson(join(root, 'candidate.json'), candidate.rows);
await workspace.capture(join(root, 'faulty.json'), {
  name: 'faulty',
  datasetName: 'Booking reconciliation',
  dataCompleteness: 'complete',
});
await workspace.capture(join(root, 'candidate.json'), {
  name: 'candidate',
  datasetName: 'Booking reconciliation',
  dataCompleteness: 'complete',
});
const report = investigate(
  bookings,
  await workspace.get('faulty'),
  ['Booking_ID'],
  [
    {
      name: 'booking_fare',
      column: 'Fare',
      aggregation: 'sum',
      currency: 'INR',
      currencyColumn: 'Currency',
      groupBy: ['Booking_ID'],
    },
  ],
);
await saveJson(join(root, 'investigation.json'), report);
// The repository fixtures are synthetic; this declaration is deliberate.
const capsule = makeCapsule(candidateSpec, inputs, { mode: 'synthetic', reviewed: true });
await saveJson(join(root, 'incident.capsule.json'), capsule);
const freshRoot = await mkdtemp(join(root, 'fresh-'));
await writeFile(join(freshRoot, 'incident.capsule.json'), JSON.stringify(capsule));
const imported = JSON.parse(await readFile(join(freshRoot, 'incident.capsule.json'), 'utf8'));
const reproduced = replayCapsule(imported);
if (reproduced.outputHash !== candidate.outputHash || !reproduced.passed)
  throw new Error('Portable replay failed');
await writeFile(join(root, 'regression.mjs'), regressionSource('incident.capsule.json'));
const total = (rows: typeof inputs.bookings) =>
  metric(rows, { name: 'Fare', column: 'Fare', aggregation: 'sum' }).value;
console.log(
  JSON.stringify(
    {
      workspace: root,
      freshEnvironment: freshRoot,
      expected: total(bookings.rows),
      faulty: total(baseline.rows),
      candidate: total(candidate.rows),
      retainedTicketCount: metric(candidate.rows, {
        name: 'tickets',
        column: 'TicketCount',
        aggregation: 'sum',
      }).value,
      expansion: baseline.steps,
      affected: report.diff.duplicates,
      portableReplay: reproduced.passed,
      caution:
        'Booking-level fare is assumed. Ticket charges, cancellations, and reissues need separate rules.',
    },
    null,
    2,
  ),
);
