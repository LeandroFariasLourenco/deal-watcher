import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { register as registerSwiper } from 'swiper/element/bundle';
import { SkeletonModule } from 'primeng/skeleton';
import { MatIconModule } from '@angular/material/icon';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { WaitlistService } from '../../services/waitlist';
import { ItadAuthService } from '../../services/itad-auth';
import { EmailService } from '../../services/email';
import { ItadWebhookService } from '../../services/itad-webhook';
import { ItadNotificationsService } from '../../services/itad-notifications';
import { OwnedGamesService } from '../../services/owned-games';
import { RestoreWaitlistPrompt } from '../../shared/restore-waitlist-dialog/restore-waitlist-dialog';
import { TimeService } from '../../services/time';
import { ImgShimmerDirective } from '../../shared/img-shimmer';
import { StoreLogo } from '../../shared/store-logo/store-logo';
import { ITADIgnoredGame, ITADNotificationGame } from '../../../types/itad';

registerSwiper();

@Component({
  selector: 'app-waitlist',
  standalone: true,
  imports: [CommonModule, SkeletonModule, RouterLink, MatIconModule, ToastModule, ImgShimmerDirective, StoreLogo],
  providers: [MessageService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './waitlist.html',
  styleUrl: './waitlist.css'
})
export class Waitlist {
  readonly waitlist = inject(WaitlistService);
  readonly auth = inject(ItadAuthService);
  readonly email = inject(EmailService);
  readonly webhook = inject(ItadWebhookService);
  readonly notifications = inject(ItadNotificationsService);
  readonly owned = inject(OwnedGamesService);
  private readonly messageService = inject(MessageService);
  private readonly restoreWaitlist = inject(RestoreWaitlistPrompt);
  readonly timeService = inject(TimeService);

  games = this.waitlist.games;
  loading = computed(() => this.waitlist.loading() || !this.waitlist.hydrated());
  ownedLoading = computed(() => this.owned.loading() || !this.owned.hydrated());
  ownedRecent = this.owned.recent;
  leavingIds = signal<Set<string>>(new Set());

  connect() {
    void this.auth.login('/waitlist');
  }

  logout() {
    this.auth.logout();
    this.notifications.clear();
    this.owned.clear();
  }

  reconnectForOwned() {
    void this.auth.login('/waitlist');
  }

  toggleNotifications() {
    this.notifications.togglePanel();
  }

  toggleNotificationDetail(id: string) {
    this.notifications.toggleExpanded(id);
  }

  retryNotificationDetail(id: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    void this.notifications.loadDetails(id);
  }

  async toggleWebhook() {
    try {
      if (this.webhook.enabled()) {
        await this.webhook.disable();
        this.messageService.add({
          severity: 'success',
          summary: 'Notificações',
          detail: 'Notificações da waitlist desabilitadas.',
          life: 4000,
        });
        return;
      }

      await this.webhook.enable();
    } catch (e: any) {
      console.error('Failed to update waitlist webhook', e);
      if (e?.status === 401 || e?.status === 403) {
        this.messageService.add({
          severity: 'info',
          summary: 'Notificações',
          detail: 'É necessário reconectar a conta ITAD para gerenciar notificações.',
          life: 5000,
        });
        await this.auth.login('/waitlist');
        return;
      }
      this.messageService.add({
        severity: 'error',
        summary: 'Notificações',
        detail: 'Não foi possível atualizar as notificações. Tente novamente.',
        life: 5000,
      });
    }
  }

  async sendEmails() {
    try {
      await this.email.triggerSend();
      this.messageService.add({
        severity: 'success',
        summary: 'E-mail',
        detail: 'Disparo de e-mails solicitado com sucesso.',
        life: 4000,
      });
    } catch (e) {
      console.error('Failed to trigger email worker', e);
      this.messageService.add({
        severity: 'error',
        summary: 'E-mail',
        detail: 'Não foi possível disparar os e-mails. Tente novamente.',
        life: 5000,
      });
    }
  }

  async removeGame(uuid: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    try {
      await this.waitlist.remove(uuid);
    } catch (e) {
      console.error('Failed to remove game from ITAD waitlist', e);
    }
  }

  isLeaving(id: string): boolean {
    return this.leavingIds().has(id);
  }

  async markAsOwned(game: ITADIgnoredGame, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (this.owned.isOwned(game.id) || this.isLeaving(game.id)) return;

    this.leavingIds.update(current => {
      const next = new Set(current);
      next.add(game.id);
      return next;
    });

    try {
      await this.owned.add(game);
      await new Promise(resolve => setTimeout(resolve, 320));
      await this.waitlist.remove(game.id);
    } catch (e: any) {
      console.error('Failed to mark waitlist game as owned', e);
      if (e?.status === 401 || e?.status === 403) {
        this.messageService.add({
          severity: 'info',
          summary: 'Comprados',
          detail: 'É necessário reconectar a conta ITAD para marcar jogos como comprados.',
          life: 5000,
        });
        await this.auth.login('/waitlist');
        return;
      }
      this.messageService.add({
        severity: 'error',
        summary: 'Comprados',
        detail: 'Não foi possível marcar o jogo como comprado.',
        life: 5000,
      });
    } finally {
      this.leavingIds.update(current => {
        const next = new Set(current);
        next.delete(game.id);
        return next;
      });
    }
  }

  async unmarkOwned(game: ITADIgnoredGame, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    try {
      await this.owned.remove(game.id);
      await this.restoreWaitlist.afterRemovedFromLibrary(game);
    } catch (e: any) {
      console.error('Failed to unmark owned game', e);
      if (e?.status === 401 || e?.status === 403) {
        this.messageService.add({
          severity: 'info',
          summary: 'Comprados',
          detail: 'É necessário reconectar a conta ITAD para atualizar os jogos comprados.',
          life: 5000,
        });
        await this.auth.login('/waitlist');
        return;
      }
      this.messageService.add({
        severity: 'error',
        summary: 'Comprados',
        detail: 'Não foi possível remover o jogo da biblioteca.',
        life: 5000,
      });
    }
  }

  banner(game: { assets?: { banner300?: string; banner400?: string; boxart?: string } }): string | null {
    return game.assets?.banner300 || game.assets?.banner400 || game.assets?.boxart || null;
  }

  notificationGameBanner(gameId: string): string | null {
    const game = this.games().find(item => item.id === gameId);
    return game ? this.banner(game) : null;
  }

  bestDeal(game: ITADNotificationGame) {
    if (!game.deals?.length) return null;
    return [...game.deals].sort((a, b) => {
      const priceDelta = (a.price?.amount ?? Number.POSITIVE_INFINITY) - (b.price?.amount ?? Number.POSITIVE_INFINITY);
      if (priceDelta !== 0) return priceDelta;
      return (b.cut ?? 0) - (a.cut ?? 0);
    })[0];
  }

  notificationDealUrl(game: ITADNotificationGame): string {
    const dealUrl = this.bestDeal(game)?.url?.trim();
    if (dealUrl) return dealUrl;
    if (game.slug) return `https://isthereanydeal.com/game/${encodeURIComponent(game.slug)}/`;
    return 'https://isthereanydeal.com/';
  }

  translateNotificationTitle(title: string | null | undefined): string {
    if (!title) return '';
    const words: Record<string, string> = {
      and: 'e',
      more: 'mais',
      games: 'jogos',
      game: 'jogo',
    };
    return title.replace(/\b(games|game|and|more)\b/gi, match => words[match.toLowerCase()] || match);
  }

  formatPrice(amount: number | null | undefined, currency = 'BRL') {
    if (amount === undefined || amount === null) return '-';
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(amount);
    } catch {
      return `${currency || 'BRL'} ${amount}`;
    }
  }
}
