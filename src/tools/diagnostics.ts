import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { groupSum, median } from '../lib/analysis.js';
import { PERIODS, addDays, eachDay, iso, parse, periodInput, resolvePeriods, type DateRange, type PeriodArgs } from '../lib/dates.js';
import { delta, num, rate, table, text } from '../lib/format.js';
import type { Sources } from '../sources/types.js';
import { HS_SOURCE_TO_CHANNEL, READ_ONLY, demoNote, settle } from './shared.js';

const SPARK = '▁▂▃▄▅▆▇█';
export function sparkline(values: number[]): string {
  const lo = Math.min(...values), hi = Math.max(...values);
  return values.map(v => SPARK[hi === lo ? 3 : Math.round(((v - lo) / (hi - lo)) * 7)]).join('');
}

type Series = { name: string; points: { date: string; value: number }[] };

/** Weekday-adjusted robust z-scores: each day vs the median of the same weekday in the window. */
function weekdayAnomalies(s: Series, recentDays: number, threshold: number) {
  const byDow = new Map<number, number[]>();
  for (const p of s.points) { const w = parse(p.date).getUTCDay(); byDow.set(w, [...(byDow.get(w) ?? []), p.value]); }
  const resid = s.points.map(p => {
    const exp = median(byDow.get(parse(p.date).getUTCDay()) ?? []);
    return { ...p, expected: exp, r: exp > 0 ? p.value / exp - 1 : 0 };
  });
  const med = median(resid.map(x => x.r));
  const mad = median(resid.map(x => Math.abs(x.r - med))) || 1e-6;
  const cutoff = s.points.length ? addDays(s.points[s.points.length - 1].date, -(recentDays - 1)) : '';
  return resid.map(x => ({ ...x, z: (0.6745 * (x.r - med)) / mad })).filter(x => x.date >= cutoff && Math.abs(x.z) >= threshold);
}

