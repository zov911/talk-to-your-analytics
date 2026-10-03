// HubSpot CRM search API (private app token). Needs scopes: crm.objects.contacts.read, crm.objects.deals.read
import type { DateRange } from '../lib/dates.js';
import type { Contact, Deal } from './types.js';

const API = 'https://api.hubapi.com';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function hubspotSource(token: string, maxRecords = 5000) {
  async function search<T>(object: 'contacts' | 'deals', range: DateRange, properties: string[], map: (p: Record<string, string | null>, id: string) => T) {
    const from = Date.parse(`${range.start}T00:00:00Z`), to = Date.parse(`${range.end}T23:59:59.999Z`);
    const rows: T[] = [];
    let after: string | undefined;
    do {
      const res = await fetch(`${API}/crm/v3/objects/${object}/search`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          filterGroups: [{ filters: [
            { propertyName: 'createdate', operator: 'GTE', value: String(from) },
            { propertyName: 'createdate', operator: 'LTE', value: String(to) },
          ] }],
          sorts: [{ propertyName: 'createdate', direction: 'ASCENDING' }],
          properties, limit: 200, after,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429) { await sleep(1500); continue; }
      const json = (await res.json().catch(() => ({}))) as { results?: { id: string; properties: Record<string, string | null> }[]; paging?: { next?: { after: string } }; message?: string };
      if (!res.ok) throw new Error(`HubSpot ${res.status}: ${json.message ?? 'request failed'}`);
      for (const r of json.results ?? []) rows.push(map(r.properties, r.id));
      after = json.paging?.next?.after;
      if (after) await sleep(250); // search endpoints are rate-limited per second
    } while (after && rows.length < maxRecords);
    return { rows: rows.slice(0, maxRecords), truncated: Boolean(after) };
  }

  return {
    contacts: (range: DateRange) => search<Contact>('contacts', range, ['createdate', 'hs_analytics_source', 'lifecyclestage'], (p, id) => ({
      id, createdate: p.createdate ?? '', source: p.hs_analytics_source ?? 'UNKNOWN', lifecyclestage: p.lifecyclestage ?? 'unknown',
    })),
    deals: (range: DateRange) => search<Deal>('deals', range, ['createdate', 'amount', 'dealstage', 'hs_is_closed_won', 'closedate'], (p, id) => ({
      id, createdate: p.createdate ?? '', amount: Number(p.amount ?? 0), stage: p.dealstage ?? 'unknown',
      closedWon: p.hs_is_closed_won === 'true', closedate: p.closedate ?? null,
    })),
  };
}
