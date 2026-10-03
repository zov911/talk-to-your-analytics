import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const msg = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] });

export function registerPrompts(server: McpServer) {
  server.registerPrompt('weekly_report', {
    title: 'Weekly marketing report',
    description: 'One-page weekly report: KPIs, what changed and why, anomalies, next actions.',
    argsSchema: z.object({ audience: z.string().default('marketing leadership').describe('Who will read it') }),
  }, ({ audience }: { audience: string }) => msg(
    `Write a weekly marketing report for ${audience}.
1. Call get_overview (last_7_days vs previous_period).
2. For the 2 metrics that moved most, call explain_change.
3. Call detect_anomalies and check_tracking_health.
Format: 3-bullet TL;DR, KPI table, "What changed and why" (cite segments and numbers), risks, 3 concrete next actions with owners. Max 350 words. Flag anything that looks like a tracking issue rather than a real change.`));

  server.registerPrompt('diagnose_drop', {
    title: 'Diagnose a drop',
    description: 'Root-cause a drop in leads, traffic, organic clicks or pipeline.',
    argsSchema: z.object({ metric: z.string().default('key_events').describe('key_events, sessions, organic_clicks, new_contacts, deals_created, won_revenue') }),
  }, ({ metric }: { metric: string }) => msg(
    `Find the root cause of the recent change in ${metric}.
1. explain_change for ${metric} (last_7_days vs previous_period). Note the top segments and when it started.
2. check_tracking_health to decide: real problem or tracking problem?
3. If organic is involved, search_console_report view=movers.
Answer with: the cause in one sentence, evidence (numbers), confidence (high/medium/low), what to check or fix first, and the estimated impact per week if not fixed.`));

  server.registerPrompt('seo_opportunities', {
    title: 'SEO opportunity review',
    description: 'Prioritized SEO actions from Search Console data.',
    argsSchema: z.object({ topic: z.string().optional().describe('Optional topic filter, e.g. "pricing"') }),
  }, ({ topic }: { topic?: string }) => msg(
    `Review SEO opportunities${topic ? ` for "${topic}"` : ''}.
Call search_console_report with view=opportunities (last_28_days), then view=movers.
Return a prioritized table: page/query, issue, action (content update, internal links, title rewrite), est. extra clicks/month, effort (S/M/L). Top 10 only.`));
}
