import { SourceNotConfigured, type Sources } from '../sources/types.js';

export const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

export function need<K extends 'ga4' | 'gsc' | 'hubspot'>(sources: Sources, key: K): NonNullable<Sources[K]> {
  const s = sources[key];
  if (!s) throw new SourceNotConfigured({ ga4: 'GA4', gsc: 'Search Console', hubspot: 'HubSpot' }[key], key === 'hubspot' ? 'connect-hubspot.md' : 'connect-google.md');
  return s as NonNullable<Sources[K]>;
}

export const demoNote = (s: Sources) => (s.mode === 'demo' ? '> 🧪 Demo data (fictional company). Connect your accounts for real numbers.' : '');

/** Run a block per source and collect errors instead of failing the whole tool. */
export async function settle<T>(label: string, fn: () => Promise<T>, errors: string[]): Promise<T | null> {
  try { return await fn(); } catch (e) { errors.push(`${label}: ${(e as Error).message}`); return null; }
}

export const HS_SOURCE_TO_CHANNEL: Record<string, string> = {
  ORGANIC_SEARCH: 'Organic Search', PAID_SEARCH: 'Paid Search', DIRECT_TRAFFIC: 'Direct', PAID_SOCIAL: 'Paid Social',
  EMAIL_MARKETING: 'Email', REFERRALS: 'Referral', SOCIAL_MEDIA: 'Organic Social',
};
