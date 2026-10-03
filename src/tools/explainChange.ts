import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { contributors, groupSum, pctChange, rateVolumeSplit } from '../lib/analysis.js';
import { addDays, eachDay, periodInput, resolvePeriods, type DateRange, type PeriodArgs } from '../lib/dates.js';
import { delta, num, pct, rate, table, text } from '../lib/format.js';
import type { Row, Sources } from '../sources/types.js';
import { READ_ONLY, demoNote, need } from './shared.js';

const METRICS = {
  sessions:           { source: 'ga4', ga4: 'sessions', label: 'GA4 sessions' },
  key_events:         { source: 'ga4', ga4: 'keyEvents', label: 'GA4 key events (leads)' },
  revenue:            { source: 'ga4', ga4: 'totalRevenue', label: 'GA4 revenue' },
  organic_clicks:     { source: 'gsc', gsc: 'clicks', label: 'Organic clicks' },
  organic_impressions:{ source: 'gsc', gsc: 'impressions', label: 'Organic impressions' },
  new_contacts:       { source: 'hubspot', label: 'HubSpot new contacts' },
  deals_created:      { source: 'hubspot', label: 'HubSpot deals created' },
  won_revenue:        { source: 'hubspot', label: 'HubSpot won revenue' },
} as const;
type MetricKey = keyof typeof METRICS;

const GA4_DIMS: [string, string][] = [['sessionDefaultChannelGroup', 'Channel'], ['landingPage', 'Landing page'], ['deviceCategory', 'Device']];
const GSC_DIMS: [('query' | 'page' | 'device'), string][] = [['query', 'Query'], ['page', 'Page'], ['device', 'Device']];

