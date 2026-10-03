# Tools & prompts

All tools are read-only. Periods: `last_7_days` (default), `last_14_days`, `last_28_days`, `last_90_days`, `this_month`, `last_month`, or `start_date`/`end_date`. Compare: `previous_period` (default), `previous_year` (52 weeks back, same weekdays) or `none`. GA4/HubSpot periods end yesterday; Search Console ends 3 days ago (data lag).

| Tool | Key inputs | Returns |
|---|---|---|
| `get_overview` | period, compare | KPI table: GA4 sessions, users, key events, conversion and engagement rate; organic clicks, impressions, CTR, position; HubSpot contacts, MQL+, deals, pipeline, won revenue |
| `explain_change` | **metric**: `sessions`, `key_events`, `revenue`, `organic_clicks`, `organic_impressions`, `new_contacts`, `deals_created`, `won_revenue` | Change split by channel / page / device (GA4), query / page / device (GSC) or source / lifecycle / stage (HubSpot); traffic-vs-rate diagnosis per segment; estimated start date |
| `detect_anomalies` | days (42), recent_days (14), sensitivity | Sparklines, week-over-week shifts, weekday-adjusted unusual days |
| `check_tracking_health` | period (14 days) | Unassigned / (not set) share, pages that stopped converting (since when, leads lost), GA4 ↔ HubSpot daily and channel reconciliation |
| `search_console_report` | view: `top` · `movers` · `opportunities`; dimension: query · page · device · country; contains | Top rows, biggest gains and losses with position change, striking-distance and low-CTR opportunities with est. clicks |
| `hubspot_funnel` | period, compare | Contacts by original source, lifecycle mix, deals, pipeline, won revenue, contact → deal rate |
| `run_ga4_report` | dimensions, metrics, filter, limit | Any GA4 Data API report with change vs comparison |

## Prompts

| Prompt | Does |
|---|---|
| `weekly_report` | Overview → explain top movers → anomalies → tracking check → one-page report |
| `diagnose_drop` | Root cause for a metric with evidence, confidence and the first fix |
| `seo_opportunities` | Prioritized SEO actions with est. extra clicks and effort |

## Good questions

- Why did leads drop last week?
- Compare this month with the same month last year.
- Which landing pages convert worse on mobile?
- Is GA4 tracking the same leads HubSpot gets?
- What are our striking-distance keywords for "pricing"?
- Write the weekly report for the CMO.
