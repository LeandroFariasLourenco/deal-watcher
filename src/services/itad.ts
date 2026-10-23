import axios from 'axios';
import { ITADGame, ITADPriceResponse, ITADGameDetails, ITADHistoryPrice, ITADWaitlistGame, ITADIgnoredGame, ITADGameSub, ITADGameBundle, ITADNotification, ITADWaitlistNotificationDetail, ITADGamesOverview } from '../types/itad';
import { cache, CACHE_TTL, COLLECTIONS } from './cache';
import { ITAD_API_BASE } from './itad-endpoints';
import { APP_COUNTRY, findStoreConfig } from '../app/shared/constants';

export const ALLOWED_SHOP_IDS: number[] = [4, 36, 16, 48, 35, 62, 61, 50];

export class ITADService {
  private get client() {
    return axios.create({
      baseURL: ITAD_API_BASE,
      headers: {
        Accept: 'application/json'
      }
    });
  }

  private resolveCountry(country?: string): string {
    return (country || APP_COUNTRY).trim().toUpperCase() || APP_COUNTRY;
  }

  private resolveShops(shops?: number[]): number[] {
    if (Array.isArray(shops) && shops.length > 0) {
      const valid = shops.map(Number).filter(id => !Number.isNaN(id) && id > 0);
      if (valid.length > 0) {
        return valid;
      }
    }
    return [...ALLOWED_SHOP_IDS];
  }

  async searchGames(query: string, offset = 0, limit = 20): Promise<ITADGame[]> {
    const cacheKey = `${query.toLowerCase()}:${offset}:${limit}`;
    const cached = await cache.get<ITADGame[]>(COLLECTIONS.SEARCH, cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get('/games/search/v1', {
        params: {
          title: query,
          results: limit,
        },
      });
      const data = response.data;
      await cache.set(COLLECTIONS.SEARCH, cacheKey, data, CACHE_TTL.SEARCH);
      return data;
    } catch (error) {
      console.error('ITAD Search Error:', error);
      throw error;
    }
  }

  async getDeals(
    country = APP_COUNTRY,
    offset = 0,
    limit = 20,
    shops: number[] = ALLOWED_SHOP_IDS,
    sort?: string,
    filter?: Record<string, unknown> | null
  ): Promise<any> {
    const normalizedCountry = this.resolveCountry(country);
    const targetShops = this.resolveShops(shops);
    const sortedShopsKey = [...targetShops].sort((a, b) => a - b).join(',');
    const filterKey = filter ? JSON.stringify(filter) : '';
    const cacheKey = `${normalizedCountry}:offset=${offset}:limit=${limit}:shops=${sortedShopsKey}:sort=${sort || ''}:filter=${filterKey}:nondeals=false`;
    const cached = await cache.get<any>(COLLECTIONS.DEALS, cacheKey);
    if (cached) return cached;

    try {
      const params: any = {
        country: normalizedCountry,
        offset,
        limit,
        shops: targetShops.join(','),
        nondeals: false,
      };
      if (sort) {
        params.sort = sort;
      }
      if (filter) {
        params.filter = JSON.stringify(filter);
      }
      const response = await this.client.get('/deals/v2', { params });
      const data = response.data;
      const ttl = sort === 'steam-players' || sort === '-steam-players' ? CACHE_TTL.DEALS_STEAM_PLAYERS : CACHE_TTL.DEALS;
      await cache.set(COLLECTIONS.DEALS, cacheKey, data, ttl);
      return data;
    } catch (error) {
      console.error('ITAD Deals Error:', error);
      throw error;
    }
  }

  async lookupBySteamAppId(appId: string | number): Promise<string | null> {
    const cacheKey = `steam:${appId}`;
    const cached = await cache.get<string>(COLLECTIONS.LOOKUPS, cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get('/games/lookup/v1', {
        params: {
          appid: appId,
        },
      });
      const id = response.data.id || null;
      if (id) await cache.set(COLLECTIONS.LOOKUPS, cacheKey, id, CACHE_TTL.LOOKUPS);
      return id;
    } catch (error) {
      console.error('ITAD Lookup Error:', error);
      return null;
    }
  }

