#!/usr/bin/env node
import { Command } from 'commander';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { dirname, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  Workspace,
  VERSION,
  compare,
  investigate,
  replay,
  scenarioSchema,
  makeCapsule,
  previewCapsule,
  readCapsule,
  replayCapsule,
  saveJson,
  regressionSource,
  ensure,
  limits,
  schemaHistory,
  compareSchemas,
  validateFinancial,
  captureOptions,
  DomoTimeMachineError,
} from '../index.js';
import { renderReport } from './reporters.js';

const cli = new Command()
  .name('domo-time-machine')
  .description('Travel Back. Reproduce the Failure. Prove the Fix. Offline dataset forensics.')
  .version(VERSION)
  .option('--workspace <path>', 'Local evidence directory', '.domo-time-machine')
  .option('--format <format>', 'json or text reports', 'json')
  .exitOverride();
cli.hook('preAction', () => {
  ensure(
    ['json', 'text'].includes(cli.opts<{ format: string }>().format),
    'Report format must be json or text',
  );
});
const workspace = () => new Workspace(cli.opts<{ workspace: string }>().workspace);
const print = (value: unknown): void => {
  process.stdout.write(renderReport(value, cli.opts<{ format: string }>().format));
};
const keys = (s?: string) =>
  s
    ? s
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    : [];
const specFile = async (file: string) => {
  ensure((await stat(file)).size <= limits.bytes, 'Scenario exceeds size limit');
  return scenarioSchema.parse(parseYaml(await readFile(file, 'utf8'), { maxAliasCount: 0 }));
};
const resolveInputs = async (spec: Awaited<ReturnType<typeof specFile>>) => {
  const inputs: Record<string, Awaited<ReturnType<Workspace['get']>>['rows']> = {};
  for (const [key, ref] of Object.entries(spec.inputs))
    inputs[key] = (await workspace().get(ref)).rows;
  return inputs;
};
cli
  .command('init')
  .description('Initialize private local evidence storage')
  .action(async () => {
    await workspace().init();
    print({ initialized: true, workspace: workspace().root });
  });
cli
  .command('capture <file>')
  .requiredOption('--name <name>')
  .option('--dataset <dataset>', 'Dataset grouping', 'local')
  .option('--key <columns>', 'Comma-separated business keys')
  .option('--completeness <value>', 'complete, sample, filtered, unknown', 'unknown')
  .option('--dry-run')
  .action(
    async (
      file: string,
      opts: { name: string; dataset: string; key?: string; completeness: string; dryRun?: boolean },
    ) => {
      if (opts.dryRun) {
        const s = await stat(file);
        print({ dryRun: true, bytes: s.size, name: opts.name });
        return;
      }
      print(
        await workspace().capture(
          file,
          captureOptions.parse({
            name: opts.name,
            datasetName: opts.dataset,
            keyColumns: keys(opts.key),
            dataCompleteness: opts.completeness,
          }),
        ),
      );
    },
  );
const snapshots = cli.command('snapshots');
snapshots.command('list').action(async () => print(await workspace().list()));
snapshots.command('inspect <ref>').action(async (ref: string) => {
  const s = await workspace().get(ref);
  print({ metadata: s.metadata, integrity: 'verified', preview: s.rows.slice(0, 20) });
});
cli
  .command('diff <before> <after>')
  .option('--key <columns>')
  .option('--after-key <columns>')
  .option('--fail-on-change')
  .option('--out <file>')
  .action(
    async (
      before: string,
      after: string,
      opts: {
        key?: string;
        afterKey?: string;
        failOnChange?: boolean;
        out?: string;
      },
    ) => {
      const result = compare(
        await workspace().get(before),
        await workspace().get(after),
        keys(opts.key),
        keys(opts.afterKey ?? opts.key),
      );
      if (opts.out) await saveJson(opts.out, result);
      const format = cli.opts<{ format: string }>().format;
      if (format === 'json') process.stdout.write(renderReport(result, 'json'));
      else
        console.log(
          `${result.added} added, ${result.removed} removed, ${result.updated} updated, ${result.unchanged} unchanged; ${result.status}`,
        );
      if (
        opts.failOnChange &&
        (result.added ||
          result.removed ||
          result.updated ||
          !result.comparisonComplete ||
          result.schemaChanges.length)
      )
        process.exitCode = 1;
    },
  );
