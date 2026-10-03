# Changelog

## [1.0.0] - 2026-10-02

### Added
- MCP server (TypeScript SDK v2, stdio) with 7 read-only tools: `get_overview`, `explain_change`, `detect_anomalies`, `check_tracking_health`, `search_console_report`, `hubspot_funnel`, `run_ga4_report`.
- Prompts: `weekly_report`, `diagnose_drop`, `seo_opportunities`.
- Sources: GA4 Data API, Search Console API (service account), HubSpot CRM search (private app token).
- Demo mode with a planted incident (broken mobile form, ranking drop).
- End-to-end tests with an in-memory MCP client; CI on pull requests.