  async getGamesOverview(uuids: string[], country = APP_COUNTRY, shops: number[] = ALLOWED_SHOP_IDS): Promise<ITADGamesOverview> {
    const normalizedCountry = this.resolveCountry(country);
    const targetShops = this.resolveShops(shops);
    const sortedShopsKey = [...targetShops].sort((a, b) => a - b).join(',');
    const cacheKey = `${[...uuids].sort().join(',')}:${normalizedCountry}:${sortedShopsKey}`;
    const cached = await cache.get<ITADGamesOverview>(COLLECTIONS.OVERVIEW, cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.post('/games/overview/v2', JSON.stringify(uuids), {
        params: {
          country: normalizedCountry,
          shops: targetShops.join(','),
        },
        headers: {
          'Content-Type': 'text/plain'
        },
        transformRequest: [(data) => data]
      });
      const data = response.data as ITADGamesOverview;
      const overview: ITADGamesOverview = {
        prices: Array.isArray(data?.prices) ? data.prices : [],
        bundles: Array.isArray(data?.bundles) ? data.bundles : [],
      };
      await cache.set(COLLECTIONS.OVERVIEW, cacheKey, overview, CACHE_TTL.OVERVIEW);
      return overview;
    } catch (error) {
      console.error('ITAD Overview Error:', error);
      throw error;
    }
  }

  async getPrices(uuids: string[], country = APP_COUNTRY, shops: number[] = ALLOWED_SHOP_IDS): Promise<ITADPriceResponse> {
    const normalizedCountry = this.resolveCountry(country);
    const targetShops = this.resolveShops(shops);
    const sortedShopsKey = [...targetShops].sort((a, b) => a - b).join(',');
    const cacheKey = `v3:${[...uuids].sort().join(',')}:${normalizedCountry}:${sortedShopsKey}`;
    const cached = await cache.get<ITADPriceResponse>(COLLECTIONS.PRICES, cacheKey);
    if (cached) return cached;

    try {
      // Browser CORS: application/json triggers a preflight that ITAD rejects.
      // text/plain is a simple request and the API still parses the JSON body.
      const response = await this.client.post('/games/prices/v3', JSON.stringify(uuids), {
        params: {
          country: normalizedCountry,
          shops: targetShops.join(','),
        },
        headers: {
          'Content-Type': 'text/plain'
        },
        transformRequest: [(data) => data]
      });
      const data = Array.isArray(response.data) ? response.data : [];
      await cache.set(COLLECTIONS.PRICES, cacheKey, data, CACHE_TTL.PRICES);
      return data;
    } catch (error) {
      console.error('ITAD Prices Error:', error);
      throw error;
    }
  }

  async getGameInfo(uuid: string): Promise<any> {
    const cacheKey = `info:${uuid}`;
    const cached = await cache.get<any>(COLLECTIONS.DETAILS, cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get('/games/info/v2', {
        params: { id: uuid }
      });
      const info = response.data;
      await cache.set(COLLECTIONS.DETAILS, cacheKey, info, CACHE_TTL.DETAILS);
      return info;
    } catch (error) {
      console.error('ITAD Game Info Error:', error);
      throw error;
    }
  }

  async getGameDeals(uuid: string, country = APP_COUNTRY, shops: number[] = ALLOWED_SHOP_IDS): Promise<any[]> {
    const normalizedCountry = this.resolveCountry(country);
    const targetShops = this.resolveShops(shops);
    try {
      const priceResponse = await this.getPrices([uuid], normalizedCountry, targetShops);
      return this.normalizeDeals(priceResponse, uuid, targetShops);
    } catch (error) {
      console.error('ITAD Game Deals Error:', error);
      throw error;
    }
  }

