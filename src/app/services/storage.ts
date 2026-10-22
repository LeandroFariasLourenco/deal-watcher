import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { openDB, IDBPDatabase } from 'idb';

export interface MonitoredGame {
  id?: number;
  itad_uuid: string;
  title: string;
  banner: string | null;
  added_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private platformId = inject(PLATFORM_ID);
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private readonly monitoredUuids = signal<Set<string>>(new Set());
  readonly games = signal<MonitoredGame[]>([]);
  readonly hydrated = signal(false);
  
  private readonly DB_NAME = 'deal_watcher_db';
  private readonly STORE_NAME = 'monitored_games';
  private readonly VERSION = 1;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.dbPromise = openDB(this.DB_NAME, this.VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('monitored_games')) {
            const store = db.createObjectStore('monitored_games', {
              keyPath: 'id',
              autoIncrement: true
            });
            store.createIndex('itad_uuid', 'itad_uuid', { unique: true });
          }
        }
      });
      void this.refreshMonitoredIds();
    }
  }

  isMonitored(uuid: string | null | undefined): boolean {
    if (!uuid) return false;
    return this.monitoredUuids().has(uuid);
  }

  private markMonitored(uuid: string) {
    this.monitoredUuids.update(current => {
      if (current.has(uuid)) return current;
      const next = new Set(current);
      next.add(uuid);
      return next;
    });
  }

  private unmarkMonitored(uuid: string) {
    this.monitoredUuids.update(current => {
      if (!current.has(uuid)) return current;
      const next = new Set(current);
      next.delete(uuid);
      return next;
    });
  }

  private syncGames(games: MonitoredGame[]) {
    this.games.set(games);
    this.monitoredUuids.set(new Set(games.map(game => game.itad_uuid)));
    this.hydrated.set(true);
  }

  private async refreshMonitoredIds() {
    const games = await this.getGames();
    this.syncGames(games);
  }

  async getGames(): Promise<MonitoredGame[]> {
    if (!this.dbPromise) return [];
    const db = await this.dbPromise;
    return db.getAll(this.STORE_NAME);
  }

  async addGame(game: Omit<MonitoredGame, 'id' | 'added_at'>): Promise<number> {
    if (!this.dbPromise) throw new Error('Database not initialized');
    this.markMonitored(game.itad_uuid);
    try {
      const db = await this.dbPromise;
      const gameToAdd: MonitoredGame = {
        ...game,
        added_at: new Date().toISOString()
      };
      const key = await db.add(this.STORE_NAME, gameToAdd);
      const saved: MonitoredGame = { ...gameToAdd, id: Number(key) };
      this.games.update(list => list.some(item => item.itad_uuid === saved.itad_uuid) ? list : [...list, saved]);
      return Number(key);
    } catch (error) {
      await this.refreshMonitoredIds();
      throw error;
    }
  }

  async removeGame(id: number): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    const existing = await db.get(this.STORE_NAME, id) as MonitoredGame | undefined;
    await db.delete(this.STORE_NAME, id);
    if (existing?.itad_uuid) {
      this.unmarkMonitored(existing.itad_uuid);
      this.games.update(list => list.filter(game => game.id !== id));
    }
  }

  async removeGameByUuid(uuid: string): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    const tx = db.transaction(this.STORE_NAME, 'readwrite');
    const index = tx.store.index('itad_uuid');
    const cursor = await index.openKeyCursor(IDBKeyRange.only(uuid));
    if (cursor) {
      await tx.store.delete(cursor.primaryKey as any);
    }
    await tx.done;
    this.unmarkMonitored(uuid);
    this.games.update(list => list.filter(game => game.itad_uuid !== uuid));
  }

  async isGameMonitored(uuid: string): Promise<boolean> {
    if (!this.dbPromise) return false;
    const db = await this.dbPromise;
    const tx = db.transaction(this.STORE_NAME, 'readonly');
    const index = tx.store.index('itad_uuid');
    const key = await index.getKey(uuid);
    return !!key;
  }
}
