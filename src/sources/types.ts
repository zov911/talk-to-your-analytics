import type { DateRange } from '../lib/dates.js';

export type Row = Record<string, string | number>;

export interface Ga4Query {
  range: DateRange;
  dimensions: string[];           // e.g. date, sessionDefaultChannelGroup, landingPage, deviceCategory
  metrics: string[];              // e.g. sessions, totalUsers, keyEvents, totalRevenue, engagedSessions
  filter?: { dimension: string; value: string };
  limit?: number;
}

export interface GscQuery {
  range: DateRange;
  dimensions: ('date' | 'query' | 'page' | 'device' | 'country')[];
  filter?: { dimension: 'query' | 'page'; contains: string };
  limit?: number;
}

export interface GscRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number; }

export interface Contact { id: string; createdate: string; source: string; lifecyclestage: string; }
export interface Deal { id: string; createdate: string; amount: number; stage: string; closedWon: boolean; closedate: string | null; }

export interface Sources {
  mode: 'demo' | 'live';
  ga4?: { report(q: Ga4Query): Promise<Row[]> };
  gsc?: { query(q: GscQuery): Promise<GscRow[]> };
  hubspot?: {
    contacts(range: DateRange): Promise<{ rows: Contact[]; truncated: boolean }>;
    deals(range: DateRange): Promise<{ rows: Deal[]; truncated: boolean }>;
  };
}

export class SourceNotConfigured extends Error {
  constructor(source: string, docs: string) {
    super(`${source} is not configured. See docs/${docs} (or start with --demo to try sample data).`);
  }
}
