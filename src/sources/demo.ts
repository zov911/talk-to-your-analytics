// Deterministic sample data for a fictional B2B SaaS, relative to today, with a planted story:
//   1. Six days ago the demo-request form on /demo broke on mobile, so leads drop
//      (in GA4 key events AND HubSpot contacts, so it's real, not a tracking glitch).
//   2. Ten days ago "lead scoring software" slipped from ~#4 to ~#11 on Google.
// Good questions to try: "Why did leads drop last week?", "Any anomalies?", "Is tracking healthy?"
import { addDays, eachDay, iso, parse, type DateRange } from '../lib/dates.js';
import type { Contact, Deal, Ga4Query, GscQuery, GscRow, Row, Sources } from './types.js';

const today = iso(new Date());
export const DEMO_STORY = {
  formBrokeOn: addDays(today, -6),
  rankDropOn: addDays(today, -10),
};

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const noise = (key: string, spread = 0.2) => 1 - spread / 2 + hash01(key) * spread;
const weekday = (d: string) => { const w = parse(d).getUTCDay(); return w === 0 || w === 6 ? 0.55 : w === 2 || w === 3 ? 1.06 : 1; };
const trend = (d: string) => 1 + (parse(d).getTime() - parse(addDays(today, -400)).getTime()) / 864e5 * 0.0006;

const CHANNELS: [string, number, number][] = [ // name, share of sessions, conversion multiplier
  ['Organic Search', 0.34, 1.0], ['Paid Search', 0.2, 1.3], ['Direct', 0.16, 1.1], ['Paid Social', 0.11, 0.5],
  ['Email', 0.07, 1.4], ['Referral', 0.07, 1.0], ['Organic Social', 0.05, 0.45],
];
const PAGES: [string, number, number][] = [ // landing page, share, base conversion rate
  ['/', 0.24, 0.012], ['/pricing', 0.14, 0.03], ['/demo', 0.14, 0.09], ['/blog/attribution-guide', 0.22, 0.006],
  ['/blog/lead-scoring', 0.16, 0.007], ['/integrations/hubspot', 0.1, 0.02],
];
const PAID_PAGE_TILT: Record<string, number> = { '/demo': 3.2, '/pricing': 1.8, '/blog/attribution-guide': 0.2, '/blog/lead-scoring': 0.2 };
const DEVICES: [string, number][] = [['desktop', 0.58], ['mobile', 0.38], ['tablet', 0.04]];
const HS_SOURCE: Record<string, string> = {
  'Organic Search': 'ORGANIC_SEARCH', 'Paid Search': 'PAID_SEARCH', Direct: 'DIRECT_TRAFFIC', 'Paid Social': 'PAID_SOCIAL',
  Email: 'EMAIL_MARKETING', Referral: 'REFERRALS', 'Organic Social': 'SOCIAL_MEDIA',
};

type CubeRow = { date: string; sessionDefaultChannelGroup: string; landingPage: string; deviceCategory: string; sessions: number; totalUsers: number; engagedSessions: number; keyEvents: number; totalRevenue: number; };

function ga4Cube(range: DateRange): CubeRow[] {
  const rows: CubeRow[] = [];
  for (const date of eachDay(range)) {
    const dayBase = 2600 * weekday(date) * trend(date);
    for (const [ch, chShare, chConv] of CHANNELS) {
      const tilt = ch === 'Paid Search' ? PAID_PAGE_TILT : {};
      const pageNorm = PAGES.reduce((s, [p, sh]) => s + sh * (tilt[p] ?? 1), 0);
      for (const [page, pShare, pConv] of PAGES) {
        for (const [dev, dShare] of DEVICES) {
          const k = `${date}|${ch}|${page}|${dev}`;
          const sessions = Math.round(dayBase * chShare * (pShare * (tilt[page] ?? 1) / pageNorm) * dShare * noise(k));
          let cr = pConv * chConv * (dev === 'mobile' ? 0.8 : 1);
          if (page === '/demo' && dev === 'mobile' && date >= DEMO_STORY.formBrokeOn) cr *= 0.08; // broken form
          const keyEvents = Math.round(sessions * cr * noise(k + 'c', 0.5));
          rows.push({
            date, sessionDefaultChannelGroup: ch, landingPage: page, deviceCategory: dev,
            sessions, totalUsers: Math.round(sessions * 0.82), engagedSessions: Math.round(sessions * 0.58 * noise(k + 'e', 0.1)),
            keyEvents, totalRevenue: keyEvents * 150,
          });
        }
      }
    }
  }
  return rows;
}

