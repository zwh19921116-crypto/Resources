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
 * ADMIN CALLS (all need header x-gsc-secret: <GSC_SECRET>, or ?secret=<GSC_SECRET>)
 *   GET /page?url=<encoded page url>&site=sc-domain:edgeducate.com.au&days=28
 *       Search analytics (totals + top queries) for one page.
 *   GET /site?site=sc-domain:edgeducate.com.au&days=90&dimension=query|page
 *       Site-wide top queries or pages (up to 250 rows).
 *   GET /inspect?url=<encoded page url>&site=sc-domain:edgeducate.com.au
 *       URL Inspection: whether Google has indexed the page, and why not (2,000/day per site).
 *   GET /suggest?q=<phrase>&q=<phrase>...&hl=en-AU&gl=au
 *       Google search suggestions for up to 40 phrases (keyword popularity research).
 *   GET /keywords?q=<phrase>&q=<phrase>...&url=<page url>&geo=2036&lang=1000
 *       Google Keyword Planner ideas (monthly searches, competition, bids) for up to 20 seed
 *       phrases, optionally seeded with a page URL. Returns { configured: false } until set up.
 * -------------------------------------------------------------------------------------------
 * OPTIONAL: GOOGLE KEYWORD PLANNER (Google Ads API — free, no ad spend needed)
 * 1. Create a Google Ads account (ads.google.com) and note its 10-digit Customer ID.
 * 2. In the SAME Google Cloud project as the OAuth client above: enable "Google Ads API",
 *    complete brand verification, then on the Google Ads API Overview page apply for
 *    BASIC access (Explorer access cannot use Keyword Planner).
 * 3. In the OAuth Playground (same client id/secret), authorise BOTH scopes
 *      https://www.googleapis.com/auth/webmasters.readonly
 *      https://www.googleapis.com/auth/adwords
 *    and copy the new refresh token.
 * 4. Add Worker secrets:
 *      - ADS_CUSTOMER_ID       : Google Ads customer ID (digits only, no dashes)
 *      - ADS_REFRESH_TOKEN     : the refresh token from step 3
 *      - ADS_LOGIN_CUSTOMER_ID : (optional) manager account ID, only if you sign in via one
 *      - ADS_API_VERSION       : (optional) defaults to v26
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

async function inspectUrl(env, site, pageUrl) {
  const token = await getAccessToken(env);
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: pageUrl, siteUrl: site, languageCode: 'en-AU' })
  });
  if (!res.ok) throw new Error(`inspect ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const r = (data.inspectionResult && data.inspectionResult.indexStatusResult) || {};
  return {
    verdict: r.verdict || '',
    coverageState: r.coverageState || '',
    indexingState: r.indexingState || '',
    robotsTxtState: r.robotsTxtState || '',
    pageFetchState: r.pageFetchState || '',
    lastCrawlTime: r.lastCrawlTime || '',
    crawledAs: r.crawledAs || '',
    googleCanonical: r.googleCanonical || '',
    userCanonical: r.userCanonical || '',
    sitemap: r.sitemap || [],
    referringUrls: r.referringUrls || [],
    inspectionLink: (data.inspectionResult && data.inspectionResult.inspectionResultLink) || ''
  };
}

async function googleSuggestions(phrase, hl, gl) {
  const target = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&q=${encodeURIComponent(phrase)}`;
  try {
    const res = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EdgeducateAdmin/1.0)' } });
    if (!res.ok) return [];
    const data = JSON.parse(await res.text());
    return Array.isArray(data[1]) ? data[1].slice(0, 10) : [];
  } catch (error) {
    return [];
  }
}

let cachedAdsToken = null; // { token, expiresAt }

