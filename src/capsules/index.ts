import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { isAbsolute, win32 } from 'node:path';
import {
  canonical,
  digest,
  ensure,
  limits,
  validateRow,
  VERSION,
  type Row,
} from '../core/model.js';
import { replay, scenarioSchema } from '../replay/index.js';

const payloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    softwareVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
    privacy: z
      .object({
        mode: z.enum(['synthetic', 'reviewed']),
        reviewed: z.literal(true),
        includedColumns: z.record(z.array(z.string())),
      })
      .strict(),
    scenario: scenarioSchema,
    inputs: z.record(
      z
        .array(z.record(z.union([z.string(), z.number().finite(), z.boolean(), z.null()])))
        .max(limits.rows),
    ),
    expectedOutputHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type CapsulePayload = z.infer<typeof payloadSchema>;
// JSON is the portable container: no extraction paths, executables or compression.
export function previewCapsule(spec: unknown, inputs: Record<string, Row[]>) {
  const scenario = scenarioSchema.parse(spec);
  ensure(
    Object.keys(scenario.inputs).length === Object.keys(inputs).length &&
      Object.keys(scenario.inputs).every((key) => Object.hasOwn(inputs, key)),
    'Capsule inputs must exactly match the declared scenario inputs',
  );
  return {
    scenario,
    inputs,
    includedColumns: Object.fromEntries(
      Object.entries(inputs).map(([name, rows]) => [
        name,
        [...new Set(rows.flatMap(Object.keys))].sort(),
      ]),
    ),
    warning:
      'Review every included value and identifier. Redaction alone does not guarantee anonymity.',
  };
}
export function makeCapsule(
  spec: unknown,
  inputs: Record<string, Row[]>,
  privacy: { mode: 'synthetic' | 'reviewed'; reviewed: boolean },
) {
  ensure(privacy.reviewed === true, 'Capsule export requires deliberate privacy review');
  const preview = previewCapsule(spec, inputs);
  const run = replay(spec, inputs);
  const payload = payloadSchema.parse({
    schemaVersion: 1,
    softwareVersion: VERSION,
    privacy: { ...privacy, includedColumns: preview.includedColumns },
    scenario: preview.scenario,
    inputs,
    expectedOutputHash: run.outputHash,
  });
  return { payload, checksum: digest(payload) };
}
export function inspectCapsule(value: unknown) {
  const envelope = z
    .object({ payload: payloadSchema, checksum: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .parse(value);
  ensure(digest(envelope.payload) === envelope.checksum, 'Capsule integrity failure');
  for (const rows of Object.values(envelope.payload.inputs)) rows.forEach(validateRow);
  // All references are logical names. Capsules cannot reference files on this machine.
  ensure(
    Object.keys(envelope.payload.scenario.inputs).length ===
      Object.keys(envelope.payload.inputs).length &&
      Object.keys(envelope.payload.scenario.inputs).every((key) =>
        Object.hasOwn(envelope.payload.inputs, key),
      ),
    'Capsule input mismatch',
  );
  const columns = Object.fromEntries(
    Object.entries(envelope.payload.inputs).map(([key, rows]) => [
      key,
      [...new Set(rows.flatMap(Object.keys))].sort(),
    ]),
  );
  ensure(
    digest(columns) === digest(envelope.payload.privacy.includedColumns),
    'Capsule input column manifest mismatch',
  );
  return envelope;
}
export async function readCapsule(file: string | URL) {
  const { stat } = await import('node:fs/promises');
  ensure((await stat(file)).size <= limits.bytes, 'Capsule exceeds 64 MiB limit');
  return inspectCapsule(JSON.parse(await readFile(file, 'utf8')));
}
export function replayCapsule(value: unknown) {
  const { payload } = inspectCapsule(value);
  const result = replay(payload.scenario, payload.inputs);
  ensure(
    result.outputHash === payload.expectedOutputHash,
    'Capsule output differs from expected observation',
  );
  return { ...result, capsuleProducerVersion: payload.softwareVersion };
}
export async function saveJson(file: string, value: unknown) {
  const content = canonical(value) + '\n';
  ensure(Buffer.byteLength(content) <= limits.bytes, 'Export exceeds 64 MiB limit');
  await writeFile(file, content, { flag: 'wx', mode: 0o600, flush: true });
}
export function regressionSource(capsuleName: string): string {
  ensure(
    capsuleName.length > 0 &&
      /\.json$/i.test(capsuleName) &&
      !/[\0\r\n]/.test(capsuleName) &&
      !isAbsolute(capsuleName) &&
      !win32.isAbsolute(capsuleName) &&
      !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(capsuleName),
    'Regression capsule must be a relative JSON file path',
  );
  return `import { dirname, resolve } from 'node:path';\nimport { fileURLToPath } from 'node:url';\nimport { readCapsule, replayCapsule } from 'domo-time-machine';\nconst capsule = resolve(dirname(fileURLToPath(import.meta.url)), ${JSON.stringify(capsuleName)});\nconst result = replayCapsule(await readCapsule(capsule));\nif (!result.passed) throw new Error('Regression assertions failed');\nconsole.log('Capsule reproduced', result.outputHash);\n`;
}
