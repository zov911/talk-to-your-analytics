import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { periodInput, resolvePeriods, type DateRange, type PeriodArgs } from '../lib/dates.js';
import { delta, num, rate, table, text } from '../lib/format.js';
import type { Sources } from '../sources/types.js';
import { READ_ONLY, demoNote, settle } from './shared.js';

export function registerOverview(server: McpServer, sources: Sources) {
  server.registerTool('get_overview', {
    title: 'Marketing overview',
    description: 'Headline KPIs across GA4 (traffic, key events), Search Console (organic clicks) and HubSpot (contacts, deals) with change vs the comparison period. Start here for any "how are we doing" question.',
    inputSchema: z.object(periodInput),
    annotations: READ_ONLY,
  }, async (args: PeriodArgs) => {
    const p = resolvePeriods(args), pg = resolvePeriods(args, 3);
    const errors: string[] = [];
    const rows: (string | number)[][] = [];
    const add = (name: string, cur: number, prev: number | null, fmt = (v: number) => num(v)) =>
      rows.push([name, fmt(cur), prev === null ? '-' : fmt(prev), prev === null ? '-' : delta(cur, prev)]);

    if (sources.ga4) {
      const metrics = ['sessions', 'totalUsers', 'engagedSessions', 'keyEvents', 'totalRevenue'];
      const get = (r: DateRange) => sources.ga4!.report({ range: r, dimensions: [], metrics }).then(x => x[0] ?? {});
      const [c, pr] = await Promise.all([settle('GA4', () => get(p.current), errors), p.previous ? settle('GA4', () => get(p.previous!), errors) : null]);
      if (c) {
        const v = (r: Record<string, string | number> | null, k: string) => (r ? Number(r[k] ?? 0) : null);
        add('GA4 sessions', v(c, 'sessions')!, v(pr, 'sessions'));
        add('GA4 users', v(c, 'totalUsers')!, v(pr, 'totalUsers'));
        add('GA4 key events (leads)', v(c, 'keyEvents')!, v(pr, 'keyEvents'));
        const cr = (r: typeof c | null) => (r && Number(r.sessions) ? Number(r.keyEvents) / Number(r.sessions) : null);
        add('GA4 key event rate', cr(c)!, cr(pr), x => rate(x));
        add('GA4 engagement rate', Number(c.engagedSessions) / (Number(c.sessions) || 1), pr ? Number(pr.engagedSessions) / (Number(pr.sessions) || 1) : null, x => rate(x, 1));
        if (Number(c.totalRevenue)) add('GA4 revenue', v(c, 'totalRevenue')!, v(pr, 'totalRevenue'), x => '$' + num(x));
      }
    }
    if (sources.gsc) {
      const get = (r: DateRange) => sources.gsc!.query({ range: r, dimensions: [] }).then(x => x[0]);
      const [c, pr] = await Promise.all([settle('Search Console', () => get(pg.current), errors), pg.previous ? settle('Search Console', () => get(pg.previous!), errors) : null]);
      if (c) {
        add('Organic clicks (Google)', c.clicks, pr?.clicks ?? null);
        add('Organic impressions', c.impressions, pr?.impressions ?? null);
        add('Organic CTR', c.ctr, pr?.ctr ?? null, x => rate(x));
        add('Avg. position', c.position, pr?.position ?? null, x => x.toFixed(1));
      }
    }
    if (sources.hubspot) {
      const hs = sources.hubspot;
      const load = async (r: DateRange) => { const [ct, dl] = await Promise.all([hs.contacts(r), hs.deals(r)]); return { ct, dl }; };
      const [c, pr] = await Promise.all([settle('HubSpot', () => load(p.current), errors), p.previous ? settle('HubSpot', () => load(p.previous!), errors) : null]);
      if (c) {
        const mql = (x: typeof c | null) => (x ? x.ct.rows.filter(r => !['lead', 'subscriber', 'unknown', 'other'].includes(r.lifecyclestage)).length : null);
        const won = (x: typeof c | null) => (x ? x.dl.rows.filter(d => d.closedWon) : null);
        add('HubSpot new contacts', c.ct.rows.length, pr?.ct.rows.length ?? null);
        add('HubSpot MQL+ contacts', mql(c)!, mql(pr));
        add('HubSpot deals created', c.dl.rows.length, pr?.dl.rows.length ?? null);
        add('HubSpot pipeline created', c.dl.rows.reduce((s, d) => s + d.amount, 0), pr ? pr.dl.rows.reduce((s, d) => s + d.amount, 0) : null, x => '$' + num(x));
        add('HubSpot won revenue', won(c)!.reduce((s, d) => s + d.amount, 0), pr ? won(pr)!.reduce((s, d) => s + d.amount, 0) : null, x => '$' + num(x));
        if (c.ct.truncated) errors.push('HubSpot: contact list truncated at HUBSPOT_MAX_RECORDS; counts are a lower bound.');
      }
    }
    return text(
      demoNote(sources),
      `### Overview: ${p.label}`,
      table(['Metric', 'Current', 'Previous', 'Change'], rows),
      sources.gsc ? `_Search Console period: ${pg.label} (data lags ~3 days)._` : '',
      errors.length ? `**Warnings**\n${errors.map(e => `- ${e}`).join('\n')}` : '',
      'Next: use `explain_change` on any metric that moved.',
    );
  });
}
