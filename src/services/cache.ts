export interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  expiresAt: number;
}

const DB_NAME = 'itad_collection_cache_db';
const DB_VERSION = 7;
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
  NOTIFICATION_DETAILS: 'notification_details',
  OVERVIEW: 'game_overview',
  GAME_SUMMARY: 'game_ai_summary'
} as const;

export const CACHE_TTL = {
  SEARCH: DAY,
  DEALS: DAY,
  DEALS_STEAM_PLAYERS: DAY,
  LOOKUPS: DAY * 7,
  PRICES: DAY,
  DETAILS: DAY,
  DETAILS_PARTIAL: MINUTE * 5,
  HISTORY: DAY,
  SUBS: DAY * 7,
  BUNDLES: DAY,
  GIVEAWAYS: DAY,
  SHOPS: DAY * 30,
  STEAM_SEARCH: DAY,
  STEAM_REVIEWS: DAY,
  STEAM_NEWS: DAY,
  NOTIFICATION_DETAILS: HOUR,
  OVERVIEW: DAY,
  GAME_SUMMARY: DAY * 7
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
  private readonly memory = new Map<string, CacheEntry<any>>();

  constructor() {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      this.dbPromise = this.open();
    }
  }

  private memKey(collection: CollectionName, key: string) {
    return `${collection}:${key}`;
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
    const fullKey = this.memKey(collection, key);
    const memorized = this.memory.get(fullKey) as CacheEntry<T> | undefined;
    if (memorized) {
      if (Date.now() > memorized.expiresAt) this.memory.delete(fullKey);
      else return memorized.data;
    }

    if (!this.dbPromise) return null;
    const db = await this.dbPromise;
    if (!db.objectStoreNames.contains(collection)) return null;
    const entry = await db.get(collection, key) as CacheEntry<T> | undefined;

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.memory.delete(fullKey);
      await db.delete(collection, key);
      return null;
    }

    this.memory.set(fullKey, entry);
    return entry.data;
  }

  async set<T>(collection: CollectionName, key: string, data: T, ttl = DEFAULT_TTL): Promise<void> {
    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    };
    this.memory.set(this.memKey(collection, key), entry);
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    if (!db.objectStoreNames.contains(collection)) return;
    await db.put(collection, entry);
  }

  async clear(collection?: CollectionName): Promise<void> {
    if (collection) {
      const prefix = `${collection}:`;
      for (const key of this.memory.keys()) {
        if (key.startsWith(prefix)) this.memory.delete(key);
      }
    } else {
      this.memory.clear();
    }
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

const networkInflight = new Map<string, Promise<unknown>>();

export function cacheFirst<T>(
  collection: CollectionName,
  key: string,
  ttl: number,
  loader: () => Promise<T>
): Promise<T> {
  const flightKey = `${collection}:${key}`;
  const existing = networkInflight.get(flightKey);
  if (existing) return existing as Promise<T>;

  const pending = (async () => {
    const cached = await cache.get<T>(collection, key);
    if (cached !== null && cached !== undefined) return cached;
    const data = await loader();
    await cache.set(collection, key, data, ttl);
    return data;
  })().finally(() => {
    networkInflight.delete(flightKey);
  });

  networkInflight.set(flightKey, pending);
  return pending;
}
