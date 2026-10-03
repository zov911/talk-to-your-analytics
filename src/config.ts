import { readFileSync } from 'node:fs';
import { demoSources } from './sources/demo.js';
import { ga4Source, gscSource, parseServiceAccount } from './sources/google.js';
import { hubspotSource } from './sources/hubspot.js';
import type { Sources } from './sources/types.js';

const env = (k: string) => process.env[k]?.trim() || undefined;

/** Builds the data sources from env vars. Anything not configured is simply absent. */
export function loadSources(argv = process.argv): Sources {
  if (argv.includes('--demo') || env('ANALYTICS_DEMO') === 'true') return demoSources();

  const sources: Sources = { mode: 'live' };
  const saRaw = env('GOOGLE_SERVICE_ACCOUNT_JSON') ?? (env('GOOGLE_APPLICATION_CREDENTIALS') ? readFileSync(env('GOOGLE_APPLICATION_CREDENTIALS')!, 'utf8') : undefined);
  if (saRaw) {
    const sa = parseServiceAccount(saRaw);
    if (env('GA4_PROPERTY_ID')) sources.ga4 = ga4Source(sa, env('GA4_PROPERTY_ID')!);
    if (env('GSC_SITE_URL')) sources.gsc = gscSource(sa, env('GSC_SITE_URL')!);
  }
  if (env('HUBSPOT_ACCESS_TOKEN')) sources.hubspot = hubspotSource(env('HUBSPOT_ACCESS_TOKEN')!, Number(env('HUBSPOT_MAX_RECORDS') ?? 5000));

  if (!sources.ga4 && !sources.gsc && !sources.hubspot) {
    console.error('[talk-to-your-analytics] No sources configured, so starting in demo mode. Set env vars (see README) for live data.');
    return demoSources();
  }
  return sources;
}
