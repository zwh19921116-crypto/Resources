/**
 * Edgeducate — SiteScout anonymous fetch proxy (Cloudflare Worker).
 *
 * Lets the admin research other companies' PUBLIC pages without exposing your own IP address.
 * The admin calls this Worker, and the Worker fetches the target page server-side, so the
 * company you are researching only ever sees Cloudflare's servers in their logs — not you.
 *
 * It only reads PUBLIC pages (same as any normal visitor) and is protected by a secret so it
 * can't be abused as an open proxy by anyone else.
 *
 * -------------------------------------------------------------------------------------------
 * FREE: Cloudflare Workers free tier = 100,000 requests/day. No billing required.
 * -------------------------------------------------------------------------------------------
 * SETUP
 * 1. Cloudflare -> Workers & Pages -> Create -> Create Worker -> paste this file -> Deploy.
 * 2. Worker -> Settings -> Variables and Secrets -> add an ENCRYPTED secret:
 *      - SCOUT_SECRET : any long random string (the admin sends this to use the proxy).
 * 3. In the admin: SiteScout -> "Private scouting" -> paste the Worker URL and SCOUT_SECRET.
 * -------------------------------------------------------------------------------------------
 * ADMIN CALL
 *   GET /fetch?url=<encoded target url>
 *   Header: x-scout-secret: <SCOUT_SECRET>   (or ?secret=<SCOUT_SECRET>)
 * -------------------------------------------------------------------------------------------
 */

const ALLOWED_ORIGINS = [
  'https://edgeducate.com.au',
  'https://resources.edgeducate.com.au',
  'null' // file:// admin and Electron send Origin: null
];

const MAX_BYTES = 3_000_000; // cap response size

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'x-scout-secret, content-type',
    'Access-Control-Max-Age': '86400'
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    const url = new URL(request.url);
    if (url.pathname !== '/fetch') {
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json', ...corsHeaders(origin) } });
    }

    const secret = request.headers.get('x-scout-secret') || url.searchParams.get('secret') || '';
    if (!env.SCOUT_SECRET || secret !== env.SCOUT_SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json', ...corsHeaders(origin) } });
    }

    const target = url.searchParams.get('url');
    let parsed;
    try {
      parsed = new URL(target);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'bad url' }), { status: 400, headers: { 'content-type': 'application/json', ...corsHeaders(origin) } });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return new Response(JSON.stringify({ error: 'only http(s)' }), { status: 400, headers: { 'content-type': 'application/json', ...corsHeaders(origin) } });
    }

    try {
      // Neutral, generic request — forwards none of the caller's identifying headers.
      const upstream = await fetch(parsed.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SiteScoutBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        redirect: 'follow'
      });
      const buffer = await upstream.arrayBuffer();
      const body = buffer.byteLength > MAX_BYTES ? buffer.slice(0, MAX_BYTES) : buffer;
      const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
      return new Response(body, {
        status: upstream.status,
        headers: { 'content-type': contentType, ...corsHeaders(origin) }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error && error.message ? error.message : error) }), { status: 502, headers: { 'content-type': 'application/json', ...corsHeaders(origin) } });
    }
  }
};