export function registerDiagnostics(server: McpServer, sources: Sources) {
  server.registerTool('detect_anomalies', {
    title: 'Detect anomalies',
    description: 'Scans daily GA4 sessions, key events, conversion rate, organic clicks and HubSpot contacts for unusual days (weekday-adjusted) and week-over-week level shifts. Use for "anything weird lately?" or before a weekly report.',
    inputSchema: z.object({
      days: z.number().int().min(21).max(120).default(42).describe('History window (more history = better baseline).'),
      recent_days: z.number().int().min(1).max(30).default(14).describe('Only report anomalies in the last N days.'),
      sensitivity: z.enum(['low', 'normal', 'high']).default('normal'),
    }),
    annotations: READ_ONLY,
  }, async ({ days, recent_days, sensitivity }: { days: number; recent_days: number; sensitivity: 'low' | 'normal' | 'high' }) => {
    const threshold = { low: 4, normal: 3, high: 2.2 }[sensitivity];
    const yesterday = addDays(iso(new Date()), -1);
    const range: DateRange = { start: addDays(yesterday, -(days - 1)), end: yesterday };
    const gscRange: DateRange = { start: addDays(range.start, -2), end: addDays(yesterday, -2) };
    const errors: string[] = [];
    const series: Series[] = [];

    if (sources.ga4) {
      const rows = await settle('GA4', () => sources.ga4!.report({ range, dimensions: ['date'], metrics: ['sessions', 'keyEvents'] }), errors);
      if (rows) {
        const m = new Map(rows.map(r => [String(r.date), r]));
        const pts = (f: (r: Record<string, string | number> | undefined) => number) => eachDay(range).map(d => ({ date: d, value: f(m.get(d)) }));
        series.push({ name: 'GA4 sessions', points: pts(r => Number(r?.sessions ?? 0)) });
        series.push({ name: 'GA4 key events', points: pts(r => Number(r?.keyEvents ?? 0)) });
        series.push({ name: 'GA4 key event rate', points: pts(r => (Number(r?.sessions) ? Number(r?.keyEvents) / Number(r?.sessions) : 0)) });
      }
    }
    if (sources.gsc) {
      const rows = await settle('Search Console', () => sources.gsc!.query({ range: gscRange, dimensions: ['date'], limit: 500 }), errors);
      if (rows) { const m = new Map(rows.map(r => [r.keys[0], r.clicks])); series.push({ name: 'Organic clicks', points: eachDay(gscRange).map(d => ({ date: d, value: m.get(d) ?? 0 })) }); }
    }
    if (sources.hubspot) {
      const res = await settle('HubSpot', () => sources.hubspot!.contacts(range), errors);
      if (res) { const m = groupSum(res.rows, r => r.createdate.slice(0, 10), () => 1); series.push({ name: 'HubSpot new contacts', points: eachDay(range).map(d => ({ date: d, value: m.get(d) ?? 0 })) }); }
    }

    const flags = series.flatMap(s => weekdayAnomalies(s, recent_days, threshold).map(a => ({ metric: s.name, ...a, isRate: s.name.includes('rate') })))
      .sort((a, b) => b.date.localeCompare(a.date));
    const shifts = series.map(s => {
      const v = s.points.map(p => p.value);
      const last7 = v.slice(-7).reduce((a, b) => a + b, 0), prev7 = v.slice(-14, -7).reduce((a, b) => a + b, 0);
      return { name: s.name, last7, prev7, change: prev7 ? last7 / prev7 - 1 : 0, spark: sparkline(v.slice(-28)), isRate: s.name.includes('rate') };
    });

    return text(demoNote(sources), `### Anomaly scan: ${range.start} → ${range.end}`,
      '#### Trend (last 28 days) and week-over-week', table(['Metric', 'Last 28 days', 'Last 7 vs prior 7', 'Flag'],
        shifts.map(s => [s.name, s.spark, s.isRate ? `${rate(s.last7 / 7)} vs ${rate(s.prev7 / 7)}` : `${num(s.last7)} vs ${num(s.prev7)} (${delta(s.last7, s.prev7)})`, Math.abs(s.change) >= 0.2 ? (s.change < 0 ? '🔻 level drop' : '🔺 level jump') : '✓'])),
      `#### Unusual days (last ${recent_days} days, weekday-adjusted)`,
      flags.length ? table(['Date', 'Metric', 'Actual', 'Typical for weekday', 'Score'],
        flags.slice(0, 20).map(f => [f.date, f.metric, f.isRate ? rate(f.value) : num(f.value), f.isRate ? rate(f.expected) : num(f.expected), `${f.z > 0 ? '+' : ''}${f.z.toFixed(1)}`])) : '_No unusual days._',
      errors.length ? `**Warnings**\n${errors.map(e => `- ${e}`).join('\n')}` : '',
      flags.length || shifts.some(s => Math.abs(s.change) >= 0.2) ? 'Next: run `explain_change` for the flagged metric to find the cause.' : '');
  });

  server.registerTool('check_tracking_health', {
    title: 'Check tracking health',
    description: 'Is the data trustworthy? Reconciles GA4 key events with HubSpot new contacts (day by day and by channel), checks Unassigned / (not set) traffic, and finds pages that still get traffic but stopped converting (broken form or tag).',
    inputSchema: z.object({ ...periodInput, period: z.enum(PERIODS).default('last_14_days').describe('Reporting period.') }),
    annotations: READ_ONLY,
  }, async (args: PeriodArgs) => {
    const p = resolvePeriods({ ...args, compare: args.compare === 'none' ? 'previous_period' : args.compare });
    const checks: [string, string, string][] = []; // status, check, detail
    const out: string[] = [demoNote(sources), `### Tracking health: ${p.label}`];

    if (sources.ga4) {
      const ga4 = sources.ga4;
      const [byCh, byPage, byPageP] = await Promise.all([
        ga4.report({ range: p.current, dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions', 'keyEvents'] }),
        ga4.report({ range: p.current, dimensions: ['landingPage', 'deviceCategory'], metrics: ['sessions', 'keyEvents'] }),
        ga4.report({ range: p.previous!, dimensions: ['landingPage', 'deviceCategory'], metrics: ['sessions', 'keyEvents'] }),
      ]);
      const totalS = byCh.reduce((s, r) => s + Number(r.sessions), 0) || 1;
      const unassigned = byCh.filter(r => /unassigned|\(not set\)/i.test(String(r.sessionDefaultChannelGroup))).reduce((s, r) => s + Number(r.sessions), 0) / totalS;
      checks.push([unassigned > 0.05 ? '⚠️' : '✅', 'Unassigned / (not set) channel share', `${rate(unassigned, 1)} of sessions${unassigned > 0.05 ? ': fix UTMs and channel group rules' : ''}`]);
      const notSet = byPage.filter(r => /\(not set\)/.test(String(r.landingPage))).reduce((s, r) => s + Number(r.sessions), 0) / totalS;
      checks.push([notSet > 0.05 ? '⚠️' : '✅', '(not set) landing pages', `${rate(notSet, 1)} of sessions${notSet > 0.05 ? ': sessions starting without a page_view (consent/tag order?)' : ''}`]);

      // Pages that still get traffic but stopped converting: look for a trailing run of days where
      // key events are far below what the previous period's conversion rate predicts.
      const baseRate = new Map(byPageP.filter(r => Number(r.keyEvents) >= 10).map(r => [`${r.landingPage} (${r.deviceCategory})`, Number(r.keyEvents) / Number(r.sessions)]));
      const daily = await ga4.report({ range: p.current, dimensions: ['date', 'landingPage', 'deviceCategory'], metrics: ['sessions', 'keyEvents'] });
      const bySeg = new Map<string, { date: string; sessions: number; conv: number }[]>();
      for (const r of daily) {
        const seg = `${r.landingPage} (${r.deviceCategory})`;
        if (baseRate.has(seg)) bySeg.set(seg, [...(bySeg.get(seg) ?? []), { date: String(r.date), sessions: Number(r.sessions), conv: Number(r.keyEvents) }]);
      }
      const broken = [...bySeg].map(([seg, days]) => {
        days.sort((a, b) => a.date.localeCompare(b.date));
        const rp = baseRate.get(seg)!;
        let run: typeof days = [];
        for (const d of days) {
          const expected = d.sessions * rp;
          if (expected >= 1 && d.conv <= expected * 0.25) run.push(d); else if (expected >= 1) run = [];
        }
        const s = run.reduce((a, d) => a + d.sessions, 0), c = run.reduce((a, d) => a + d.conv, 0);
        return { seg, since: run[0]?.date, days: run.length, rp, rc: s ? c / s : 0, sessionsPerDay: s / (run.length || 1), lost: s * rp - c };
      }).filter(x => x.days >= 3 && x.lost >= 5).sort((a, b) => b.lost - a.lost);
      checks.push([broken.length ? '❌' : '✅', 'Pages that stopped converting with traffic intact', broken.length ? `${broken.length} found (see table)` : 'none']);
      if (broken.length) out.push(table(['Page (device)', 'Since', 'Sessions/day', 'Conv. rate before', 'Conv. rate now', 'Lost key events'],
        broken.slice(0, 8).map(b => [b.seg, b.since!, num(b.sessionsPerDay), rate(b.rp), rate(b.rc), num(b.lost)])));

      if (sources.hubspot) {
        const [daily, contacts] = await Promise.all([ga4.report({ range: p.current, dimensions: ['date'], metrics: ['keyEvents'] }), sources.hubspot.contacts(p.current)]);
        const g = new Map(daily.map(r => [String(r.date), Number(r.keyEvents)]));
        const h = groupSum(contacts.rows, r => r.createdate.slice(0, 10), () => 1);
        const days = eachDay(p.current).map(d => ({ d, g: g.get(d) ?? 0, h: h.get(d) ?? 0 }));
        const ratio = median(days.filter(x => x.g > 0).map(x => x.h / x.g));
        const odd = days.filter(x => (x.g === 0) !== (x.h === 0) || (x.g > 5 && Math.abs(x.h / x.g - ratio) > ratio * 0.5));
        checks.push([odd.length ? '⚠️' : '✅', 'GA4 key events vs HubSpot contacts (daily)', odd.length ? `${odd.length} day(s) out of sync: ${odd.slice(0, 5).map(x => `${x.d} (GA4 ${x.g}, HubSpot ${x.h})`).join(', ')}` : `in sync (≈${ratio.toFixed(2)} contacts per key event)`]);

        const gShare = groupSum(byCh, r => String(r.sessionDefaultChannelGroup), r => Number(r.keyEvents));
        const hShare = groupSum(contacts.rows, r => HS_SOURCE_TO_CHANNEL[r.source] ?? r.source, () => 1);
        const gt = [...gShare.values()].reduce((a, b) => a + b, 0) || 1, ht = contacts.rows.length || 1;
        const gaps = [...gShare.keys()].map(ch => ({ ch, g: (gShare.get(ch) ?? 0) / gt, h: (hShare.get(ch) ?? 0) / ht })).filter(x => Math.abs(x.g - x.h) > 0.15);
        checks.push([gaps.length ? '⚠️' : '✅', 'Channel attribution GA4 vs HubSpot', gaps.length ? gaps.map(x => `${x.ch}: GA4 ${rate(x.g, 0)} vs HubSpot ${rate(x.h, 0)}`).join('; ') : 'shares match within 15 pts']);
      }
    } else checks.push(['➖', 'GA4', 'not connected']);

    if (!sources.hubspot) checks.push(['➖', 'HubSpot reconciliation', 'HubSpot not connected']);
    out.splice(2, 0, table(['', 'Check', 'Result'], checks));
    out.push('_If GA4 and HubSpot drop together, the problem is real (page, form, demand). If only one drops, suspect tracking._');
    return text(...out);
  });
}
