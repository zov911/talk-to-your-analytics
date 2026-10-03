# Setup

Requires Node.js 20+.

## Claude Code

```bash
claude mcp add analytics \
  -e GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
  -e GA4_PROPERTY_ID=123456789 \
  -e GSC_SITE_URL=sc-domain:example.com \
  -e HUBSPOT_ACCESS_TOKEN=pat-na1-... \
  -- npx -y github:zov911/talk-to-your-analytics
```

Check it's running: `claude mcp list`.

## Claude Desktop

Edit the config file, then fully restart Claude:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "analytics": {
      "command": "npx",
      "args": ["-y", "github:zov911/talk-to-your-analytics"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json",
        "GA4_PROPERTY_ID": "123456789",
        "GSC_SITE_URL": "sc-domain:example.com",
        "HUBSPOT_ACCESS_TOKEN": "pat-na1-..."
      }
    }
  }
}
```

## Cursor / other MCP clients

Same command and env vars: `npx -y github:zov911/talk-to-your-analytics`.

## From a local clone

```bash
git clone https://github.com/zov911/talk-to-your-analytics && cd talk-to-your-analytics
npm install
```
Use `"command": "node", "args": ["/absolute/path/talk-to-your-analytics/dist/src/index.js"]`.

## Environment variables

| Variable | Required for | Example |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | GA4, Search Console | `/path/sa.json` (or `GOOGLE_SERVICE_ACCOUNT_JSON` with the JSON inline) |
| `GA4_PROPERTY_ID` | GA4 | `123456789` |
| `GSC_SITE_URL` | Search Console | `sc-domain:example.com` or `https://www.example.com/` |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot | `pat-na1-…` |
| `HUBSPOT_MAX_RECORDS` | optional | `5000` (cap per query) |
| `ANALYTICS_DEMO` | optional | `true` = sample data (same as `--demo`) |

With nothing configured, the server starts in demo mode.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Tools don't appear | Restart the client fully; check `node -v` ≥ 20 |
| `Google auth failed` | Wrong JSON path, or the key was deleted in Google Cloud |
| `Google API 403` | Service account not added to the GA4 property / Search Console site |
| `HubSpot 401/403` | Token missing `crm.objects.contacts.read` / `crm.objects.deals.read` |
| Numbers differ slightly from the GA4 UI | GA4 UI may apply thresholding/sampling; the API returns unsampled totals for the range |
