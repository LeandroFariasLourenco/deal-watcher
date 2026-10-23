import axios from 'axios';
import { cache, CACHE_TTL, COLLECTIONS } from './cache';

export interface SteamWishlistItem {
  name: string;
  capsule: string;
  review_score: number;
  review_desc: string;
  reviews_total: string;
  reviews_percent: number;
  release_date: string | number;
  release_string: string;
  platform_icons: string;
  subs: any[];
  type: string;
  screenshots: string[];
  review_css: string;
  priority: number;
  added: number;
  background: string;
  rank: number;
  tags: string[];
  is_free_game: boolean;
  win: number;
  mac: number;
  linux: number;
}

export class SteamService {
  /**
   * Fetches the public wishlist for a given SteamID64 or Vanity URL.
   * Note: This uses the public wishlist JSON endpoint which often works without an API key if the profile is public.
   */
  async getWishlist(steamId: string): Promise<Record<string, SteamWishlistItem>> {
    const cacheKey = `wishlist:${steamId.toLowerCase()}`;
    const cached = await cache.get<Record<string, SteamWishlistItem>>(COLLECTIONS.STEAM, cacheKey);
    if (cached) return cached;

    try {
      // First attempt to treat steamId as a direct ID
      const url = `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/`;
      const response = await axios.get(url);
      
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        // Might be a vanity URL or private
        const vanityUrl = `https://store.steampowered.com/wishlist/id/${steamId}/wishlistdata/`;
        const vanityResponse = await axios.get(vanityUrl);
        const vanityData = vanityResponse.data;
        if (vanityData && typeof vanityData === 'object') {
          await cache.set(COLLECTIONS.STEAM, cacheKey, vanityData, CACHE_TTL.STEAM_WISHLIST);
        }
        return vanityData;
      }

      const data = response.data;
      if (data && typeof data === 'object') {
        await cache.set(COLLECTIONS.STEAM, cacheKey, data, CACHE_TTL.STEAM_WISHLIST);
      }
      return data;
    } catch (error) {
      console.error('Steam Wishlist Error:', error);
      throw new Error('Could not fetch Steam wishlist. Make sure the profile and wishlist are public.');
    }
  }
}