  private normalizeDeals(priceResponse: ITADPriceResponse | any[], uuid: string, targetShops: number[]): any[] {
    const gameDeals = Array.isArray(priceResponse)
      ? priceResponse.find((item: any) => item.id === uuid)
      : (priceResponse as any)?.[uuid];
    const rawDeals = gameDeals?.deals || [];
    const historyLow = gameDeals?.historyLow?.all ?? gameDeals?.historyLow ?? null;
    return rawDeals
      .filter((d: any) => !d.shop?.id || targetShops.includes(Number(d.shop.id)))
      .map((d: any) => ({
        ...d,
        historyLow: d.historyLow || historyLow,
        drm: Array.isArray(d.drm) ? d.drm.map((x: any) => (typeof x === 'string' ? x : x?.name || 'DRM')) : []
      }));
  }

  async getGameDetails(uuid: string, country = APP_COUNTRY, shops: number[] = ALLOWED_SHOP_IDS): Promise<ITADGameDetails> {
    const normalizedCountry = this.resolveCountry(country);
    const targetShops = this.resolveShops(shops);
    const sortedShopsKey = [...targetShops].sort((a, b) => a - b).join(',');
    const cacheKey = `${uuid}:${normalizedCountry}:${sortedShopsKey}`;
    const cached = await cache.get<ITADGameDetails>(COLLECTIONS.DETAILS, cacheKey);
    if (cached) return cached;

    try {
      const infoResponse = await this.client.get('/games/info/v2', {
        params: { id: uuid }
      });
      const info = infoResponse.data;

      let normalizedDeals: any[] = [];
      try {
        normalizedDeals = await this.getGameDeals(uuid, normalizedCountry, targetShops);
      } catch (priceError) {
        console.error('ITAD Details prices fallback:', priceError);
      }

      const details: ITADGameDetails = {
        info: info,
        prices: normalizedDeals,
        history: []
      };

      await cache.set(
        COLLECTIONS.DETAILS,
        cacheKey,
        details,
        normalizedDeals.length > 0 ? CACHE_TTL.DETAILS : CACHE_TTL.DETAILS_PARTIAL
      );
      return details;
    } catch (error) {
      console.error('ITAD Details Error:', error);
      throw error;
    }
  }

  async getGameSubs(uuid: string, country = APP_COUNTRY): Promise<ITADGameSub[]> {
    const normalizedCountry = this.resolveCountry(country);
    const cacheKey = `subs-v2:${uuid}:${normalizedCountry}`;
    const cached = await cache.get<ITADGameSub[]>(COLLECTIONS.SUBS, cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.post(`/games/subs/v1?country=${encodeURIComponent(normalizedCountry)}`, JSON.stringify([uuid]), {
        params: {
          country: normalizedCountry,
        },
        headers: {
          'Content-Type': 'text/plain'
        },
        transformRequest: [(data) => data]
      });

      const payload = Array.isArray(response.data) ? response.data : [];
      const match = payload.find((item: any) => item?.id === uuid) || payload[0];
      const rawSubs = Array.isArray(match?.subs) ? match.subs : [];
      const subs: ITADGameSub[] = rawSubs
        .map((item: any) => {
          const name = item?.name || item?.title || item?.shop?.name || 'Assinatura';
          const shopFromApi = item?.shop?.id != null
            ? { id: Number(item.shop.id), name: item.shop.name || name }
            : null;
          const inferred = findStoreConfig(shopFromApi?.id, shopFromApi?.name || name);
          return {
            id: item?.id ?? shopFromApi?.id ?? name,
            name,
            shop: inferred
              ? { id: inferred.id, name: inferred.displayName }
              : shopFromApi
          };
        })
        .filter((item: ITADGameSub) => !!item.name);

      await cache.set(COLLECTIONS.SUBS, cacheKey, subs, CACHE_TTL.SUBS);
      return subs;
    } catch (error) {
      console.error('ITAD Subs Error:', error);
      throw error;
    }
  }