function aggregate<T extends Record<string, string | number>>(rows: T[], dims: string[], metrics: string[]): Row[] {
  const m = new Map<string, Row>();
  for (const r of rows) {
    const key = dims.map(d => r[d] ?? '(not set)').join('\u0000');
    let acc = m.get(key);
    if (!acc) { acc = Object.fromEntries(dims.map(d => [d, r[d] ?? '(not set)'])); for (const x of metrics) acc[x] = 0; m.set(key, acc); }
    for (const x of metrics) (acc[x] as number) += Number(r[x] ?? 0);
  }
  return [...m.values()];
}

const QUERIES: [string, string, number, number][] = [ // query, page, daily impressions, base position
  ['marketing attribution software', '/', 900, 6.8], ['b2b attribution tool', '/', 420, 4.9], ['multi touch attribution', '/blog/attribution-guide', 1300, 8.6],
  ['attribution models explained', '/blog/attribution-guide', 700, 5.2], ['first touch vs last touch', '/blog/attribution-guide', 380, 3.9],
  ['lead scoring software', '/blog/lead-scoring', 760, 4.2], ['predictive lead scoring', '/blog/lead-scoring', 330, 6.1], ['lead scoring model template', '/blog/lead-scoring', 290, 3.3],
  ['hubspot attribution reporting', '/integrations/hubspot', 360, 4.4], ['hubspot lead scoring', '/integrations/hubspot', 310, 7.9],
  ['northwind', '/', 1100, 1.2], ['northwind pricing', '/pricing', 240, 1.4], ['revenue analytics pricing', '/pricing', 180, 12.4],
  ['northwind demo', '/demo', 120, 1.3], ['attribution software demo', '/demo', 140, 9.8], ['marketing dashboard template', '/blog/attribution-guide', 520, 13.6],
];
const COUNTRIES: [string, number][] = [['usa', 0.55], ['can', 0.12], ['gbr', 0.1], ['deu', 0.08], ['aus', 0.08], ['ind', 0.07]];
const ctrAt = (pos: number) => Math.max(0.004, 0.31 * Math.exp(-0.32 * (pos - 1)));

function gscCube(range: DateRange) {
  const rows: Record<string, string | number>[] = [];
  for (const date of eachDay(range)) {
    for (const [query, page, impr, pos0] of QUERIES) {
      let pos = pos0 * noise(`${date}|${query}|p`, 0.16);
      if (query === 'lead scoring software' && date >= DEMO_STORY.rankDropOn) pos = 11.5 * noise(`${date}|p2`, 0.1);
      for (const [device, ds] of DEVICES) {
        for (const [country, cs] of COUNTRIES) {
          const k = `${date}|${query}|${device}|${country}`;
          const impressions = Math.round(impr * weekday(date) * trend(date) * ds * cs * noise(k));
          const brand = query.startsWith('northwind') ? 1.8 : 1;
          const clicks = Math.round(impressions * Math.min(0.7, ctrAt(pos) * brand) * noise(k + 'c', 0.3));
          rows.push({ date, query, page: `https://www.example.com${page}`, device: device.toUpperCase(), country, impressions, clicks, posImpr: pos * impressions });
        }
      }
    }
  }
  return rows;
}

