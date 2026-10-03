// Compact markdown output: models read tables far better than raw API JSON, and it costs fewer tokens.
import { pctChange } from './analysis.js';

export function num(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return '-';
  const abs = Math.abs(v);
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (abs >= 1e4) return (v / 1e3).toFixed(1) + 'k';
  return v.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export const pct = (v: number | null, digits = 1) => (v === null ? 'new' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`);
export const rate = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;
export const delta = (cur: number, prev: number) => pct(pctChange(cur, prev));

export function table(headers: string[], rows: (string | number)[][]): string {
  if (!rows.length) return '_No rows._';
  const esc = (c: string | number) => String(c).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const numeric = /^[-+]?\$?[\d.,]+[%kM]?( |$)|^[-+]\d|^new$|^-$/;
  const align = headers.map((_, i) => i > 0 && rows.every(r => numeric.test(String(r[i] ?? '-'))));
  return [
    `| ${headers.join(' | ')} |`,
    `|${align.map(a => (a ? '---:' : '---')).join('|')}|`,
    ...rows.map(r => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n');
}

export const text = (...blocks: (string | false | undefined)[]) => ({
  content: [{ type: 'text' as const, text: blocks.filter(Boolean).join('\n\n') }],
});