export function registerExplainChange(server: McpServer, sources: Sources) {
  server.registerTool('explain_change', {
    title: 'Explain a change',
    description: 'Answers "why did X go up/down?". Breaks a metric change into the channels, pages, devices, queries or lead sources that caused it, separates traffic (volume) from conversion-rate problems, and estimates when the change started.',
    inputSchema: z.object({
      metric: z.enum(Object.keys(METRICS) as [MetricKey, ...MetricKey[]]).describe('Metric to explain. "key_events" = GA4 leads/conversions.'),
      ...periodInput,
    }),
    annotations: READ_ONLY,
  }, async (args: PeriodArgs & { metric: MetricKey }) => {
    const m = METRICS[args.metric];
    const p = resolvePeriods({ ...args, compare: args.compare === 'none' ? 'previous_period' : args.compare }, m.source === 'gsc' ? 3 : 1);
    const prev = p.previous!;
    const out: string[] = [demoNote(sources)];

    if (m.source === 'ga4') {
      const ga4 = need(sources, 'ga4');
      const metric = 'ga4' in m ? m.ga4 : 'sessions';
      const fetchDims = (r: DateRange, dims: string[]) => ga4.report({ range: r, dimensions: dims, metrics: ['sessions', metric] });
      const [totC, totP] = await Promise.all([fetchDims(p.current, []), fetchDims(prev, [])]);
      const c0 = Number(totC[0]?.[metric] ?? 0), p0 = Number(totP[0]?.[metric] ?? 0);
      out.push(`### ${m.label}: ${num(c0)} vs ${num(p0)} (${delta(c0, p0)})`, `_${p.label}_`);

      for (const [dim, label] of GA4_DIMS) {
        const [c, pr] = await Promise.all([fetchDims(p.current, [dim]), fetchDims(prev, [dim])]);
        out.push(contribTable(label, groupSum(c, r => String(r[dim]), r => Number(r[metric])), groupSum(pr, r => String(r[dim]), r => Number(r[metric]))));
      }

      // Drill into channel × page × device and split each segment's change into traffic vs conversion rate.
      const dims = GA4_DIMS.map(d => d[0]);
      const [c, pr] = await Promise.all([fetchDims(p.current, dims), fetchDims(prev, dims)]);
      const key = (r: Row) => dims.map(d => r[d]).join(' · ');
      const prevMap = new Map(pr.map(r => [key(r), r]));
      const scale = 1; // equal-length periods
      const segs = c.map(r => {
        const q = prevMap.get(key(r));
        const cur = { sessions: Number(r.sessions), conversions: Number(r[metric]) };
        const old = { sessions: Number(q?.sessions ?? 0) * scale, conversions: Number(q?.[metric] ?? 0) * scale };
        return { seg: key(r), cur, old, change: cur.conversions - old.conversions, split: rateVolumeSplit(cur, old) };
      }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5);

      if (metric !== 'sessions') {
        out.push('#### Segment diagnosis (traffic vs conversion rate)', table(
          ['Segment', 'Sessions Δ', 'Conv. rate', `${m.label} Δ`, 'Likely cause'],
          segs.map(s => [s.seg, delta(s.cur.sessions, s.old.sessions), `${rate(s.split.prevRate)} → ${rate(s.split.curRate)}`, `${s.change >= 0 ? '+' : ''}${num(s.change)}`, verdict(s.split, s.cur.sessions, s.old.sessions)]),
        ));
      }

      // When did it start? Daily series for the top segment.
      const top = segs[0];
      if (top && Math.abs(top.change) > 0) {
        const parts = top.seg.split(' · ');
        const filter = { dimension: dims[0], value: parts[0] };
        const daily = await ga4.report({ range: { start: addDays(prev.start, -14), end: p.current.end }, dimensions: ['date', ...dims.slice(1)], metrics: [metric], filter });
        const series = new Map<string, number>();
        for (const r of daily) if (dims.slice(1).every((d, i) => String(r[d]) === parts[i + 1])) series.set(String(r.date), Number(r[metric]));
        const start = changeStart(series, prev, p.current);
        if (start) out.push(`**Change started around ${start}** in "${top.seg}".`);
      }
    }

    if (m.source === 'gsc') {
      const gsc = need(sources, 'gsc');
      const metric = 'gsc' in m ? m.gsc : 'clicks';
      const [tc, tp] = await Promise.all([gsc.query({ range: p.current, dimensions: [] }), gsc.query({ range: prev, dimensions: [] })]);
      const c0 = tc[0]?.[metric] ?? 0, p0 = tp[0]?.[metric] ?? 0;
      out.push(`### ${m.label}: ${num(c0)} vs ${num(p0)} (${delta(c0, p0)})`, `_${p.label} (Search Console lags ~3 days)_`);
      for (const [dim, label] of GSC_DIMS) {
        const [c, pr] = await Promise.all([gsc.query({ range: p.current, dimensions: [dim], limit: 500 }), gsc.query({ range: prev, dimensions: [dim], limit: 500 })]);
        const posPrev = new Map(pr.map(r => [r.keys[0], r.position]));
        const posCur = new Map(c.map(r => [r.keys[0], r.position]));
        const res = contributors(new Map(c.map(r => [r.keys[0], r[metric]])), new Map(pr.map(r => [r.keys[0], r[metric]])), 8);
        out.push(`#### By ${label}`, table(['Segment', 'Previous', 'Current', 'Change', 'Share of change', 'Position'],
          res.rows.map(r => [r.segment, num(r.previous), num(r.current), `${r.change >= 0 ? '+' : ''}${num(r.change)}`, r.shareOfChange === null ? '-' : pct(r.shareOfChange, 0),
            dim === 'device' ? '-' : `${posPrev.get(r.segment)?.toFixed(1) ?? '-'} → ${posCur.get(r.segment)?.toFixed(1) ?? '-'}`])));
      }
      out.push('_A position drop with stable impressions = ranking loss; falling impressions at the same position = less search demand._');
    }

    if (m.source === 'hubspot') {
      const hs = need(sources, 'hubspot');
      if (args.metric === 'new_contacts') {
        const [c, pr] = await Promise.all([hs.contacts(p.current), hs.contacts(prev)]);
        out.push(`### ${m.label}: ${num(c.rows.length)} vs ${num(pr.rows.length)} (${delta(c.rows.length, pr.rows.length)})`, `_${p.label}_`);
        out.push(contribTable('Original source', groupSum(c.rows, r => r.source, () => 1), groupSum(pr.rows, r => r.source, () => 1)));
        out.push(contribTable('Lifecycle stage', groupSum(c.rows, r => r.lifecyclestage, () => 1), groupSum(pr.rows, r => r.lifecyclestage, () => 1)));
        const daily = groupSum([...pr.rows, ...c.rows], r => r.createdate.slice(0, 10), () => 1);
        const start = changeStart(daily, prev, p.current);
        if (start) out.push(`**Change started around ${start}.**`);
      } else {
        const [c, pr] = await Promise.all([hs.deals(p.current), hs.deals(prev)]);
        const won = args.metric === 'won_revenue';
        const filt = (rows: typeof c.rows) => (won ? rows.filter(d => d.closedWon) : rows);
        const val = (d: { amount: number }) => (won ? d.amount : 1);
        const cs = filt(c.rows), ps = filt(pr.rows);
        const cv = cs.reduce((s, d) => s + val(d), 0), pv = ps.reduce((s, d) => s + val(d), 0);
        out.push(`### ${m.label}: ${num(cv)} vs ${num(pv)} (${delta(cv, pv)})`, `_${p.label}_`);
        out.push(contribTable('Deal stage', groupSum(cs, d => d.stage, val), groupSum(ps, d => d.stage, val)));
        if (!won) out.push(`Average deal size: $${num(cs.reduce((s, d) => s + d.amount, 0) / (cs.length || 1))} vs $${num(ps.reduce((s, d) => s + d.amount, 0) / (ps.length || 1))}.`);
      }
    }

    out.push('Next: `check_tracking_health` to rule out a tracking issue, or `detect_anomalies` for other unusual days.');
    return text(...out);
  });
}

