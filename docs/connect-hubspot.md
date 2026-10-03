# Connect HubSpot

~2 minutes. Needs Super Admin (or app-creation) rights.

1. HubSpot → Settings → Integrations → **Private Apps** (in newer portals: Development → Legacy apps → *Create private app*).
2. Name it `talk-to-your-analytics`.
3. **Scopes** tab → add (read only):
   - `crm.objects.contacts.read`
   - `crm.objects.deals.read`
4. *Create app* → copy the access token (`pat-…`).
5. Set `HUBSPOT_ACCESS_TOKEN=pat-…` ([setup.md](setup.md)).

What's read: contact `createdate`, `hs_analytics_source` (original source), `lifecyclestage`; deal `createdate`, `amount`, `dealstage`, `hs_is_closed_won`, `closedate`. Nothing is written.

Large portals: the search API returns up to 10,000 records per query. The default cap is `HUBSPOT_MAX_RECORDS=5000`, and tools tell you when results were truncated.
