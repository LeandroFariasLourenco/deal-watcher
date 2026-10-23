export interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  expiresAt: number;
}

const DB_NAME = 'itad_collection_cache_db';
const DB_VERSION = 4;
const MINUTE = 1000 * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;

export const COLLECTIONS = {
  SEARCH: 'search_results',
  DEALS: 'deals',
  LOOKUPS: 'lookups',
  PRICES: 'prices',
  DETAILS: 'game_details',
  HISTORY: 'price_history',
  SUBS: 'game_subs',
  BUNDLES: 'game_bundles',
  GIVEAWAYS: 'giveaways',
  SHOPS: 'shops',
  STEAM: 'steam',
  GGDEALS: 'ggdeals'
} as const;

export const CACHE_TTL = {
  SEARCH: DAY,
  DEALS: MINUTE * 15,
  DEALS_STEAM_PLAYERS: DAY,
  LOOKUPS: DAY * 7,
  PRICES: MINUTE * 15,
  DETAILS: HOUR,
  DETAILS_PARTIAL: MINUTE * 5,
  HISTORY: HOUR * 6,
  SUBS: HOUR * 12,
  BUNDLES: HOUR * 6,
  GIVEAWAYS: DAY,
  SHOPS: DAY * 30,
  STEAM_SEARCH: HOUR,
  STEAM_WISHLIST: MINUTE * 15,
  GGDEALS: MINUTE * 15
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];

const DEFAULT_TTL = HOUR * 4;

interface CacheInterface {
  get<T>(collection: CollectionName, key: string): Promise<T | null>;
  set<T>(collection: CollectionName, key: string, data: T, ttl?: number): Promise<void>;
  clear(collection?: CollectionName): Promise<void>;
}

class IndexedDBCache implements CacheInterface {
  private dbPromise: Promise<any> | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      this.dbPromise = this.open();
    }
  }

  private async open() {
    const { openDB } = await import('idb');
    return openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        Object.values(COLLECTIONS).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'key' });
          }
        });
      },
    });
  }

  async get<T>(collection: CollectionName, key: string): Promise<T | null> {
    if (!this.dbPromise) return null;
    const db = await this.dbPromise;
    if (!db.objectStoreNames.contains(collection)) return null;
    const entry = await db.get(collection, key) as CacheEntry<T> | undefined;

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      await db.delete(collection, key);
      return null;
    }

    return entry.data;
  }

  async set<T>(collection: CollectionName, key: string, data: T, ttl = DEFAULT_TTL): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    if (!db.objectStoreNames.contains(collection)) return;
    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    };
    await db.put(collection, entry);
  }

  async clear(collection?: CollectionName): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    if (collection) {
      if (!db.objectStoreNames.contains(collection)) return;
      const tx = db.transaction(collection, 'readwrite');
      await tx.objectStore(collection).clear();
      await tx.done;
    } else {
      for (const storeName of Object.values(COLLECTIONS)) {
        if (!db.objectStoreNames.contains(storeName)) continue;
        const tx = db.transaction(storeName, 'readwrite');
        await tx.objectStore(storeName).clear();
        await tx.done;
      }
    }
  }
}

class MemoryCache implements CacheInterface {
  private cache = new Map<string, CacheEntry<any>>();

  async get<T>(collection: CollectionName, key: string): Promise<T | null> {
    const fullKey = `${collection}:${key}`;
    const entry = this.cache.get(fullKey);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(fullKey);
      return null;
    }
    return entry.data;
  }

  async set<T>(collection: CollectionName, key: string, data: T, ttl = DEFAULT_TTL): Promise<void> {
    const fullKey = `${collection}:${key}`;
    this.cache.set(fullKey, {
      key,
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    });
  }

  async clear(collection?: CollectionName): Promise<void> {
    if (collection) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${collection}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}

export const cache: CacheInterface = typeof window !== 'undefined' && 'indexedDB' in window
  ? new IndexedDBCache()
  : new MemoryCache();
