// Small, dependency-free analysis helpers: deltas, change attribution, robust anomaly detection.

export const pctChange = (cur: number, prev: number): number | null => (prev ? (cur - prev) / prev : cur ? null : 0);

export interface Contributor {
  segment: string;
  current: number;
  previous: number;
  change: number;
  /** Share of the total change explained by this segment (can exceed ±100% when segments offset each other). */
  shareOfChange: number | null;
}

/** Which segments explain a change in a total? Sorted by absolute contribution. */
export function contributors(cur: Map<string, number>, prev: Map<string, number>, limit = 8): { total: { current: number; previous: number; change: number }; rows: Contributor[] } {
  const keys = new Set([...cur.keys(), ...prev.keys()]);
  const tc = sum(cur.values()), tp = sum(prev.values()), totalChange = tc - tp;
  const rows = [...keys].map(segment => {
    const c = cur.get(segment) ?? 0, p = prev.get(segment) ?? 0;
    return { segment, current: c, previous: p, change: c - p, shareOfChange: totalChange ? (c - p) / totalChange : null };
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, limit);
  return { total: { current: tc, previous: tp, change: totalChange }, rows };
}

/**
 * Splits a conversion change per segment into a volume effect (traffic changed)
 * and a rate effect (conversion rate changed). A big rate effect with stable traffic
 * usually means a broken form, tag or landing page, not a demand problem.
 */
export function rateVolumeSplit(cur: { sessions: number; conversions: number }, prev: { sessions: number; conversions: number }) {
  const rp = prev.sessions ? prev.conversions / prev.sessions : 0;
  const rc = cur.sessions ? cur.conversions / cur.sessions : 0;
  const volume = (cur.sessions - prev.sessions) * rp;
  const rate = (rc - rp) * cur.sessions;
  return { volumeEffect: volume, rateEffect: rate, prevRate: rp, curRate: rc };
}

/** Robust z-scores (median / MAD) so one bad day doesn't hide another. */
export function anomalies(series: { date: string; value: number }[], threshold = 3) {
  const vals = series.map(s => s.value);
  const med = median(vals);
  const mad = median(vals.map(v => Math.abs(v - med))) || 1e-9;
  return series
    .map(s => ({ ...s, z: (0.6745 * (s.value - med)) / mad }))
    .filter(s => Math.abs(s.z) >= threshold);
}

export function median(a: number[]) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function sum(it: Iterable<number>) { let t = 0; for (const v of it) t += v; return t; }

export function groupSum<T>(rows: T[], key: (r: T) => string, val: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
  return m;
}