cli
  .command('investigate <before> <after>')
  .option('--key <columns>')
  .option('--metric <column>')
  .option('--metrics <file>', 'JSON array of metric definitions')
  .option('--currency <unit>')
  .option('--currency-column <column>')
  .option('--out <file>')
  .action(
    async (
      before: string,
      after: string,
      opts: {
        key?: string;
        metric?: string;
        metrics?: string;
        currency?: string;
        currencyColumn?: string;
        out?: string;
      },
    ) => {
      const definitions = opts.metrics
        ? JSON.parse(await readFile(opts.metrics, 'utf8'))
        : opts.metric
          ? [
              {
                name: opts.metric,
                column: opts.metric,
                aggregation: 'sum',
                currency: opts.currency,
                currencyColumn: opts.currencyColumn,
                groupBy: keys(opts.key),
              },
            ]
          : [{ name: 'rows', aggregation: 'count' }];
      const result = investigate(
        await workspace().get(before),
        await workspace().get(after),
        keys(opts.key),
        definitions,
      );
      if (opts.out) await saveJson(opts.out, result);
      print(result);
    },
  );
cli
  .command('replay <scenario>')
  .option('--out <file>')
  .action(async (file: string, opts: { out?: string }) => {
    const spec = await specFile(file),
      result = replay(spec, await resolveInputs(spec));
    if (opts.out) await saveJson(opts.out, result);
    print(result);
    if (!result.passed) process.exitCode = 1;
  });
const capsule = cli.command('capsule');
capsule
  .command('create <scenario>')
  .option('--out <file>')
  .option('--reviewed', 'Confirm you reviewed every value in the preview')
  .option('--synthetic', 'Declare synthetic input data')
  .action(async (file: string, opts: { out?: string; reviewed?: boolean; synthetic?: boolean }) => {
    const spec = await specFile(file),
      inputs = await resolveInputs(spec);
    if (!opts.reviewed) {
      print(previewCapsule(spec, inputs));
      return;
    }
    ensure(opts.out, '--out is required for reviewed export');
    await saveJson(
      opts.out,
      makeCapsule(spec, inputs, {
        mode: opts.synthetic ? 'synthetic' : 'reviewed',
        reviewed: true,
      }),
    );
    print({ exported: opts.out });
  });
capsule.command('inspect <file>').action(async (file: string) => print(await readCapsule(file)));
capsule.command('replay <file>').action(async (file: string) => {
  const result = replayCapsule(await readCapsule(file));
  print(result);
  if (!result.passed) process.exitCode = 1;
});
capsule
  .command('regression <file>')
  .requiredOption('--out <file>')
  .action(async (file: string, opts: { out: string }) => {
    await readCapsule(file);
    const capsulePath = relative(dirname(resolve(opts.out)), resolve(file))
      .split(sep)
      .join('/');
    await writeFile(opts.out, regressionSource(capsulePath), {
      flag: 'wx',
      mode: 0o600,
      flush: true,
    });
    print({ exported: opts.out });
  });
cli.command('doctor').action(async () => {
  const result = await workspace().doctor();
  print({ ...result, node: process.version, offline: true });
  if (result.failures.length || result.orphans.length || result.pendingCaptures.length)
    process.exitCode = 1;
});
const schema = cli.command('schema').description('Compare schemas and inspect captured history');
schema
  .command('history')
  .option('--dataset <name>')
  .action(async (opts: { dataset?: string }) =>
    print(schemaHistory(await workspace().list(), opts.dataset)),
  );
schema
  .command('compare <before> <after>')
  .action(async (before: string, after: string) =>
    print(
      compareSchemas(
        (await workspace().get(before)).metadata.schema,
        (await workspace().get(after)).metadata.schema,
      ),
    ),
  );
cli
  .command('validate <snapshot>')
  .requiredOption('--column <column>')
  .requiredOption('--currency <currency>')
  .option('--currency-column <column>', 'Currency field', 'Currency')
  .requiredOption('--expected <amount>')
  .option('--tolerance <amount>', 'Absolute decimal tolerance', '0')
  .action(
    async (
      ref: string,
      opts: {
        column: string;
        currency: string;
        currencyColumn: string;
        expected: string;
        tolerance: string;
      },
    ) => {
      const result = validateFinancial((await workspace().get(ref)).rows, opts);
      print(result);
      if (!result.passed) process.exitCode = 1;
    },
  );
try {
  await cli.parseAsync();
} catch (error) {
  const code = (error as { code?: string }).code;
  if (code === 'commander.helpDisplayed' || code === 'commander.version') process.exitCode = 0;
  else {
    const fileCode = (error as NodeJS.ErrnoException).code;
    const diagnostic =
      error instanceof DomoTimeMachineError
        ? error.message
        : error instanceof z.ZodError
          ? 'Invalid configuration or replay definition. Check field names and supported operations with --help.'
          : error instanceof SyntaxError
            ? 'Invalid JSON or scenario syntax. Check UTF-8 encoding and file format.'
            : fileCode === 'ENOENT'
              ? 'File or snapshot not found. Check the input path and capture name.'
              : fileCode === 'EEXIST'
                ? 'Output already exists. Choose a new output path; existing evidence is never overwritten.'
                : 'Operation failed. Check arguments, file format, snapshot integrity, privacy review, and configured limits.';
    process.stderr.write(renderReport({ 'Operation failed': diagnostic }, 'text'));
    process.exitCode = 2;
  }
}
