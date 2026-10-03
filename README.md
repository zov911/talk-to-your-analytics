# Talk to Your Analytics

**Ask Claude "why did leads drop last week?" and get an answer from your GA4, Search Console and HubSpot data.**

An MCP server with 7 analysis tools, not raw API wrappers. It finds *which* channel, page, device or query caused a change, separates traffic problems from conversion problems, and tells you when it started.

```
You:    Why did leads drop last week?
Claude: Leads fell 16% (489 → 410). Almost all of it is /demo on mobile:
        conversion rate fell from 8.6% to 1.5% with traffic flat, starting Sep 27.
        HubSpot contacts dropped the same way, so it's not a tracking glitch.
        The mobile demo form is likely broken. ~100 leads lost so far.
```

## Try it in 1 minute (demo data, no accounts needed)

**Claude Code**
```bash
claude mcp add analytics -- npx -y github:zov911/talk-to-your-analytics --demo
```

**Claude Desktop**: add to `claude_desktop_config.json`, then restart:
```json
{
  "mcpServers": {
    "analytics": { "command": "npx", "args": ["-y", "github:zov911/talk-to-your-analytics", "--demo"] }
  }
}
```

Then ask: *"Why did leads drop last week?"* · *"Is our tracking healthy?"* · *"Find SEO quick wins."*

## Connect your data

| Source | You need | Guide |
|---|---|---|
| GA4 + Search Console | Google service account JSON, GA4 property ID, Search Console site URL | [connect-google.md](docs/connect-google.md) |
| HubSpot | Private app token (read contacts and deals) | [connect-hubspot.md](docs/connect-hubspot.md) |

Connect any combination. Remove `--demo` and pass the env vars ([setup for every client](docs/setup.md)).

## Tools

| Tool | Answers |
|---|---|
| `get_overview` | How are we doing? KPIs across all sources vs the previous period |
| `explain_change` | Why did X change? Top contributing segments, traffic vs conversion rate, start date |
| `detect_anomalies` | Anything unusual? Weekday-adjusted outliers, level shifts, sparklines |
| `check_tracking_health` | Can we trust the data? GA4 vs HubSpot reconciliation, broken forms, (not set) traffic |
| `search_console_report` | Top queries/pages, biggest movers, striking-distance opportunities |
| `hubspot_funnel` | Contacts by source, lifecycle mix, pipeline, won revenue |
| `run_ga4_report` | Any GA4 dimensions and metrics |

Prompts: `weekly_report`, `diagnose_drop`, `seo_opportunities`. Details: [docs/tools.md](docs/tools.md).

## Safe by design

- **Read-only:** every tool is annotated `readOnlyHint` and uses read-only scopes.
- **Runs locally:** credentials stay on your machine (stdio, no hosted service).
- **Compact output:** pre-aggregated markdown tables instead of raw API JSON, so you get fewer tokens and better answers.

## Develop

```bash
npm install          # also builds
npm test             # end-to-end tests against demo data
npm run inspect      # MCP Inspector UI with demo data
```

Branching and releases: [CONTRIBUTING.md](CONTRIBUTING.md) · Design notes: [docs/architecture.md](docs/architecture.md)

---

Built by **[zov911](https://zov911.com)**. Want this connected to *your* stack (BigQuery, Salesforce, ad platforms)? **[Reach out →](https://zov911.com)**

© zov911. All rights reserved.
