/**
 * Edgeducate ad-impression counter — Cloudflare Worker.
 *
 * Deploy this in the Cloudflare dashboard (Workers & Pages -> Create -> Worker -> paste this in,
 * "Quick edit"). Bind a KV namespace called AD_STATS to it (Settings -> Bindings -> KV Namespace
 * Bindings -> Variable name: AD_STATS).
 *
 * Endpoints:
 *   GET /track?ad=<adId>              -> increments that ad's counter by 1. Public (called from the
 *                                         live site). No secret required, so keep this endpoint cheap
 *                                         and side-effect-free besides the counter.
 *   GET /stats                        -> returns { adId: count, ... } for every ad. Requires the
 *                                         Authorization: Bearer <STATS_SECRET> header — only the
 *                                         admin app should call this.
 *
 * Set STATS_SECRET as an encrypted environment variable (Settings -> Variables -> Add variable ->
 * "Encrypt"), then put that same value into the admin app's Settings -> Analytics tab.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization'
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (url.pathname === '/track' && request.method === 'GET') {
      const adId = url.searchParams.get('ad');
      if (!adId) return new Response('missing ad', { status: 400, headers: cors });
      const key = `ad:${adId}`;
      const current = Number((await env.AD_STATS.get(key)) || '0');
      await env.AD_STATS.put(key, String(current + 1));
      return new Response('ok', { status: 200, headers: cors });
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.STATS_SECRET}`) return new Response('unauthorized', { status: 401, headers: cors });
      const list = await env.AD_STATS.list({ prefix: 'ad:' });
      const out = {};
      for (const { name } of list.keys) {
        out[name.slice(3)] = Number((await env.AD_STATS.get(name)) || '0');
      }
      return new Response(JSON.stringify(out), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    return new Response('not found', { status: 404, headers: cors });
  }
};
