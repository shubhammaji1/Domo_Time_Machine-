import { it, expect } from 'vitest';
import { renderReport } from '../../src/cli/reporters.js';
it('escapes control characters in human-readable values and column names', () => {
  const output = renderReport({ ['key\u001b[31m']: 'value\u001b[2J\nother\u009b2J\u202e' }, 'text');
  expect(output).not.toContain('\u001b');
  expect(output).toContain('\\u001b');
  expect(output).not.toContain('\u009b');
  expect(output).toContain('\\u009b');
  expect(output).not.toContain('\u202e');
  expect(renderReport({ value: 'hello' }, 'json')).toContain('"value": "hello"');
  expect(() => renderReport({}, 'unsafe-format')).toThrow('format');
});
