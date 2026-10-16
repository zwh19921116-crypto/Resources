/**
 * Edgeducate — Google Search Console proxy (Cloudflare Worker, OAuth / no-key method).
 *
 * Returns REAL search analytics (clicks, impressions, CTR, average position and the top
 * queries) for a given page, so the admin site-map panel can show how each page actually
 * performs in Google — and where to improve to earn sitelinks.
 *
 * -------------------------------------------------------------------------------------------
 * EVERYTHING HERE IS FREE:
 *   - Search Console API is free and needs no billing on the Cloud project.
 *   - Cloudflare Workers free tier = 100,000 requests/day (admin use is a few requests).
 *
 * This version uses an OAuth refresh token instead of a downloadable service-account key,
 * so it works even when an organisation blocks service-account key creation.
 * -------------------------------------------------------------------------------------------
 * ONE-TIME SETUP (summary — the admin walks you through each step):
 * 1. Google Cloud -> enable "Google Search Console API".
 * 2. Configure the OAuth consent screen (External, add yourself as a Test user).
 * 3. Create an OAuth client ID (type: Web application) with redirect URI
 *      https://developers.google.com/oauthplayground
 *    Note the Client ID and Client Secret.
 * 4. At https://developers.google.com/oauthplayground (gear icon -> "Use your own OAuth
 *    credentials" -> paste client id/secret), authorise the scope
 *      https://www.googleapis.com/auth/webmasters.readonly
 *    then "Exchange authorization code for tokens" and copy the Refresh token.
 * 5. Cloudflare -> create a Worker -> paste this file -> Deploy.
 * 6. Worker -> Settings -> Variables (all ENCRYPTED):
 *      - GSC_CLIENT_ID     : OAuth client ID
 *      - GSC_CLIENT_SECRET : OAuth client secret
 *      - GSC_REFRESH_TOKEN : the refresh token from step 4
 *      - GSC_SECRET        : any long random string (the admin sends this to read data)
 * -------------------------------------------------------------------------------------------
 * ADMIN CALL
 *   GET /page?url=<encoded page url>&site=sc-domain:edgeducate.com.au&days=28
 *   Header: x-gsc-secret: <GSC_SECRET>   (or ?secret=<GSC_SECRET>)
 * -------------------------------------------------------------------------------------------
 */

const ALLOWED_ORIGINS = [
  'https://edgeducate.com.au',
  'https://resources.edgeducate.com.au',
  'null' // file:// admin and Electron send Origin: null
];

let cachedToken = null; // { token, expiresAt }

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'x-gsc-secret, content-type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) }
  });
}

async function getAccessToken(env) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const body = new URLSearchParams({
    client_id: env.GSC_CLIENT_ID,
    client_secret: env.GSC_CLIENT_SECRET,
    refresh_token: env.GSC_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function querySearchAnalytics(env, site, body) {
  const token = await getAccessToken(env);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  if (!res.ok) throw new Error(`query ${res.status}: ${await res.text()}`);
  return res.json();
}

function dateString(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    const url = new URL(request.url);
    if (url.pathname !== '/page') return json({ error: 'not found' }, 404, origin);

    const secret = request.headers.get('x-gsc-secret') || url.searchParams.get('secret') || '';
    if (!env.GSC_SECRET || secret !== env.GSC_SECRET) return json({ error: 'unauthorized' }, 401, origin);

    const pageUrl = url.searchParams.get('url');
    const site = url.searchParams.get('site') || 'sc-domain:edgeducate.com.au';
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '28', 10), 1), 180);
    if (!pageUrl) return json({ error: 'missing url' }, 400, origin);

    const startDate = dateString(days + 2); // GSC data lags ~2 days
    const endDate = dateString(2);
    const pageFilter = {
      dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }] }]
    };

    try {
      const [totalsData, queryData] = await Promise.all([
        querySearchAnalytics(env, site, { startDate, endDate, ...pageFilter, rowLimit: 1 }),
        querySearchAnalytics(env, site, { startDate, endDate, dimensions: ['query'], ...pageFilter, rowLimit: 10 })
      ]);
      const totalsRow = (totalsData.rows && totalsData.rows[0]) || null;
      const totals = totalsRow
        ? { clicks: totalsRow.clicks, impressions: totalsRow.impressions, ctr: totalsRow.ctr, position: totalsRow.position }
        : { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      const queries = (queryData.rows || []).map((r) => ({
        query: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position
      }));
      return json({ url: pageUrl, site, days, startDate, endDate, totals, queries }, 200, origin);
    } catch (error) {
      return json({ error: String(error && error.message ? error.message : error) }, 502, origin);
    }
  }
};