async function getAdsAccessToken(env) {
  if (cachedAdsToken && cachedAdsToken.expiresAt > Date.now() + 60_000) return cachedAdsToken.token;
  const body = new URLSearchParams({
    client_id: env.GSC_CLIENT_ID,
    client_secret: env.GSC_CLIENT_SECRET,
    refresh_token: env.ADS_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cachedAdsToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedAdsToken.token;
}

function adsMissingSecrets(env) {
  return ['GSC_CLIENT_ID', 'GSC_CLIENT_SECRET', 'ADS_CUSTOMER_ID', 'ADS_REFRESH_TOKEN'].filter((name) => !env[name]);
}

// Turns a Google Ads API error into a short, actionable message for the admin.
function adsErrorMessage(status, text) {
  let detail = text;
  try {
    const parsed = JSON.parse(text);
    const err = Array.isArray(parsed) ? parsed[0].error : parsed.error;
    const first = err && err.details && err.details[0] && err.details[0].errors && err.details[0].errors[0];
    detail = (first && first.message) || (err && err.message) || text;
    const code = first && first.errorCode ? JSON.stringify(first.errorCode) : '';
    if (/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|ACTION_NOT_PERMITTED/.test(code + detail)) {
      return 'Google Ads API access level is too low. Apply for Basic access on the Google Ads API Overview page in Google Cloud (Explorer access cannot use Keyword Planner).';
    }
    if (/USER_PERMISSION_DENIED|CUSTOMER_NOT_ENABLED|NOT_ADS_USER/.test(code)) {
      return `The signed-in Google account cannot use this Google Ads customer ID. Check ADS_CUSTOMER_ID and that the refresh token was created with the account that owns it. (${detail})`;
    }
  } catch (error) { /* keep raw text */ }
  if (status === 401 || status === 403) return `Google Ads API refused access (${status}). Make sure the refresh token includes the adwords scope and the Google Ads API is enabled. ${detail}`;
  return `Google Ads API ${status}: ${String(detail).slice(0, 400)}`;
}

async function keywordIdeas(env, { seeds, pageUrl, geo, lang }) {
  const version = env.ADS_API_VERSION || 'v26';
  const customerId = String(env.ADS_CUSTOMER_ID).replace(/\D/g, '');
  const token = await getAdsAccessToken(env);
  const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
  if (env.ADS_LOGIN_CUSTOMER_ID) headers['login-customer-id'] = String(env.ADS_LOGIN_CUSTOMER_ID).replace(/\D/g, '');
  const body = {
    language: `languageConstants/${lang}`,
    geoTargetConstants: [`geoTargetConstants/${geo}`],
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    includeAdultKeywords: false,
    pageSize: 300
  };
  if (seeds.length && pageUrl) body.keywordAndUrlSeed = { url: pageUrl, keywords: seeds };
  else if (seeds.length) body.keywordSeed = { keywords: seeds };
  else body.urlSeed = { url: pageUrl };
  const res = await fetch(`https://googleads.googleapis.com/${version}/customers/${customerId}:generateKeywordIdeas`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(adsErrorMessage(res.status, text));
  const data = JSON.parse(text || '{}');
  const micros = (value) => (value === undefined || value === null ? null : Number(value) / 1e6);
  return (data.results || []).map((r) => {
    const m = r.keywordIdeaMetrics || {};
    return {
      text: r.text,
      avgMonthlySearches: m.avgMonthlySearches === undefined ? null : Number(m.avgMonthlySearches),
      competition: m.competition || 'UNSPECIFIED',
      competitionIndex: m.competitionIndex === undefined ? null : Number(m.competitionIndex),
      lowBid: micros(m.lowTopOfPageBidMicros),
      highBid: micros(m.highTopOfPageBidMicros),
      monthly: (m.monthlySearchVolumes || []).map((v) => ({ year: Number(v.year), month: v.month, searches: Number(v.monthlySearches || 0) }))
    };
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    const url = new URL(request.url);
    if (!['/page', '/site', '/inspect', '/suggest', '/keywords'].includes(url.pathname)) return json({ error: 'not found' }, 404, origin);

    const secret = request.headers.get('x-gsc-secret') || url.searchParams.get('secret') || '';
    if (!env.GSC_SECRET || secret !== env.GSC_SECRET) return json({ error: 'unauthorized' }, 401, origin);

    const site = url.searchParams.get('site') || 'sc-domain:edgeducate.com.au';
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '28', 10), 1), 480);

    if (url.pathname === '/suggest') {
      const phrases = [...new Set(url.searchParams.getAll('q').map((q) => q.trim()).filter(Boolean))].slice(0, 40);
      if (!phrases.length) return json({ error: 'missing q' }, 400, origin);
      const hl = url.searchParams.get('hl') || 'en-AU';
      const gl = url.searchParams.get('gl') || 'au';
      const lists = await Promise.all(phrases.map((phrase) => googleSuggestions(phrase, hl, gl)));
      const results = {};
      phrases.forEach((phrase, i) => { results[phrase] = lists[i]; });
      return json({ hl, gl, results }, 200, origin);
    }

    if (url.pathname === '/keywords') {
      const missing = adsMissingSecrets(env);
      if (missing.length) return json({ configured: false, missing }, 200, origin);
      const seeds = [...new Set(url.searchParams.getAll('q').map((q) => q.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
      const pageUrl = url.searchParams.get('url') || '';
      if (!seeds.length && !pageUrl) return json({ error: 'missing q or url' }, 400, origin);
      const geo = (url.searchParams.get('geo') || '2036').replace(/\D/g, '') || '2036'; // 2036 = Australia
      const lang = (url.searchParams.get('lang') || '1000').replace(/\D/g, '') || '1000'; // 1000 = English
      try {
        const ideas = await keywordIdeas(env, { seeds, pageUrl, geo, lang });
        return json({ configured: true, geo, lang, seeds, ideas }, 200, origin);
      } catch (error) {
        return json({ configured: true, error: String(error && error.message ? error.message : error) }, 502, origin);
      }
    }

    if (url.pathname === '/inspect') {
      const pageUrl = url.searchParams.get('url');
      if (!pageUrl) return json({ error: 'missing url' }, 400, origin);
      try {
        return json({ url: pageUrl, site, ...(await inspectUrl(env, site, pageUrl)) }, 200, origin);
      } catch (error) {
        return json({ error: String(error && error.message ? error.message : error) }, 502, origin);
      }
    }

    const startDate = dateString(days + 2); // GSC data lags ~2 days
    const endDate = dateString(2);

    if (url.pathname === '/site') {
      const dimension = url.searchParams.get('dimension') === 'page' ? 'page' : 'query';
      try {
        const data = await querySearchAnalytics(env, site, { startDate, endDate, dimensions: [dimension], rowLimit: 250 });
        const rows = (data.rows || []).map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
        return json({ site, days, startDate, endDate, dimension, rows }, 200, origin);
      } catch (error) {
        return json({ error: String(error && error.message ? error.message : error) }, 502, origin);
      }
    }

    const pageUrl = url.searchParams.get('url');
    if (!pageUrl) return json({ error: 'missing url' }, 400, origin);
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
