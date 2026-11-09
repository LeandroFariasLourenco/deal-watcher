const STORE_LANGUAGE = "portuguese";
const STORE_COUNTRY = "br";
const CACHE_SECONDS = 60 * 60 * 24;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;
const FETCH_CONCURRENCY = 4;

const STORE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (isDlcPath(url.pathname)) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method !== "GET") {
        return json({ error: "Método não permitido" }, 405);
      }
      return listDlcs(url);
    }

    const targetUrl = "https://api.steampowered.com" + url.pathname + url.search;
    const proxyResp = await fetch(targetUrl);

    return new Response(proxyResp.body, {
      status: proxyResp.status,
      statusText: proxyResp.statusText,
      headers: CORS_HEADERS,
    });
  },
};

function isDlcPath(pathname) {
  return pathname === "/dlc" || pathname === "/dlc/";
}

async function listDlcs(url) {
  const appid = Number(url.searchParams.get("appid"));
  if (!Number.isInteger(appid) || appid <= 0) {
    return json({ error: "appid obrigatório" }, 400);
  }

  const offset = readInt(url.searchParams.get("offset"), 0, 0, 10000);
  const limit = readInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);

  let parent;
  try {
    parent = await loadApp(appid);
  } catch {
    return json({ error: "Falha ao consultar a Steam" }, 502);
  }
  if (!parent) return json({ error: "Jogo não encontrado" }, 404);

  const ids = uniqueIds(parent.dlc.filter(id => id !== appid));
  const pageIds = ids.slice(offset, offset + limit);
  const loaded = await mapPool(pageIds, FETCH_CONCURRENCY, async id => {
    try {
      return await loadApp(id);
    } catch {
      return null;
    }
  });

  return json({
    appid,
    total: ids.length,
    offset,
    limit,
    items: loaded.filter(Boolean).map(toDlcItem),
  });
}

async function loadApp(appid) {
  const cacheKey = new Request(cacheUrl(appid), { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const response = await fetch(storeUrl(appid), {
    headers: STORE_HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Steam store ${response.status}`);

  const payload = await response.json();
  const entry = payload?.[String(appid)];
  if (!entry?.success || !entry.data) return null;

  const app = normalizeApp(entry.data, appid);
  await cache.put(cacheKey, new Response(JSON.stringify(app), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  }));
  return app;
}

function storeUrl(appid) {
  return `https://store.steampowered.com/api/appdetails?appids=${appid}&l=${STORE_LANGUAGE}&cc=${STORE_COUNTRY}`;
}

function cacheUrl(appid) {
  return `https://deal-watcher-steam.feleolive2010.workers.dev/cache/appdetails?appid=${appid}&l=${STORE_LANGUAGE}&cc=${STORE_COUNTRY}`;
}

function normalizeApp(data, appid) {
  const price = data?.price_overview;
  const dlc = Array.isArray(data?.dlc) ? data.dlc : [];
  return {
    appid: Number(data?.steam_appid) || appid,
    type: typeof data?.type === "string" ? data.type : "",
    name: typeof data?.name === "string" ? data.name : "",
    is_free: Boolean(data?.is_free),
    header_image: data?.header_image || data?.capsule_image || "",
    price: price ? {
      currency: price.currency || "",
      initial: Number(price.initial) || 0,
      final: Number(price.final) || 0,
      discount_percent: Number(price.discount_percent) || 0,
      formatted: price.final_formatted || "",
    } : null,
    release_date: data?.release_date?.date || "",
    coming_soon: Boolean(data?.release_date?.coming_soon),
    dlc: dlc.map(Number).filter(id => Number.isInteger(id) && id > 0),
  };
}

function toDlcItem(app) {
  return {
    appid: app.appid,
    name: app.name,
    type: app.type,
    is_free: app.is_free,
    header_image: app.header_image,
    price: app.price,
    release_date: app.release_date,
    coming_soon: app.coming_soon,
    url: `https://store.steampowered.com/app/${app.appid}`,
  };
}

function uniqueIds(ids) {
  const seen = new Set();
  const unique = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

function readInt(value, fallback, min, max) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
