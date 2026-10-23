import { Injectable, computed, inject, signal } from '@angular/core';
import { ITADNotification } from '../../types/itad';
import { ITADService } from '../../services/itad';
import { ItadAuthService } from './itad-auth';

const CACHE_KEY = 'itad_notifications_cache_v1';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

interface NotificationsCache {
  items: ITADNotification[];
  fetchedAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class ItadNotificationsService {
  private readonly auth = inject(ItadAuthService);
  private readonly itad = new ITADService();

  readonly items = signal<ITADNotification[]>([]);
  readonly loading = signal(false);
  readonly hasNotifications = computed(() => this.auth.isLoggedIn() && this.items().length > 0);

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.items.set(this.readCache()?.items ?? []);
    }
  }

  async refresh(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.items.set([]);
      return;
    }

    const cached = this.readCache();
    if (cached && Date.now() - cached.fetchedAt < REFRESH_INTERVAL_MS) {
      this.items.set(cached.items);
      return;
    }

    this.loading.set(true);
    try {
      const token = await this.auth.validAccessToken();
      const items = await this.itad.getNotifications(token);
      this.items.set(items);
      this.writeCache({ items, fetchedAt: Date.now() });
    } catch (error) {
      this.writeCache({ items: cached?.items ?? this.items(), fetchedAt: Date.now() });
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  clear() {
    this.items.set([]);
  }

  private readCache(): NotificationsCache | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as NotificationsCache;
      if (!Array.isArray(parsed?.items) || typeof parsed.fetchedAt !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private writeCache(payload: NotificationsCache) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  }
}