const LIFECYCLE: [string, number][] = [['lead', 0.55], ['marketingqualifiedlead', 0.25], ['salesqualifiedlead', 0.12], ['opportunity', 0.05], ['customer', 0.03]];

function contactsFor(range: DateRange): Contact[] {
  const daily = aggregate(ga4Cube(range), ['date', 'sessionDefaultChannelGroup'], ['keyEvents']);
  const out: Contact[] = [];
  for (const r of daily) {
    const n = Math.round(Number(r.keyEvents) * 0.92); // some duplicates / existing contacts
    for (let i = 0; i < n; i++) {
      const id = `${r.date}-${r.sessionDefaultChannelGroup}-${i}`;
      let x = hash01(id + 'l'), stage = 'lead';
      for (const [s, p] of LIFECYCLE) { if ((x -= p) <= 0) { stage = s; break; } }
      out.push({ id, createdate: `${r.date}T${String(8 + Math.floor(hash01(id) * 10)).padStart(2, '0')}:00:00Z`, source: HS_SOURCE[String(r.sessionDefaultChannelGroup)] ?? 'OTHER_CAMPAIGNS', lifecyclestage: stage });
    }
  }
  return out;
}

export function demoSources(): Sources {
  return {
    mode: 'demo',
    ga4: {
      async report(q: Ga4Query) {
        let rows = ga4Cube(q.range) as unknown as Record<string, string | number>[];
        if (q.filter) rows = rows.filter(r => String(r[q.filter!.dimension]) === q.filter!.value);
        const unknown = q.dimensions.filter(d => !['date', 'sessionDefaultChannelGroup', 'landingPage', 'deviceCategory'].includes(d));
        if (unknown.length) throw new Error(`Demo data supports dimensions date, sessionDefaultChannelGroup, landingPage, deviceCategory (got ${unknown.join(', ')}).`);
        const res = aggregate(rows, q.dimensions, q.metrics);
        return res.sort((a, b) => Number(b[q.metrics[0]]) - Number(a[q.metrics[0]])).slice(0, q.limit ?? 10000);
      },
    },
    gsc: {
      async query(q: GscQuery): Promise<GscRow[]> {
        let rows = gscCube(q.range);
        if (q.filter) rows = rows.filter(r => String(r[q.filter!.dimension]).includes(q.filter!.contains));
        return aggregate(rows, q.dimensions, ['impressions', 'clicks', 'posImpr'])
          .map(r => ({
            keys: q.dimensions.map(d => String(r[d])),
            clicks: Number(r.clicks), impressions: Number(r.impressions),
            ctr: Number(r.impressions) ? Number(r.clicks) / Number(r.impressions) : 0,
            position: Number(r.impressions) ? Number(r.posImpr) / Number(r.impressions) : 0,
          }))
          .sort((a, b) => b.clicks - a.clicks).slice(0, q.limit ?? 1000);
      },
    },
    hubspot: {
      async contacts(range) { return { rows: contactsFor(range), truncated: false }; },
      async deals(range) {
        // deals created in range come from opportunity/customer contacts created ~7-30 days earlier
        const src = contactsFor({ start: addDays(range.start, -30), end: range.end }).filter(c => c.lifecyclestage === 'opportunity' || c.lifecyclestage === 'customer');
        const rows: Deal[] = [];
        for (const c of src) {
          const created = addDays(c.createdate.slice(0, 10), 7 + Math.floor(hash01(c.id + 'd') * 23));
          if (created < range.start || created > range.end) continue;
          const won = c.lifecyclestage === 'customer';
          rows.push({ id: `deal-${c.id}`, createdate: created, amount: Math.round((12 + hash01(c.id + 'a') * 78) * 1000), stage: won ? 'closedwon' : 'qualifiedtobuy', closedWon: won, closedate: won ? addDays(created, 21) : null });
        }
        return { rows, truncated: false };
      },
    },
  };
}
