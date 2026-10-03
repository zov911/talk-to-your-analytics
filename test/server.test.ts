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
