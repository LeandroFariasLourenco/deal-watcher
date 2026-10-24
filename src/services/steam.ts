import axios from 'axios';
import { cacheFirst, CACHE_TTL, COLLECTIONS } from './cache';
import { STEAM_API_BASE } from './steam-endpoints';

export interface SteamReviewAuthor {
  steamid: string;
  num_reviews?: number;
  playtime_forever?: number;
  playtime_last_two_weeks?: number;
  playtime_at_review?: number;
  last_played?: number;
}

export interface SteamAppReview {
  recommendationid: string;
  author: SteamReviewAuthor;
  language: string;
  review: string;
  timestamp_created: number;
  timestamp_updated: number;
  voted_up: boolean;
  votes_up: number;
  votes_funny: number;
  steam_purchase: boolean;
  received_for_free: boolean;
}

export interface SteamReviewSummary {
  num_reviews: number;
  review_score: number;
  review_score_desc: string;
  total_positive: number;
  total_negative: number;
  total_reviews: number;
}

export interface SteamAppReviews {
  query_summary: SteamReviewSummary | null;
  reviews: SteamAppReview[];
}

export const SteamReviewType = {
  All: 0,
  Positive: 1,
  Negative: 2,
} as const;

export type SteamReviewTypeValue = (typeof SteamReviewType)[keyof typeof SteamReviewType];

export function normalizeSteamReviewType(value: unknown): SteamReviewTypeValue {
  const type = Number(value);
  if (type === SteamReviewType.Positive || type === SteamReviewType.Negative) return type;
  return SteamReviewType.All;
}

export function steamReviewsQuery(appId: number, reviewType: SteamReviewTypeValue = SteamReviewType.All): string {
  return [
    `appid=${appId}`,
    'languages[0]=portuguese',
    'display_language=portuguese',
    'filter_offtopic_activity=false',
    `review_type=${normalizeSteamReviewType(reviewType)}`,
    'day_range=120',
  ].join('&');
}

export interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  author: string;
  excerpt: string;
  feedlabel: string;
  feedname: string;
  date: number;
  appid: number;
  tags: string[];
}

const STEAM_FEED_NAME = /steam/i;
const STEAM_NEWS_FEEDS = 'steam_community_announcements,SteamDB';
const STEAM_NEWS_COUNT = 4;

export function isSteamNewsFeed(feedname: string | null | undefined): boolean {
  return STEAM_FEED_NAME.test(feedname || '');
}

export function steamNewsQuery(appId: number): string {
  return `appid=${appId}&feeds=${STEAM_NEWS_FEEDS}&count=${STEAM_NEWS_COUNT}`;
}

export function steamNewsCacheKey(appId: number): string {
  return `news:${appId}:${STEAM_NEWS_FEEDS}:${STEAM_NEWS_COUNT}`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    });
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?(br|p|div|li|ul|ol|h[1-6]|tr|td|th)(\s[^>]*)?\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/<[^>]*$/g, ' ');
}

export function stripSteamMarkup(text: string | null | undefined): string {
  if (!text) return '';
  const withoutBbcode = text
    .replace(/\[img\].*?\[\/img\]/gis, ' ')
    .replace(/\[previewyoutube=[^\]]*\]\[\/previewyoutube\]/gis, ' ')
    .replace(/\[url=[^\]]*\](.*?)\[\/url\]/gis, '$1')
    .replace(/\[[^\]]+\]/g, ' ');

  return stripHtmlTags(decodeHtmlEntities(stripHtmlTags(decodeHtmlEntities(withoutBbcode))))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function newsExcerpt(text: string, max = 220): string {
  const clean = stripSteamMarkup(text);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

function newsStoreUrl(appId: number, gid: string, fallback?: string): string {
  if (gid) return `https://store.steampowered.com/news/app/${appId}/${gid}`;
  return fallback || `https://store.steampowered.com/news/app/${appId}`;
}

export function mapSteamNewsItems(appId: number, items: any[]): SteamNewsItem[] {
  return (Array.isArray(items) ? items : [])
    .filter(item => isSteamNewsFeed(item?.feedname))
    .map(item => {
      const gid = String(item?.gid || '');
      return {
        gid,
        title: stripSteamMarkup(item?.title) || 'Sem título',
        url: newsStoreUrl(appId, gid, item?.url),
        author: item?.author || '',
        excerpt: newsExcerpt(item?.contents || ''),
        feedlabel: item?.feedlabel || item?.feedname || 'Steam',
        feedname: item?.feedname || '',
        date: Number(item?.date) || 0,
        appid: Number(item?.appid) || appId,
        tags: Array.isArray(item?.tags) ? item.tags.filter((tag: unknown) => typeof tag === 'string') : [],
      };
    });
}

export class SteamService {
  async getAppReviews(appId: number, reviewType: SteamReviewTypeValue = SteamReviewType.All): Promise<SteamAppReviews> {
    const type = normalizeSteamReviewType(reviewType);
    const cacheKey = `reviews:${appId}:pt:${type}:120`;
    try {
      return await cacheFirst(COLLECTIONS.STEAM, cacheKey, CACHE_TTL.STEAM_REVIEWS, async () => {
        const url = `${STEAM_API_BASE}/IUserReviewsService/GetAppReviews/v1?${steamReviewsQuery(appId, type)}`;
        const response = await axios.get(url, { timeout: 12000 });
        const payload = response.data?.response ?? response.data;
        return {
          query_summary: payload?.query_summary || null,
          reviews: Array.isArray(payload?.reviews) ? payload.reviews : [],
        };
      });
    } catch (error) {
      console.error('Steam Reviews Error:', error);
      throw error;
    }
  }

  async getAppNews(appId: number): Promise<SteamNewsItem[]> {
    const cacheKey = steamNewsCacheKey(appId);
    try {
      const cached = await cacheFirst(COLLECTIONS.STEAM, cacheKey, CACHE_TTL.STEAM_NEWS, async () => {
        const url = `${STEAM_API_BASE}/ISteamNews/GetNewsForApp/v2?${steamNewsQuery(appId)}`;
        const response = await axios.get(url, { timeout: 12000 });
        const payload = response.data?.appnews ?? response.data?.response ?? response.data;
        return mapSteamNewsItems(appId, payload?.newsitems);
      });
      if (Array.isArray(cached)) {
        if (cached[0]?.excerpt != null || cached.length === 0) {
          return (cached as SteamNewsItem[]).map(item => ({
            ...item,
            title: stripSteamMarkup(item.title) || item.title || 'Sem título',
            excerpt: newsExcerpt(item.excerpt || ''),
          }));
        }
        return mapSteamNewsItems(appId, cached);
      }
      return [];
    } catch (error) {
      console.error('Steam News Error:', error);
      throw error;
    }
  }
}