function contribTable(label: string, cur: Map<string, number>, prev: Map<string, number>) {
  const res = contributors(cur, prev, 8);
  return `#### By ${label}\n` + table(['Segment', 'Previous', 'Current', 'Change', 'Share of change'],
    res.rows.map(r => [r.segment, num(r.previous), num(r.current), `${r.change >= 0 ? '+' : ''}${num(r.change)} (${pct(pctChange(r.current, r.previous))})`, r.shareOfChange === null ? '-' : pct(r.shareOfChange, 0)]));
}

function verdict(s: { volumeEffect: number; rateEffect: number }, curS: number, prevS: number) {
  const trafficChange = prevS ? (curS - prevS) / prevS : 0;
  if (Math.abs(s.rateEffect) > Math.abs(s.volumeEffect) * 2 && Math.abs(trafficChange) < 0.2) {
    return s.rateEffect < 0 ? '⚠️ Conversion rate fell with stable traffic: check form, tag or page' : 'Conversion rate improved';
  }
  if (Math.abs(s.volumeEffect) >= Math.abs(s.rateEffect)) return s.volumeEffect < 0 ? 'Less traffic (campaign, budget, ranking or demand)' : 'More traffic';
  return 'Mixed: traffic and rate both moved';
}

/**
 * First day in the current period that departs >40% from the same weekday one/two weeks earlier
 * (same-weekday baseline, so normal weekend dips aren't flagged). Needs two consecutive days.
 */
function changeStart(series: Map<string, number>, prev: DateRange, cur: DateRange): string | null {
  const total = (r: DateRange) => eachDay(r).reduce((s, d) => s + (series.get(d) ?? 0), 0);
  const down = total(cur) < total(prev);
  const days = eachDay(cur);
  const off = (d: string) => {
    const refs = [7, 14].map(n => series.get(addDays(d, -n))).filter((v): v is number => v !== undefined && v > 0);
    if (!refs.length) return false;
    const ref = refs.reduce((a, b) => a + b, 0) / refs.length, v = series.get(d) ?? 0;
    return down ? v < ref * 0.6 : v > ref * 1.4;
  };
  for (let i = 0; i < days.length - 1; i++) if (off(days[i]) && off(days[i + 1])) return days[i];
  return null;
}
