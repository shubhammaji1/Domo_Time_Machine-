import { it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const run = (args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', ...args], {
    encoding: 'utf8',
    timeout: 15000,
  });
it('executes capture, inspect, diff and error exit codes through the CLI', async () => {
  const root = await mkdtemp(resolve('.artifacts/tmp/.demo-workspace-cli-'));
  const args = ['--workspace', root];
  try {
    expect(run([...args, 'init']).status).toBe(0);
    const capture = run([
      ...args,
      'capture',
      'examples/booking-reconciliation/bookings.csv',
      '--name',
      'before',
    ]);
    expect(capture.status).toBe(0);
    expect(JSON.parse(capture.stdout).rowCount).toBe(2);
    expect(run([...args, 'snapshots', 'inspect', 'before']).status).toBe(0);
    expect(
      run([...args, 'diff', 'before', 'before', '--key', 'Booking_ID', '--fail-on-change']).status,
    ).toBe(0);
    expect(run([...args, 'capture', 'missing.csv', '--name', 'missing']).status).toBe(2);
    expect(run(['--unknown-flag']).status).toBe(2);
    expect(run(['--help']).status).toBe(0);
    expect(run([...args, 'doctor']).status).toBe(0);
    expect(
      run([
        ...args,
        'validate',
        'before',
        '--column',
        'Fare',
        '--currency',
        'INR',
        '--expected',
        '8000',
      ]).status,
    ).toBe(0);
    const mismatch = run([
      ...args,
      'validate',
      'before',
      '--column',
      'Fare',
      '--currency',
      'INR',
      '--expected',
      '8001',
    ]);
    expect(mismatch.status).toBe(1);
    expect(JSON.parse(mismatch.stdout).difference).toBe('-1');
    expect(run([...args, '--format', 'text', 'schema', 'history']).stdout).toContain('snapshotId:');
    expect(run([...args, 'diff', 'before', 'before', '--format', 'text']).stdout).toContain(
      '2 unchanged',
    );
    expect(run([...args, 'schema', 'compare', 'before', 'before']).stdout.trim()).toBe('[]');
    expect(
      run([...args, 'capture', 'examples/booking-reconciliation/bookings.csv', '--name', 'before'])
        .status,
    ).toBe(2);
    expect(
      run([
        ...args,
        '--format',
        'invalid',
        'capture',
        'examples/booking-reconciliation/bookings.csv',
        '--name',
        'no-side-effect',
      ]).status,
    ).toBe(2);
    expect(JSON.parse(run([...args, 'snapshots', 'list']).stdout)).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
