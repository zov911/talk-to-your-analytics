# Connect GA4 + Search Console

One service account covers both. ~5 minutes.

1. **Create the service account:** [Google Cloud Console](https://console.cloud.google.com/) → IAM & Admin → Service Accounts → *Create*. No roles needed.
2. **Create a key:** open it → Keys → *Add key* → JSON. Save the file somewhere safe.
3. **Enable APIs** in the same project: *Google Analytics Data API* and *Google Search Console API*.
4. **Grant GA4 access:** GA4 → Admin → Property access management → add the service account email as **Viewer**.
5. **Grant Search Console access:** Search Console → Settings → Users and permissions → add the email (**Restricted** is enough).
6. **Find your IDs:**
   - GA4 property ID: GA4 → Admin → Property details (a number like `123456789`)
   - Search Console site: `sc-domain:example.com` for a domain property, or the exact URL prefix `https://www.example.com/`
7. **Set env vars** ([setup.md](setup.md)):
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
   GA4_PROPERTY_ID=123456789
   GSC_SITE_URL=sc-domain:example.com
   ```

Scopes used (read-only): `analytics.readonly`, `webmasters.readonly`.

> Keep the JSON key out of git. Anyone with the file can read your analytics.
