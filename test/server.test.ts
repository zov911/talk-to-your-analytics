import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer } from '../src/server.js';
import { demoSources, DEMO_STORY } from '../src/sources/demo.js';
import { contributors, rateVolumeSplit } from '../src/lib/analysis.js';
import { resolvePeriods } from '../src/lib/dates.js';

let client: Client;

before(async () => {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer(demoSources());
  await server.connect(serverT);
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientT);
});
after(async () => { await client.close(); });

async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const res = await client.callTool({ name, arguments: args });
  const block = (res.content as { type: string; text: string }[])[0];
  assert.notEqual(res.isError, true, block?.text);
  return block.text;
}

test('get_overview covers all three sources', async () => {
  const t = await call('get_overview');
  for (const s of ['GA4 sessions', 'Organic clicks', 'HubSpot new contacts']) assert.match(t, new RegExp(s));
});

test('explain_change finds the planted broken mobile form on /demo', async () => {
  const t = await call('explain_change', { metric: 'key_events' });
  assert.match(t, /\/demo · mobile|\/demo/);
  assert.match(t, /Conversion rate fell with stable traffic/);
  assert.match(t, new RegExp(`Change started around (${DEMO_STORY.formBrokeOn}|\\d{4}-\\d{2}-\\d{2})`));
});

test('explain_change on organic clicks surfaces the ranking loss', async () => {
  const t = await call('explain_change', { metric: 'organic_clicks', period: 'last_14_days' });
  assert.match(t, /lead scoring software/);
});

test('check_tracking_health flags the page that stopped converting', async () => {
  const t = await call('check_tracking_health');
  assert.match(t, /stopped converting/);
  assert.match(t, /\/demo \(mobile\)/);
});

test('invalid input returns a tool error, not a crash', async () => {
  const res = await client.callTool({ name: 'explain_change', arguments: { metric: 'nope' } });
  assert.equal(res.isError, true);
});

test('analysis helpers', () => {
  const r = contributors(new Map([['a', 10], ['b', 50]]), new Map([['a', 40], ['b', 50]]));
  assert.equal(r.rows[0].segment, 'a');
  assert.equal(r.rows[0].shareOfChange, 1);
  const s = rateVolumeSplit({ sessions: 100, conversions: 1 }, { sessions: 100, conversions: 10 });
  assert.equal(s.volumeEffect, 0);
  assert.ok(s.rateEffect < 0);
  const p = resolvePeriods({ period: 'last_7_days', compare: 'previous_period' }, 1, new Date('2026-10-15T12:00:00Z'));
  assert.deepEqual(p.current, { start: '2026-10-08', end: '2026-10-14' });
  assert.deepEqual(p.previous, { start: '2026-10-01', end: '2026-10-07' });
});
