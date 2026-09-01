/**
 * Edgeducate ad-impression counter — Cloudflare Worker (D1 + Durable Object batching).
 *
 * Built for high volume (millions of impressions/day): instead of writing to the database on every
 * single impression, a Durable Object buffers counts in memory and flushes them to D1 once a minute.
 * This keeps D1 writes tiny regardless of traffic, and gives exact, race-free counts.
 *
 * ---------------------------------------------------------------------------------------------
 * SETUP (Cloudflare dashboard):
 * 1. Workers & Pages -> D1 -> Create database (name it anything, e.g. "ad_stats").
 *    Run this once in the D1 console to create the table:
 *      CREATE TABLE impressions (ad_id TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
 * 2. Workers & Pages -> Create -> Worker -> paste this whole file in ("Quick edit") -> Deploy.
 * 3. Worker -> Settings -> Bindings:
 *      - D1 database binding: variable name DB, database = the one from step 1.
 *      - Durable Object binding: variable name COUNTER, class name ImpressionCounter (this file
 *        defines that class below — Cloudflare will detect it automatically as a migration).
 * 4. Worker -> Settings -> Variables -> add an ENCRYPTED variable STATS_SECRET (any long random
 *    string) — required to read /stats from the admin app.
 * ---------------------------------------------------------------------------------------------
 */

const FLUSH_INTERVAL_MS = 60_000; // batch impressions for up to 1 minute before writing to D1

export class ImpressionCounter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.pending = new Map(); // adId -> count since last flush
  }

  async fetch(request) {
    const url = new URL(request.url);
    const adId = url.searchParams.get('ad');
    if (!adId) return new Response('missing ad', { status: 400 });

    this.pending.set(adId, (this.pending.get(adId) || 0) + 1);

    // Schedule (or reuse) a flush alarm so many rapid impressions share one D1 write.
    const current = await this.state.storage.getAlarm();
    if (!current) await this.state.storage.setAlarm(Date.now() + FLUSH_INTERVAL_MS);

    return new Response('ok');
  }

  async alarm() {
    const toFlush = this.pending;
    this.pending = new Map();
    for (const [adId, n] of toFlush) {
      await this.env.DB
        .prepare('INSERT INTO impressions (ad_id, count) VALUES (?1, ?2) ON CONFLICT(ad_id) DO UPDATE SET count = count + ?2')
        .bind(adId, n)
        .run();
    }
  }
}

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
      // One Durable Object instance total, so all impressions batch together.
      const id = env.COUNTER.idFromName('global');
      await env.COUNTER.get(id).fetch(request);
      return new Response('ok', { status: 200, headers: cors });
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.STATS_SECRET}`) return new Response('unauthorized', { status: 401, headers: cors });
      const { results } = await env.DB.prepare('SELECT ad_id, count FROM impressions').all();
      const out = {};
      for (const row of results) out[row.ad_id] = row.count;
      return new Response(JSON.stringify(out), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    return new Response('not found', { status: 404, headers: cors });
  }
};
