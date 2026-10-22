import axios from 'axios';

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
    try {
      // First attempt to treat steamId as a direct ID
      const url = `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/`;
      const response = await axios.get(url);
      
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        // Might be a vanity URL or private
        const vanityUrl = `https://store.steampowered.com/wishlist/id/${steamId}/wishlistdata/`;
        const vanityResponse = await axios.get(vanityUrl);
        return vanityResponse.data;
      }
      
      return response.data;
    } catch (error) {
      console.error('Steam Wishlist Error:', error);
      throw new Error('Could not fetch Steam wishlist. Make sure the profile and wishlist are public.');
    }
  }
}
