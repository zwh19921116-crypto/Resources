const FLUSH_INTERVAL_MS = 60_000; // batch impressions for up to 1 minute before writing to D1

export class ImpressionCounterV2 {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const adId = url.searchParams.get('ad');
    if (!adId) return new Response('missing ad', { status: 400 });

    // Buffer in the Durable Object's own persistent storage (not an in-memory Map) so the
    // count survives even if Cloudflare evicts this object from memory before the alarm fires.
    const key = `pending:${adId}`;
    const current = (await this.state.storage.get(key)) || 0;
    await this.state.storage.put(key, current + 1);
    console.log(`[ImpressionCounterV2] queued ${adId}, now pending=${current + 1}`);

    const alarm = await this.state.storage.getAlarm();
    if (!alarm) {
      await this.state.storage.setAlarm(Date.now() + FLUSH_INTERVAL_MS);
      console.log('[ImpressionCounterV2] scheduled new alarm');
    }

    return new Response('ok');
  }

  async alarm() {
    const all = await this.state.storage.list({ prefix: 'pending:' });
    if (this.env.ANALYTICS_ENABLED !== 'true') {
      for (const key of all.keys()) await this.state.storage.delete(key);
      return;
    }
    console.log(`[ImpressionCounterV2] ALARM FIRED, flushing ${all.size} ad(s)`);
    for (const [key, n] of all) {
      const adId = key.slice('pending:'.length);
      try {
        await this.env.DB
          .prepare('INSERT INTO impressions (ad_id, count) VALUES (?1, ?2) ON CONFLICT(ad_id) DO UPDATE SET count = count + ?2')
          .bind(adId, n)
          .run();
        await this.state.storage.delete(key);
        console.log(`[ImpressionCounterV2] wrote ${adId} +${n} to D1`);
      } catch (e) {
        console.log(`[ImpressionCounterV2] D1 WRITE FAILED for ${adId}: ${e.message}`);
      }
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
      if (env.ANALYTICS_ENABLED !== 'true') return new Response(null, { status: 204, headers: cors });
      const adId = url.searchParams.get('ad');
      if (!adId) return new Response('missing ad', { status: 400, headers: cors });
      const id = env.COUNTER.idFromName('global');
      await env.COUNTER.get(id).fetch(request);
      return new Response('ok', { status: 200, headers: cors });
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      if (env.ANALYTICS_ENABLED !== 'true') return new Response(JSON.stringify({ enabled: false }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.STATS_SECRET}`) return new Response('unauthorized', { status: 401, headers: cors });
      const { results } = await env.DB.prepare('SELECT ad_id, count FROM impressions').all();
      const out = {};
      for (const row of results) out[row.ad_id] = row.count;
      return new Response(JSON.stringify(out), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/' || url.pathname === '/Resources' || url.pathname === '/Resources/') {
      return env.ASSETS.fetch(new Request(new URL('/resources.html', request.url), request));
    }

    if (url.pathname === '/resources' || url.pathname === '/resources/' || url.pathname === '/resources/all-resources' || url.pathname === '/resources/all-resources/') {
      return env.ASSETS.fetch(new Request(new URL('/all-resources.html', request.url), request));
    }

    return env.ASSETS.fetch(request);
  }
};
