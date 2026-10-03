import * as z from 'zod/v4';

export interface DateRange { start: string; end: string; }
export interface Periods { current: DateRange; previous: DateRange | null; label: string; }

export const PERIODS = ['last_7_days', 'last_14_days', 'last_28_days', 'last_90_days', 'this_month', 'last_month'] as const;

export const periodInput = {
  period: z.enum(PERIODS).default('last_7_days').describe('Reporting period. Ends yesterday (GA4/HubSpot) or 3 days ago (Search Console, which lags).'),
  compare: z.enum(['previous_period', 'previous_year', 'none']).default('previous_period').describe('What to compare against.'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Custom start date (YYYY-MM-DD). Overrides period.'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Custom end date (YYYY-MM-DD). Overrides period.'),
};

export type PeriodArgs = { period: (typeof PERIODS)[number]; compare: 'previous_period' | 'previous_year' | 'none'; start_date?: string; end_date?: string };

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const parse = (s: string) => new Date(`${s}T00:00:00Z`);
export const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * 864e5));
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5) + 1;

export function eachDay({ start, end }: DateRange): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** @param lagDays how many days before today the data is complete (1 = yesterday, 3 for Search Console). */
export function resolvePeriods(args: PeriodArgs, lagDays = 1, today = new Date()): Periods {
  const todayIso = iso(today);
  let current: DateRange;
  if (args.start_date && args.end_date) {
    current = { start: args.start_date, end: args.end_date };
  } else {
    const end = addDays(todayIso, -lagDays);
    const t = parse(todayIso);
    switch (args.period) {
      case 'this_month': current = { start: iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))), end }; break;
      case 'last_month': {
        const s = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
        const e = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
        current = { start: iso(s), end: iso(e) }; break;
      }
      default: {
        const n = Number(args.period.match(/\d+/)![0]);
        current = { start: addDays(end, -(n - 1)), end };
      }
    }
  }
  if (current.start > current.end) throw new Error(`start_date ${current.start} is after end_date ${current.end}`);
  const len = daysBetween(current.start, current.end);
  let previous: DateRange | null = null;
  if (args.compare === 'previous_period') previous = { start: addDays(current.start, -len), end: addDays(current.start, -1) };
  if (args.compare === 'previous_year') previous = { start: addDays(current.start, -364), end: addDays(current.end, -364) }; // 52 weeks keeps weekdays aligned
  return { current, previous, label: `${current.start} → ${current.end}${previous ? ` vs ${previous.start} → ${previous.end}` : ''}` };
}
