import axios from 'axios';
import { ITADGame, ITADPriceResponse, ITADGameDetails, ITADHistoryPrice, ITADWaitlistGame } from '../types/itad';
import { cache, COLLECTIONS } from './cache';

const ITAD_BASE_URL = 'https://api.isthereanydeal.com';

export const ALLOWED_SHOP_IDS: number[] = [4, 36, 16, 48, 35, 62, 61, 50];

export class ITADService {
  constructor(_clientId: string, _clientSecret: string) {}

  private get client() {
    return axios.create({
      baseURL: ITAD_BASE_URL,
      params: {
        key: 'f5f27e16501a779ab814878df837a45ea28a1da2'
      },
      headers: {
        Accept: 'application/json'
      }
    });
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
      await cache.set(COLLECTIONS.SEARCH, cacheKey, data, 1000 * 60 * 60 * 24);
      return data;
    } catch (error) {
      console.error('ITAD Search Error:', error);
      throw error;
    }
  }

  async getDeals(country = 'BR', offset = 0, limit = 20, shops: number[] = ALLOWED_SHOP_IDS, sort?: string): Promise<any> {
    const normalizedCountry = (country || 'BR').toUpperCase();
    const targetShops = this.resolveShops(shops);
    const sortedShopsKey = [...targetShops].sort((a, b) => a - b).join(',');
    const cacheKey = `${normalizedCountry}:${offset}:${limit}:${sortedShopsKey}:${sort || 'default'}`;
    const cached = await cache.get<any>(COLLECTIONS.DEALS, cacheKey);
    if (cached) return cached;

    try {
      const params: any = {
        country: normalizedCountry,
        offset,
        limit,
        shops: targetShops.join(','),
      };
      if (sort) {
        params.sort = sort;
      }
      const response = await this.client.get('/deals/v2', { params });
      const data = response.data;
      const ttl = sort === 'steam-players' ? 1000 * 60 * 60 * 24 : 1000 * 60 * 15;
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
      if (id) await cache.set(COLLECTIONS.LOOKUPS, cacheKey, id, 1000 * 60 * 60 * 24 * 7);
      return id;
    } catch (error) {
      console.error('ITAD Lookup Error:', error);
      return null;
    }
  }

  async getPrices(uuids: string[], country = 'BR', shops: number[] = ALLOWED_SHOP_IDS): Promise<ITADPriceResponse> {
    const normalizedCountry = (country || 'BR').toUpperCase();
    const targetShops = this.resolveShops(shops);
    const sortedShopsKey = [...targetShops].sort((a, b) => a - b).join(',');
    const cacheKey = `${[...uuids].sort().join(',')}:${normalizedCountry}:${sortedShopsKey}`;
    const cached = await cache.get<ITADPriceResponse>(COLLECTIONS.PRICES, cacheKey);
    if (cached) return cached;

    try {
      // Browser CORS: application/json triggers a preflight that ITAD rejects.
      // text/plain is a simple request and the API still parses the JSON body.
      const response = await this.client.post('/games/prices/v2', JSON.stringify(uuids), {
        params: {
          country: normalizedCountry,
          shops: targetShops.join(','),
        },
        headers: {
          'Content-Type': 'text/plain'
        },
        transformRequest: [(data) => data]
      });
      const data = response.data;
      await cache.set(COLLECTIONS.PRICES, cacheKey, data, 1000 * 60 * 15);
      return data;
    } catch (error) {
      console.error('ITAD Prices Error:', error);
      throw error;
    }
  }

  async getGameDetails(uuid: string, country = 'BR', shops: number[] = ALLOWED_SHOP_IDS): Promise<ITADGameDetails> {
    const normalizedCountry = (country || 'BR').toUpperCase();
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
        const priceResponse = await this.getPrices([uuid], normalizedCountry, targetShops);
        const gameDeals = Array.isArray(priceResponse)
          ? priceResponse.find((item: any) => item.id === uuid)
          : (priceResponse as any)?.[uuid];
        const rawDeals = gameDeals?.deals || [];
        normalizedDeals = rawDeals
          .filter((d: any) => !d.shop?.id || targetShops.includes(Number(d.shop.id)))
          .map((d: any) => ({
            ...d,
            drm: Array.isArray(d.drm) ? d.drm.map((x: any) => (typeof x === 'string' ? x : x?.name || 'DRM')) : []
          }));
      } catch (priceError) {
        console.error('ITAD Details prices fallback:', priceError);
      }

      const details: ITADGameDetails = {
        info: info,
        prices: normalizedDeals,
        history: []
      };

      await cache.set(COLLECTIONS.DETAILS, cacheKey, details, 1000 * 60 * 60);
      return details;
    } catch (error) {
      console.error('ITAD Details Error:', error);
      throw error;
    }
  }

  async getHistory(uuid: string, country = 'BR', shops: number[] = ALLOWED_SHOP_IDS): Promise<ITADHistoryPrice[]> {
    const normalizedCountry = (country || 'BR').toUpperCase();
    const targetShops = this.resolveShops(shops);
    const sortedShopsKey = [...targetShops].sort((a, b) => a - b).join(',');
    const cacheKey = `history:${uuid}:${normalizedCountry}:${sortedShopsKey}`;
    const cached = await cache.get<ITADHistoryPrice[]>(COLLECTIONS.DETAILS, cacheKey);
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

      await cache.set(COLLECTIONS.DETAILS, cacheKey, history, 1000 * 60 * 60 * 6);
      return history;
    } catch (error) {
      console.error('ITAD History Error:', error);
      throw error;
    }
  }

  async getGiveaways(offset = 0, limit = 20, sort?: string): Promise<any[]> {
    const cacheKey = `giveaways:${offset}:${limit}:${sort || 'default'}`;
    const cached = await cache.get<any[]>(COLLECTIONS.DEALS, cacheKey);
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
      await cache.set(COLLECTIONS.DEALS, cacheKey, data, 1000 * 60 * 60 * 24);
      return data;
    } catch (error) {
      console.error('ITAD Giveaways Error:', error);
      throw error;
    }
  }

  async getShops(country = 'BR'): Promise<any[]> {
    const normalizedCountry = (country || 'BR').toUpperCase();
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
      await cache.set(COLLECTIONS.SHOPS, cacheKey, data, 1000 * 60 * 60 * 24 * 30);
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
    body?: string[]
  ): Promise<T> {
    try {
      return await this.dispatchAuthorized<T>(`${ITAD_BASE_URL}${path}`, accessToken, method, body);
    } catch (error) {
      if (typeof window === 'undefined' || !(error instanceof TypeError) || path !== '/waitlist/games/v1') {
        throw error;
      }
      return await this.dispatchAuthorized<T>('/api/itad/waitlist', accessToken, method, body);
    }
  }

  private async dispatchAuthorized<T>(
    url: string,
    accessToken: string,
    method: 'GET' | 'PUT' | 'DELETE',
    body?: string[]
  ): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
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

  async addToWaitlist(accessToken: string, uuids: string[]): Promise<void> {
    if (uuids.length === 0) return;
    await this.authorizedRequest<void>(accessToken, 'PUT', '/waitlist/games/v1', uuids);
  }

  async removeFromWaitlist(accessToken: string, uuids: string[]): Promise<void> {
    if (uuids.length === 0) return;
    await this.authorizedRequest<void>(accessToken, 'DELETE', '/waitlist/games/v1', uuids);
  }
}
