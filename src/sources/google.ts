// GA4 Data API + Search Console API via a Google service account (JWT bearer flow, no SDK needed).
import { createSign } from 'node:crypto';
import type { Ga4Query, GscQuery, GscRow, Row } from './types.js';

interface ServiceAccount { client_email: string; private_key: string; }
const tokens = new Map<string, { token: string; exp: number }>();
const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

async function accessToken(sa: ServiceAccount, scope: string): Promise<string> {
  const cached = tokens.get(scope);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`;
  const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google auth failed: ${json.error_description ?? json.error ?? res.status}`);
  tokens.set(scope, { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 });
  return json.access_token;
}

async function post<T>(url: string, sa: ServiceAccount, scope: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken(sa, scope)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Google API ${res.status}: ${json.error?.message ?? 'request failed'}`);
  return json;
}

export function ga4Source(sa: ServiceAccount, propertyId: string) {
  const scope = 'https://www.googleapis.com/auth/analytics.readonly';
  return {
    async report(q: Ga4Query): Promise<Row[]> {
      type Resp = { dimensionHeaders?: { name: string }[]; metricHeaders?: { name: string }[]; rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] };
      const body: Record<string, unknown> = {
        dateRanges: [{ startDate: q.range.start, endDate: q.range.end }],
        dimensions: q.dimensions.map(name => ({ name })),
        metrics: q.metrics.map(name => ({ name })),
        limit: q.limit ?? 10000,
        orderBys: q.metrics.length ? [{ metric: { metricName: q.metrics[0] }, desc: true }] : undefined,
      };
      if (q.filter) body.dimensionFilter = { filter: { fieldName: q.filter.dimension, stringFilter: { matchType: 'EXACT', value: q.filter.value } } };
      const r = await post<Resp>(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, sa, scope, body);
      const dh = r.dimensionHeaders?.map(h => h.name) ?? [], mh = r.metricHeaders?.map(h => h.name) ?? [];
      return (r.rows ?? []).map(row => {
        const out: Row = {};
        dh.forEach((d, i) => { const v = row.dimensionValues[i].value; out[d] = d === 'date' ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v; });
        mh.forEach((m, i) => { out[m] = Number(row.metricValues[i].value); });
        return out;
      });
    },
  };
}

export function gscSource(sa: ServiceAccount, siteUrl: string) {
  const scope = 'https://www.googleapis.com/auth/webmasters.readonly';
  return {
    async query(q: GscQuery): Promise<GscRow[]> {
      const body: Record<string, unknown> = { startDate: q.range.start, endDate: q.range.end, dimensions: q.dimensions, rowLimit: Math.min(q.limit ?? 1000, 25000) };
      if (q.filter) body.dimensionFilterGroups = [{ filters: [{ dimension: q.filter.dimension, operator: 'contains', expression: q.filter.contains }] }];
      const r = await post<{ rows?: GscRow[] }>(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, sa, scope, body);
      return r.rows ?? [];
    },
  };
}

export function parseServiceAccount(raw: string): ServiceAccount {
  const sa = JSON.parse(raw) as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) throw new Error('Service account JSON is missing client_email or private_key');
  return sa as ServiceAccount;
}