  async getGameBundles(uuid: string, country = APP_COUNTRY): Promise<ITADGameBundle[]> {
    const normalizedCountry = this.resolveCountry(country);
    const cacheKey = `${uuid}:${normalizedCountry}:expired=false`;
    const cached = await cache.get<ITADGameBundle[]>(COLLECTIONS.BUNDLES, cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get('/games/bundles/v2', {
        params: {
          id: uuid,
          country: normalizedCountry,
          expired: false
        }
      });

      const rawList = Array.isArray(response.data) ? response.data : [];
      const bundles: ITADGameBundle[] = rawList
        .map((item: any) => ({
          id: item?.id,
          title: item?.title || 'Bundle',
          url: item?.url || item?.page?.url || null,
          details: item?.details || null,
          expiry: item?.expiry || null,
          publish: item?.publish || null,
          note: item?.note || null
        }))
        .filter((item: ITADGameBundle) => item.id != null && !!item.title);

      await cache.set(COLLECTIONS.BUNDLES, cacheKey, bundles, CACHE_TTL.BUNDLES);
      return bundles;
    } catch (error) {
      console.error('ITAD Bundles Error:', error);
      throw error;
    }
  }

  async getHistory(uuid: string, country = APP_COUNTRY, shops: number[] = ALLOWED_SHOP_IDS): Promise<ITADHistoryPrice[]> {
    const normalizedCountry = this.resolveCountry(country);
    const targetShops = this.resolveShops(shops);
    const sortedShopsKey = [...targetShops].sort((a, b) => a - b).join(',');
    const cacheKey = `${uuid}:${normalizedCountry}:${sortedShopsKey}`;
    const cached = await cache.get<ITADHistoryPrice[]>(COLLECTIONS.HISTORY, cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get('/games/history/v2', {
        params: {
          id: uuid,
          country: normalizedCountry,
          shops: targetShops.join(',')
        }
      });

      const rawHistory = Array.isArray(response.data) ? response.data : [];
      const history: ITADHistoryPrice[] = rawHistory
        .filter((item: any) => item?.timestamp && item?.deal?.price)
        .map((item: any) => ({
          timestamp: item.timestamp,
          price: item.deal.price.amount,
          shop: item.shop?.name || 'Loja',
          shopId: item.shop?.id
        }));

      await cache.set(COLLECTIONS.HISTORY, cacheKey, history, CACHE_TTL.HISTORY);
      return history;
    } catch (error) {
      console.error('ITAD History Error:', error);
      throw error;
    }
  }

  async getGiveaways(offset = 0, limit = 20, sort?: string): Promise<any[]> {
    const cacheKey = `${offset}:${limit}:${sort || 'default'}`;
    const cached = await cache.get<any[]>(COLLECTIONS.GIVEAWAYS, cacheKey);
    if (cached) return cached;

    try {
      const params: any = {
        offset,
        limit
      };
      // ITAD /giveaways/v1 only accepts 'publish' and 'expiry'.
      // Values like 'rank' cause ITAD to return HTTP 400 "Invalid 'sort' value".
      if (sort && ['publish', 'expiry'].includes(sort)) {
        params.sort = sort;
      }
      const response = await this.client.get('/giveaways/v1', { params });
      const data = response.data;
      await cache.set(COLLECTIONS.GIVEAWAYS, cacheKey, data, CACHE_TTL.GIVEAWAYS);
      return data;
    } catch (error) {
      console.error('ITAD Giveaways Error:', error);
      throw error;
    }
  }

