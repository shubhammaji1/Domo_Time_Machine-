import { digest, type Snapshot } from '../core/model.js';
import { compare } from '../diff/index.js';
import { Exact, metric, type Metric } from '../metrics/index.js';
export function investigate(
  before: Snapshot,
  after: Snapshot,
  keys: string[],
  definitions: Metric[],
) {
  const diff = compare(before, after, keys);
  const metrics = definitions.map((def) => {
    const b = metric(before.rows, def),
      a = metric(after.rows, def);
    const delta = b.value !== null && a.value !== null ? new Exact(a.value).sub(b.value) : null;
    const grouped = new Map<string, InstanceType<typeof Exact>>();
    if (def.aggregation === 'sum') {
      for (const v of b.contributors)
        grouped.set(v.group, (grouped.get(v.group) ?? new Exact(0)).sub(v.value));
      for (const v of a.contributors)
        grouped.set(v.group, (grouped.get(v.group) ?? new Exact(0)).add(v.value));
    }
    return {
      name: def.name,
      before: b,
      after: a,
      absoluteChange: delta?.toFixed() ?? null,
      percentageChange:
        delta && b.value !== null && !new Exact(b.value).isZero()
          ? delta.div(new Exact(b.value).abs()).mul(100).toSignificantDigits(40).toFixed()
          : null,
      groupedContributions: [...grouped].map(([group, amount]) => ({
        group,
        change: amount.toFixed(),
      })),
      evidence: { beforeSnapshotId: before.metadata.id, afterSnapshotId: after.metadata.id },
    };
  });
  const findings = [];
  if (diff.duplicates.length)
    findings.push({
      id: 'TM-KEY-001',
      classification: 'observation',
      statement: 'Repeated business keys occur in captured records.',
      evidence: diff.duplicates,
      unknown: 'Whether repetition violates the intended business grain.',
    });
  if (diff.afterRows > diff.beforeRows && diff.duplicates.some((d) => d.side === 'after'))
    findings.push({
      id: 'TM-EXPANSION-001',
      classification: 'hypothesis',
      statement:
        'A one-to-many join could explain the increased row count. Snapshot evidence alone does not establish the transformation responsible.',
      evidence: { beforeRows: diff.beforeRows, afterRows: diff.afterRows },
      unknown: 'Actual transformation and source change history.',
    });
  for (const m of metrics)
    if (m.absoluteChange !== null && !new Exact(m.absoluteChange).isZero())
      findings.push({
        id: 'TM-METRIC-' + m.name,
        classification: 'observation',
        statement: `${m.name} changed by ${m.absoluteChange}.`,
        evidence: m.evidence,
        unknown: 'Business validity of contributing changes.',
      });
  const body = {
    schemaVersion: 1,
    diff,
    metrics,
    findings,
    limitations: [
      'Capture time is not source change time.',
      'Differences and join hypotheses do not establish financial correctness.',
    ],
  };
  return { ...body, reportHash: digest(body) };
}
