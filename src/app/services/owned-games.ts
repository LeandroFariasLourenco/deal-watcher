import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { ITADIgnoredGame } from '../../types/itad';
import { ITADService } from '../../services/itad';
import { ItadAuthService } from './itad-auth';

const PREVIEW_LIMIT = 10;
const CACHE_KEY = 'itad_owned_games_cache_v1';
const CACHE_TTL_MS = 60 * 60 * 1000;

export type OwnedGameInput = {
  id: string;
  slug?: string;
  title: string;
  type?: string;
  mature?: boolean;
  assets?: ITADIgnoredGame['assets'];
};

interface OwnedCache {
  games: ITADIgnoredGame[];
  fetchedAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class OwnedGamesService {
  private readonly auth = inject(ItadAuthService);
  private readonly itad = new ITADService();

  readonly games = signal<ITADIgnoredGame[]>([]);
  readonly ownedUuids = signal<ReadonlySet<string>>(new Set());
  readonly loading = signal(false);
  readonly hydrated = signal(false);
  readonly error = signal<string | null>(null);
  readonly needsReconnect = signal(false);

  readonly recent = computed(() => this.games().slice(0, PREVIEW_LIMIT));
  private inflight: Promise<void> | null = null;

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

  isOwned(uuid: string | null | undefined): boolean {
    if (!uuid) return false;
    return this.ownedUuids().has(uuid);
  }

  async refresh(force = false): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.resetLocal();
      return;
    }
    if (!force && this.applyFreshCache()) return;
    if (!force && this.inflight) return this.inflight;
    const request = this.fetchOwned();
    this.inflight = request.finally(() => {
      if (this.inflight === request) this.inflight = null;
    });
    return request;
  }

  private async fetchOwned(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.resetLocal();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.needsReconnect.set(false);
    try {
      const token = await this.auth.validAccessToken();
      const games = this.sortByAdded(await this.itad.getIgnoredGames(token));
      this.sync(games);
    } catch (error: any) {
      if (error?.message === 'not_authenticated' || error?.status === 401) {
        this.auth.logout();
        this.resetLocal();
        return;
      }
      if (error?.status === 403) {
        this.needsReconnect.set(true);
        this.error.set('Reconecte a conta ITAD para carregar os jogos comprados.');
        return;
      }
      this.error.set('Não foi possível carregar os jogos comprados.');
      throw error;
    } finally {
      this.loading.set(false);
      this.hydrated.set(true);
    }
  }

  async add(game: OwnedGameInput): Promise<void> {
    if (!await this.ensureAuth()) return;
    if (this.isOwned(game.id)) return;

    const entry = this.toEntry(game);
    const previousGames = this.games();
    const previousIds = this.ownedUuids();
    this.applyAdd(entry);

    try {
      const token = await this.auth.validAccessToken();
      await this.itad.addToIgnored(token, [game.id]);
    } catch (error: any) {
      this.restore(previousGames, previousIds);
      this.handleWriteError(error);
      throw error;
    }
  }

  async remove(uuid: string): Promise<void> {
    if (!await this.ensureAuth()) return;
    if (!this.isOwned(uuid)) return;

    const previousGames = this.games();
    const previousIds = this.ownedUuids();
    this.applyRemove(uuid);

    try {
      const token = await this.auth.validAccessToken();
      await this.itad.removeFromIgnored(token, [uuid]);
    } catch (error: any) {
      this.restore(previousGames, previousIds);
      this.handleWriteError(error);
      throw error;
    }
  }

  async toggle(game: OwnedGameInput): Promise<'added' | 'removed' | 'login'> {
    if (!this.auth.isLoggedIn()) {
      await this.ensureAuth();
      return 'login';
    }
    if (this.isOwned(game.id)) {
      await this.remove(game.id);
      return 'removed';
    }
    await this.add(game);
    return 'added';
  }

  clear() {
    this.resetLocal();
  }

  private resetLocal() {
    this.games.set([]);
    this.ownedUuids.set(new Set());
    this.hydrated.set(true);
    this.error.set(null);
    this.needsReconnect.set(false);
    this.loading.set(false);
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

  private applyAdd(entry: ITADIgnoredGame) {
    this.ownedUuids.update(current => {
      if (current.has(entry.id)) return current;
      const next = new Set(current);
      next.add(entry.id);
      return next;
    });
    this.games.update(list => [entry, ...list.filter(item => item.id !== entry.id)]);
    this.writeCache(this.games());
  }

  private applyRemove(uuid: string) {
    this.ownedUuids.update(current => {
      if (!current.has(uuid)) return current;
      const next = new Set(current);
      next.delete(uuid);
      return next;
    });
    this.games.update(list => list.filter(item => item.id !== uuid));
    this.writeCache(this.games());
  }

  private restore(games: ITADIgnoredGame[], ids: ReadonlySet<string>) {
    this.games.set(games);
    this.ownedUuids.set(ids);
    this.writeCache(games);
  }

  private toEntry(game: OwnedGameInput): ITADIgnoredGame {
    return {
      id: game.id,
      slug: game.slug || '',
      title: game.title,
      type: game.type || 'game',
      mature: !!game.mature,
      added: new Date().toISOString(),
      assets: game.assets || {},
    };
  }

  private sortByAdded(games: ITADIgnoredGame[]): ITADIgnoredGame[] {
    return [...games].sort((left, right) => this.addedTime(right) - this.addedTime(left));
  }

  private addedTime(game: ITADIgnoredGame): number {
    if (!game.added) return 0;
    const time = Date.parse(game.added);
    return Number.isNaN(time) ? 0 : time;
  }

  private async ensureAuth(): Promise<boolean> {
    if (this.auth.isLoggedIn()) return true;
    const returnUrl = `${location.pathname}${location.search}` || '/waitlist';
    await this.auth.login(returnUrl);
    return false;
  }

  private handleWriteError(error: any) {
    if (error?.status === 401 || error?.status === 403) {
      this.needsReconnect.set(true);
      this.error.set('Reconecte a conta ITAD para atualizar os jogos comprados.');
    }
  }

  private sync(games: ITADIgnoredGame[], persist = true) {
    this.games.set(games);
    this.ownedUuids.set(new Set(games.map(game => game.id)));
    this.hydrated.set(true);
    if (persist) this.writeCache(games);
  }

  private readCache(): OwnedCache | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as OwnedCache;
      if (!Array.isArray(parsed?.games)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private writeCache(games: ITADIgnoredGame[]) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ games, fetchedAt: Date.now() } satisfies OwnedCache));
  }
}
