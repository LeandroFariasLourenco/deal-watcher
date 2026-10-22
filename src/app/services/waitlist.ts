import { Injectable, inject, signal } from '@angular/core';
import { ITADWaitlistGame } from '../../types/itad';
import { ITADService } from '../../services/itad';
import { ItadAuthService } from './itad-auth';

@Injectable({
  providedIn: 'root'
})
export class WaitlistService {
  private readonly auth = inject(ItadAuthService);
  private readonly itad = new ITADService('', '');

  readonly games = signal<ITADWaitlistGame[]>([]);
  readonly monitoredUuids = signal<Set<string>>(new Set());
  readonly hydrated = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  isMonitored(uuid: string | null | undefined): boolean {
    if (!uuid) return false;
    return this.monitoredUuids().has(uuid);
  }

  async refresh(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.sync([]);
      this.hydrated.set(true);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      const token = await this.auth.validAccessToken();
      const games = await this.itad.getWaitlist(token);
      this.sync(games);
    } catch (error: any) {
      if (error?.status === 401) {
        this.auth.logout();
        this.sync([]);
      }
      this.error.set('Não foi possível carregar a lista de desejos do IsThereAnyDeal.');
      throw error;
    } finally {
      this.loading.set(false);
      this.hydrated.set(true);
    }
  }

  async add(uuid: string): Promise<void> {
    if (!await this.ensureAuth()) return;
    if (this.isMonitored(uuid)) return;

    this.mark(uuid);
    try {
      const token = await this.auth.validAccessToken();
      await this.itad.addToWaitlist(token, [uuid]);
      await this.refresh();
    } catch (error) {
      this.unmark(uuid);
      throw error;
    }
  }

  async remove(uuid: string): Promise<void> {
    if (!await this.ensureAuth()) return;
    if (!this.isMonitored(uuid)) return;

    const previous = this.games();
    this.unmark(uuid);
    this.games.update(list => list.filter(game => game.id !== uuid));
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
    const returnUrl = `${location.pathname}${location.search}` || '/wishlist';
    await this.auth.login(returnUrl);
    return false;
  }

  private sync(games: ITADWaitlistGame[]) {
    this.games.set(games);
    this.monitoredUuids.set(new Set(games.map(game => game.id)));
    this.hydrated.set(true);
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