  async getShops(country = APP_COUNTRY): Promise<any[]> {
    const normalizedCountry = this.resolveCountry(country);
    const cacheKey = `list:${normalizedCountry}`;
    const cached = await cache.get<any[]>(COLLECTIONS.SHOPS, cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get('/service/shops/v1', {
        params: { 
          country: normalizedCountry
        }
      });
      const data = response.data;
      await cache.set(COLLECTIONS.SHOPS, cacheKey, data, CACHE_TTL.SHOPS);
      return data;
    } catch (error) {
      console.error('ITAD Shops Error:', error);
      throw error;
    }
  }

  private async authorizedRequest<T>(
    accessToken: string,
    method: 'GET' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    if (!accessToken?.trim()) {
      const error = new Error('not_authenticated') as Error & { status?: number };
      error.status = 401;
      throw error;
    }
    return await this.dispatchAuthorized<T>(`${ITAD_API_BASE}${path}`, accessToken, method, body);
  }

  private async dispatchAuthorized<T>(
    url: string,
    accessToken: string,
    method: 'GET' | 'PUT' | 'DELETE',
    body?: unknown
  ): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new Error(data?.reason_phrase || data?.error || `ITAD ${method} ${url} failed`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    return data as T;
  }

  async getWaitlist(accessToken: string): Promise<ITADWaitlistGame[]> {
    const data = await this.authorizedRequest<ITADWaitlistGame[]>(accessToken, 'GET', '/waitlist/games/v1');
    return Array.isArray(data) ? data : [];
  }

  async getIgnoredGames(accessToken: string): Promise<ITADIgnoredGame[]> {
    const data = await this.authorizedRequest<ITADIgnoredGame[]>(accessToken, 'GET', '/ignored/games/v1');
    return Array.isArray(data) ? data : [];
  }

  async addToIgnored(accessToken: string, uuids: string[]): Promise<void> {
    const id = uuids[0];
    if (!id) return;
    await this.authorizedRequest<void>(accessToken, 'PUT', '/ignored/games/v1', [id]);
  }

  async removeFromIgnored(accessToken: string, uuids: string[]): Promise<void> {
    if (uuids.length === 0) return;
    await this.authorizedRequest<void>(accessToken, 'DELETE', '/ignored/games/v1', uuids);
  }

  async addToWaitlist(accessToken: string, uuids: string[]): Promise<void> {
    const id = uuids[0];
    if (!id) return;
    await this.authorizedRequest<void>(accessToken, 'PUT', '/waitlist/games/v1', [id]);
  }

  async removeFromWaitlist(accessToken: string, uuids: string[]): Promise<void> {
    if (uuids.length === 0) return;
    await this.authorizedRequest<void>(accessToken, 'DELETE', '/waitlist/games/v1', uuids);
  }

  async addWebhook(accessToken: string, url: string, events: string[]): Promise<{ id: string }> {
    return await this.authorizedRequest<{ id: string }>(accessToken, 'PUT', '/webhooks/v1', { url, events });
  }

  async removeWebhook(accessToken: string, id: string): Promise<void> {
    await this.authorizedRequest<void>(accessToken, 'DELETE', '/webhooks/v1', { id });
  }

  async getNotifications(accessToken: string): Promise<ITADNotification[]> {
    const data = await this.authorizedRequest<ITADNotification[]>(accessToken, 'GET', '/notifications/v1');
    return Array.isArray(data) ? data : [];
  }

  async getWaitlistNotification(accessToken: string, id: string): Promise<ITADWaitlistNotificationDetail> {
    const cached = await cache.get<ITADWaitlistNotificationDetail>(COLLECTIONS.NOTIFICATION_DETAILS, id);
    if (cached) return cached;

    const data = await this.authorizedRequest<ITADWaitlistNotificationDetail>(
      accessToken,
      'GET',
      `/notifications/waitlist/v1?id=${encodeURIComponent(id)}`
    );
    await cache.set(COLLECTIONS.NOTIFICATION_DETAILS, id, data, CACHE_TTL.NOTIFICATION_DETAILS);
    return data;
  }
}
