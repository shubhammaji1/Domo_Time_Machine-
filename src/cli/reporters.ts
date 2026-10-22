import { ensure } from '../core/model.js';
export function renderReport(value: unknown, format: string): string {
  ensure(format === 'json' || format === 'text', 'Report format must be json or text');
  if (format === 'json') return JSON.stringify(value, null, 2) + '\n';
  const lines: string[] = [];
  const terminalSafe = (text: string) =>
    text.replace(
      /[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
      (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
    );
  const visit = (current: unknown, prefix: string) => {
    if (Array.isArray(current)) {
      if (!current.length) lines.push(prefix + ': []');
      current.forEach((entry, i) => visit(entry, prefix + '[' + i + ']'));
    } else if (current && typeof current === 'object')
      Object.entries(current).forEach(([k, v]) => {
        if (v !== undefined) visit(v, prefix ? prefix + '.' + k : k);
      });
    else
      lines.push(
        JSON.stringify(prefix).slice(1, -1) +
          ': ' +
          (typeof current === 'string' ? JSON.stringify(current) : String(current)),
      );
  };
  visit(value, '');
  return terminalSafe(lines.join('\n')) + '\n';
}
