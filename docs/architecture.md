# Architecture & design notes

```
Claude (Desktop / Code / any MCP client)
   │  stdio (JSON-RPC, MCP 2026-07-28 spec)
   ▼
src/index.ts ── serveStdio ── src/server.ts (McpServer v2)
                                 ├─ tools/overview.ts       get_overview
                                 ├─ tools/explainChange.ts  explain_change
                                 ├─ tools/diagnostics.ts    detect_anomalies, check_tracking_health
                                 ├─ tools/reports.ts        run_ga4_report, search_console_report, hubspot_funnel
                                 └─ prompts.ts              weekly_report, diagnose_drop, seo_opportunities
                                        │
                                 src/sources/  (one interface, three backends)
                                   ├─ google.ts   GA4 Data API + Search Console API (service-account JWT, no SDK)
                                   ├─ hubspot.ts  CRM search API (paged, rate-limited)
                                   └─ demo.ts     deterministic sample data with a planted incident
```

## Why it's built this way

| Decision | Reason |
|---|---|
| **Task-level tools, not API mirrors** | Official/community servers already expose raw GA4 reports. The value here is analysis: contribution splits, traffic-vs-rate, change points, reconciliation. That saves the model 5–10 tool calls and avoids math mistakes. |
| **Markdown tables out** | Models reason better over small tables than over nested API JSON, and they cost far fewer tokens. |
| **Cross-source by default** | The useful answers sit between systems: GA4 says leads fell, HubSpot confirms it's real, Search Console shows the ranking loss. |
| **Weekday-aware baselines** | B2B traffic halves on weekends. Comparing each day with the same weekday avoids false alarms. |
| **Partial failure is OK** | Each source is wrapped, so a HubSpot outage still returns GA4 results with a warning. |
| **Demo mode** | Anyone can evaluate it in a minute. The demo hides a broken mobile form and a ranking drop for the tools to find. |
| **Few dependencies** | `@modelcontextprotocol/server` + `zod` only. Google auth is ~30 lines of `node:crypto`. |

## Landscape (Oct 2026)

- Google maintains an official GA4 MCP server (raw Data/Admin API tools).
- Search Console and HubSpot have separate community/vendor servers.
- None combine the three or ship diagnostic tools. That's the gap this project fills.

## Extending

Add a source: implement the interface in `src/sources/types.ts`, wire it in `src/config.ts`, use it in a tool. Add a tool: create `src/tools/<name>.ts`, register it in `src/server.ts`, add a test in `test/server.test.ts`.
