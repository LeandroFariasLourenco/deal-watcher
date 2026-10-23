import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { ITADWaitlistGame } from '../../types/itad';
import { ITADService } from '../../services/itad';
import { ItadAuthService } from './itad-auth';

const CACHE_KEY = 'itad_waitlist_games_cache_v1';
const CACHE_TTL_MS = 60 * 60 * 1000;

interface WaitlistCache {
  games: ITADWaitlistGame[];
  fetchedAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class WaitlistService {
  private readonly auth = inject(ItadAuthService);
  private readonly itad = new ITADService();
  private inflight: Promise<void> | null = null;

  readonly games = signal<ITADWaitlistGame[]>([]);
  readonly monitoredUuids = signal<Set<string>>(new Set());
  readonly hydrated = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const authenticated = this.auth.isLoggedIn();
      untracked(() => {
        if (!authenticated) {
          this.resetLocal();
          return;
        }
        const cached = this.readCache();
        if (cached) this.sync(cached.games, false);
        void this.refresh();
      });
    });
  }

  isMonitored(uuid: string | null | undefined): boolean {
    if (!uuid) return false;
    return this.monitoredUuids().has(uuid);
  }

  async refresh(force = false): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.resetLocal();
      return;
    }
    if (!force && this.applyFreshCache()) return;
    if (!force && this.inflight) return this.inflight;
    const request = this.fetchWaitlist();
    this.inflight = request.finally(() => {
      if (this.inflight === request) this.inflight = null;
    });
    return request;
  }

  private async fetchWaitlist(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.resetLocal();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      const token = await this.auth.validAccessToken();
      const games = await this.itad.getWaitlist(token);
      this.sync(games);
    } catch (error: any) {
      if (error?.message === 'not_authenticated' || error?.status === 401) {
        this.auth.logout();
        this.resetLocal();
        return;
      }
      this.error.set('Não foi possível carregar a lista de espera do IsThereAnyDeal.');
      throw error;
    } finally {
      this.loading.set(false);
      this.hydrated.set(true);
    }
  }

  async add(uuid: string, game?: Partial<ITADWaitlistGame>): Promise<void> {
    if (!await this.ensureAuth()) return;
    if (this.isMonitored(uuid)) return;

    this.mark(uuid);
    try {
      const token = await this.auth.validAccessToken();
      await this.itad.addToWaitlist(token, [uuid]);
      this.insertLocal(this.toEntry(uuid, game));
    } catch (error) {
      this.unmark(uuid);
      this.games.update(list => list.filter(item => item.id !== uuid));
      this.writeCache(this.games());
      throw error;
    }
  }

  async remove(uuid: string): Promise<void> {
    if (!await this.ensureAuth()) return;
    if (!this.isMonitored(uuid)) return;

    const previous = this.games();
    this.unmark(uuid);
    this.games.update(list => list.filter(game => game.id !== uuid));
    this.writeCache(this.games());
    try {
      const token = await this.auth.validAccessToken();
      await this.itad.removeFromWaitlist(token, [uuid]);
    } catch (error) {
      this.sync(previous);
      throw error;
    }
  }

  async toggle(uuid: string): Promise<'added' | 'removed' | 'login'> {
    if (!this.auth.isLoggedIn()) {
      await this.ensureAuth();
      return 'login';
    }
    if (this.isMonitored(uuid)) {
      await this.remove(uuid);
      return 'removed';
    }
    await this.add(uuid);
    return 'added';
  }

  private async ensureAuth(): Promise<boolean> {
    if (this.auth.isLoggedIn()) return true;
    const returnUrl = `${location.pathname}${location.search}` || '/waitlist';
    await this.auth.login(returnUrl);
    return false;
  }

  private resetLocal() {
    this.loading.set(false);
    this.error.set(null);
    this.games.set([]);
    this.monitoredUuids.set(new Set());
    this.hydrated.set(true);
    localStorage.removeItem(CACHE_KEY);
  }

  private applyFreshCache(): boolean {
    const cached = this.readCache();
    if (!cached || Date.now() - cached.fetchedAt >= CACHE_TTL_MS) return false;
    this.sync(cached.games, false);
    this.loading.set(false);
    this.hydrated.set(true);
    return true;
  }

  private sync(games: ITADWaitlistGame[], persist = true) {
    this.games.set(games);
    this.monitoredUuids.set(new Set(games.map(game => game.id)));
    this.hydrated.set(true);
    if (persist) this.writeCache(games);
  }

  private readCache(): WaitlistCache | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as WaitlistCache;
      if (!Array.isArray(parsed?.games) || typeof parsed.fetchedAt !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private writeCache(games: ITADWaitlistGame[]) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ games, fetchedAt: Date.now() } satisfies WaitlistCache));
  }

  private insertLocal(game: ITADWaitlistGame) {
    this.mark(game.id);
    this.games.update(list => [game, ...list.filter(item => item.id !== game.id)]);
    this.writeCache(this.games());
  }

  private toEntry(uuid: string, game?: Partial<ITADWaitlistGame>): ITADWaitlistGame {
    return {
      id: uuid,
      slug: game?.slug || '',
      title: game?.title || '',
      type: game?.type || 'game',
      mature: !!game?.mature,
      added: new Date().toISOString(),
      assets: game?.assets || {},
    };
  }

  private mark(uuid: string) {
    this.monitoredUuids.update(current => {
      if (current.has(uuid)) return current;
      const next = new Set(current);
      next.add(uuid);
      return next;
    });
  }

  private unmark(uuid: string) {
    this.monitoredUuids.update(current => {
      if (!current.has(uuid)) return current;
      const next = new Set(current);
      next.delete(uuid);
      return next;
    });
  }
}
