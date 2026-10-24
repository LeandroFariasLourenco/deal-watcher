import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { ITADNotification, ITADWaitlistNotificationDetail } from '../../types/itad';
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
  private readonly detailsInflight = new Map<string, Promise<ITADWaitlistNotificationDetail | null>>();

  readonly items = signal<ITADNotification[]>([]);
  readonly loading = signal(false);
  readonly panelOpen = signal(false);
  readonly expandedId = signal<string | null>(null);
  readonly detailsById = signal<Record<string, ITADWaitlistNotificationDetail>>({});
  readonly detailsLoading = signal<Record<string, boolean>>({});
  readonly detailsError = signal<Record<string, string>>({});
  readonly hasNotifications = computed(() => this.auth.isLoggedIn() && this.items().length > 0);

  constructor() {
    effect(() => {
      const authenticated = this.auth.isLoggedIn();
      untracked(() => {
        if (!authenticated) {
          this.clear();
          return;
        }
        const cached = this.readCache();
        if (cached) this.items.set(cached.items);
        void this.refresh();
      });
    });
  }

  togglePanel() {
    this.panelOpen.update(open => !open);
  }

  closePanel() {
    this.panelOpen.set(false);
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
    } catch (error: any) {
      if (error?.message === 'not_authenticated' || error?.status === 401) {
        this.auth.logout();
        this.clear();
        return;
      }
      this.writeCache({ items: cached?.items ?? this.items(), fetchedAt: Date.now() });
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  toggleExpanded(id: string) {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
      return;
    }

    this.expandedId.set(id);
    const item = this.items().find(notification => notification.id === id);
    if (item && item.type !== 'waitlist') {
      this.detailsError.update(map => ({
        ...map,
        [id]: 'Este tipo de notificação ainda não possui detalhes.'
      }));
      return;
    }
    void this.loadDetails(id);
  }

  async loadDetails(id: string): Promise<ITADWaitlistNotificationDetail | null> {
    const existing = this.detailsById()[id];
    if (existing) return existing;

    const pending = this.detailsInflight.get(id);
    if (pending) return pending;

    this.detailsLoading.update(map => ({ ...map, [id]: true }));
    this.detailsError.update(map => {
      const next = { ...map };
      delete next[id];
      return next;
    });

    const request = this.fetchDetails(id).finally(() => {
      this.detailsInflight.delete(id);
      this.detailsLoading.update(map => ({ ...map, [id]: false }));
    });
    this.detailsInflight.set(id, request);
    return request;
  }

  clear() {
    this.items.set([]);
    this.panelOpen.set(false);
    this.expandedId.set(null);
    this.detailsById.set({});
    this.detailsLoading.set({});
    this.detailsError.set({});
    this.detailsInflight.clear();
  }

  private async fetchDetails(id: string): Promise<ITADWaitlistNotificationDetail | null> {
    try {
      const token = await this.auth.validAccessToken();
      const detail = await this.itad.getWaitlistNotification(token, id);
      this.detailsById.update(map => ({ ...map, [id]: detail }));
      return detail;
    } catch (error) {
      console.error('Failed to load waitlist notification detail', error);
      this.detailsError.update(map => ({
        ...map,
        [id]: 'Não foi possível carregar os detalhes. Tente novamente.'
      }));
      return null;
    }
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
