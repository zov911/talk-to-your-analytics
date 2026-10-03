import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { groupSum } from '../lib/analysis.js';
import { periodInput, resolvePeriods, type PeriodArgs } from '../lib/dates.js';
import { delta, num, pct, rate, table, text } from '../lib/format.js';
import type { GscRow, Sources } from '../sources/types.js';
import { READ_ONLY, demoNote, need } from './shared.js';

const ctrAt = (pos: number) => Math.max(0.004, 0.31 * Math.exp(-0.32 * (pos - 1))); // typical organic CTR curve

export function registerReports(server: McpServer, sources: Sources) {
  // ── GA4 ad-hoc report ──────────────────────────────────────────────
  server.registerTool('run_ga4_report', {
    title: 'GA4 report',
    description: 'Ad-hoc GA4 report with any dimensions and metrics (GA4 Data API names, e.g. dimensions: sessionDefaultChannelGroup, landingPage, deviceCategory, country, date; metrics: sessions, totalUsers, keyEvents, engagementRate, totalRevenue).',
    inputSchema: z.object({
      dimensions: z.array(z.string()).max(4).default(['sessionDefaultChannelGroup']),
      metrics: z.array(z.string()).min(1).max(8).default(['sessions', 'keyEvents']),
      filter_dimension: z.string().optional().describe('Optional exact-match filter dimension'),
      filter_value: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(25),
      ...periodInput,
    }),
    annotations: READ_ONLY,
  }, async (args: PeriodArgs & { dimensions: string[]; metrics: string[]; filter_dimension?: string; filter_value?: string; limit: number }) => {
    const ga4 = need(sources, 'ga4');
    const p = resolvePeriods(args);
    const filter = args.filter_dimension && args.filter_value ? { dimension: args.filter_dimension, value: args.filter_value } : undefined;
    const [cur, prev] = await Promise.all([
      ga4.report({ range: p.current, dimensions: args.dimensions, metrics: args.metrics, filter, limit: args.limit }),
      p.previous ? ga4.report({ range: p.previous, dimensions: args.dimensions, metrics: args.metrics, filter, limit: 1000 }) : Promise.resolve([]),
    ]);
    const k = (r: Record<string, string | number>) => args.dimensions.map(d => r[d]).join('\u0000');
    const prevMap = new Map(prev.map(r => [k(r), r]));
    const m0 = args.metrics[0];
    return text(demoNote(sources), `### GA4: ${p.label}`, table(
      [...args.dimensions, ...args.metrics, ...(p.previous ? [`${m0} Δ`] : [])],
      cur.map(r => [...args.dimensions.map(d => String(r[d])), ...args.metrics.map(m => num(Number(r[m]), 2)), ...(p.previous ? [delta(Number(r[m0]), Number(prevMap.get(k(r))?.[m0] ?? 0))] : [])]),
    ));
  });

  // ── Search Console ─────────────────────────────────────────────────
  server.registerTool('search_console_report', {
    title: 'Search Console report',
    description: 'Google organic search performance. view="top": best queries/pages; "movers": biggest click gains and losses with position change; "opportunities": striking-distance queries (position 4–15) and low-CTR results with estimated extra clicks.',
    inputSchema: z.object({
      view: z.enum(['top', 'movers', 'opportunities']).default('top'),
      dimension: z.enum(['query', 'page', 'device', 'country']).default('query'),
      contains: z.string().optional().describe('Only rows whose query/page contains this text'),
      limit: z.number().int().min(1).max(100).default(15),
      ...periodInput,
    }),
    annotations: READ_ONLY,
  }, async (args: PeriodArgs & { view: 'top' | 'movers' | 'opportunities'; dimension: 'query' | 'page' | 'device' | 'country'; contains?: string; limit: number }) => {
    const gsc = need(sources, 'gsc');
    const p = resolvePeriods({ ...args, compare: args.view === 'movers' && args.compare === 'none' ? 'previous_period' : args.compare }, 3);
    const filter = args.contains && (args.dimension === 'query' || args.dimension === 'page') ? { dimension: args.dimension, contains: args.contains } : undefined;
    const [cur, prev] = await Promise.all([
      gsc.query({ range: p.current, dimensions: [args.dimension], filter, limit: 1000 }),
      p.previous ? gsc.query({ range: p.previous, dimensions: [args.dimension], filter, limit: 1000 }) : Promise.resolve([] as GscRow[]),
    ]);
    const prevMap = new Map(prev.map(r => [r.keys[0], r]));
    const head = [demoNote(sources), `### Search Console (${args.view}, by ${args.dimension}): ${p.label}`];

    if (args.view === 'top') {
      return text(...head, table(['Key', 'Clicks', 'Δ clicks', 'Impressions', 'CTR', 'Position'],
        cur.slice(0, args.limit).map(r => [r.keys[0], num(r.clicks), p.previous ? delta(r.clicks, prevMap.get(r.keys[0])?.clicks ?? 0) : '-', num(r.impressions), rate(r.ctr), r.position.toFixed(1)])));
    }
    if (args.view === 'movers') {
      const keys = new Set([...cur.map(r => r.keys[0]), ...prev.map(r => r.keys[0])]);
      const curMap = new Map(cur.map(r => [r.keys[0], r]));
      const rows = [...keys].map(k => ({ k, c: curMap.get(k), p: prevMap.get(k) }))
        .map(x => ({ ...x, d: (x.c?.clicks ?? 0) - (x.p?.clicks ?? 0) }))
        .sort((a, b) => a.d - b.d);
      const fmt = (x: (typeof rows)[number]) => [x.k, num(x.p?.clicks ?? 0), num(x.c?.clicks ?? 0), `${x.d >= 0 ? '+' : ''}${num(x.d)}`, `${x.p?.position.toFixed(1) ?? '-'} → ${x.c?.position.toFixed(1) ?? '-'}`];
      const half = Math.ceil(args.limit / 2);
      return text(...head,
        '#### Biggest losses', table(['Key', 'Prev clicks', 'Clicks', 'Δ', 'Position'], rows.filter(r => r.d < 0).slice(0, half).map(fmt)),
        '#### Biggest gains', table(['Key', 'Prev clicks', 'Clicks', 'Δ', 'Position'], rows.filter(r => r.d > 0).reverse().slice(0, half).map(fmt)));
    }
    // opportunities
    const striking = cur.filter(r => r.position >= 4 && r.position <= 15 && r.impressions >= 100)
      .map(r => ({ r, gain: Math.max(0, r.impressions * ctrAt(3) - r.clicks) })).sort((a, b) => b.gain - a.gain).slice(0, args.limit);
    const lowCtr = cur.filter(r => r.position < 4 && r.impressions >= 200 && r.ctr < ctrAt(r.position) * 0.6)
      .map(r => ({ r, gain: r.impressions * ctrAt(r.position) - r.clicks })).sort((a, b) => b.gain - a.gain).slice(0, args.limit);
    return text(...head,
      '#### Striking distance (position 4–15): est. clicks if moved to #3', table(['Key', 'Impressions', 'Position', 'CTR', 'Est. +clicks'],
        striking.map(({ r, gain }) => [r.keys[0], num(r.impressions), r.position.toFixed(1), rate(r.ctr), '+' + num(gain)])),
      '#### Ranking well but under-clicked (rewrite title / meta description)', table(['Key', 'Impressions', 'Position', 'CTR', 'Expected CTR', 'Est. +clicks'],
        lowCtr.map(({ r, gain }) => [r.keys[0], num(r.impressions), r.position.toFixed(1), rate(r.ctr), rate(ctrAt(r.position)), '+' + num(gain)])));
  });

  // ── HubSpot funnel ─────────────────────────────────────────────────
  server.registerTool('hubspot_funnel', {
    title: 'HubSpot funnel',
    description: 'HubSpot lead and pipeline funnel: new contacts by original source, lifecycle-stage mix, deals created, pipeline value, won revenue and contact-to-deal rate, vs the comparison period.',
    inputSchema: z.object(periodInput),
    annotations: READ_ONLY,
  }, async (args: PeriodArgs) => {
    const hs = need(sources, 'hubspot');
    const p = resolvePeriods(args);
    const load = async (r: typeof p.current) => { const [c, d] = await Promise.all([hs.contacts(r), hs.deals(r)]); return { c, d }; };
    const [cur, prev] = await Promise.all([load(p.current), p.previous ? load(p.previous) : Promise.resolve(null)]);
    const bySrc = groupSum(cur.c.rows, r => r.source, () => 1), bySrcP = prev ? groupSum(prev.c.rows, r => r.source, () => 1) : new Map();
    const byStage = groupSum(cur.c.rows, r => r.lifecyclestage, () => 1);
    const won = cur.d.rows.filter(d => d.closedWon), wonP = prev?.d.rows.filter(d => d.closedWon) ?? [];
    const sumAmt = (rows: { amount: number }[]) => rows.reduce((s, d) => s + d.amount, 0);
    const kpi = (name: string, c: number, pv: number | null, money = false) => [name, (money ? '$' : '') + num(c), pv === null ? '-' : (money ? '$' : '') + num(pv), pv === null ? '-' : delta(c, pv)];
    return text(demoNote(sources), `### HubSpot funnel: ${p.label}`,
      table(['Metric', 'Current', 'Previous', 'Change'], [
        kpi('New contacts', cur.c.rows.length, prev?.c.rows.length ?? null),
        kpi('Deals created', cur.d.rows.length, prev?.d.rows.length ?? null),
        kpi('Pipeline created', sumAmt(cur.d.rows), prev ? sumAmt(prev.d.rows) : null, true),
        kpi('Deals won', won.length, prev ? wonP.length : null),
        kpi('Won revenue', sumAmt(won), prev ? sumAmt(wonP) : null, true),
        ['Contact → deal rate', rate(cur.d.rows.length / (cur.c.rows.length || 1), 1), prev ? rate(prev.d.rows.length / (prev.c.rows.length || 1), 1) : '-', ''],
      ]),
      '#### New contacts by original source', table(['Source', 'Contacts', 'Previous', 'Change'],
        [...bySrc].sort((a, b) => b[1] - a[1]).map(([s, n]) => [s, num(n), num(bySrcP.get(s) ?? 0), delta(n, bySrcP.get(s) ?? 0)])),
      '#### Lifecycle stage mix (new contacts)', table(['Stage', 'Contacts', 'Share'],
        [...byStage].sort((a, b) => b[1] - a[1]).map(([s, n]) => [s, num(n), pct(n / (cur.c.rows.length || 1), 0).replace('+', '')])),
      cur.c.truncated || cur.d.truncated ? '_⚠️ Results truncated at HUBSPOT_MAX_RECORDS; counts are a lower bound._' : '',
    );
  });
}
