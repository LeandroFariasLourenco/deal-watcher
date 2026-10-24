import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
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
import { ImgShimmerDirective } from '../../shared/img-shimmer';
import { NotificationsList } from '../../shared/notifications-list/notifications-list';
import { injectIsMobile } from '../../shared/layout';
import { ITADIgnoredGame } from '../../../types/itad';

registerSwiper();

@Component({
  selector: 'app-waitlist',
  standalone: true,
  imports: [CommonModule, SkeletonModule, RouterLink, MatIconModule, ToastModule, ImgShimmerDirective, NotificationsList],
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
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly restoreWaitlist = inject(RestoreWaitlistPrompt);
  readonly isMobile = injectIsMobile();

  games = this.waitlist.games;
  loading = computed(() => this.waitlist.loading() || !this.waitlist.hydrated());
  ownedLoading = computed(() => this.owned.loading() || !this.owned.hydrated());
  ownedRecent = this.owned.recent;
  leavingIds = signal<Set<string>>(new Set());
  private readonly leaveDurationMs = 320;

  constructor() {
    effect(() => {
      if (this.isMobile() && this.notifications.panelOpen()) {
        this.notifications.closePanel();
      }
    });
  }

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
    if (this.isMobile()) {
      this.notifications.closePanel();
      void this.router.navigate(['/notifications']);
      return;
    }
    this.notifications.togglePanel();
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
    if (this.isLeaving(uuid)) return;

    this.beginLeaving(uuid);
    try {
      await this.waitForLeaveAnimation();
      await this.waitlist.remove(uuid);
    } catch (e) {
      console.error('Failed to remove game from ITAD waitlist', e);
    } finally {
      this.endLeaving(uuid);
    }
  }

  isLeaving(id: string): boolean {
    return this.leavingIds().has(id);
  }

  async markAsOwned(game: ITADIgnoredGame, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (this.owned.isOwned(game.id) || this.isLeaving(game.id)) return;

    this.beginLeaving(game.id);

    try {
      await this.owned.add(game);
      await this.waitForLeaveAnimation();
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
      this.endLeaving(game.id);
    }
  }

  async unmarkOwned(game: ITADIgnoredGame, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (this.isLeaving(game.id)) return;

    this.beginLeaving(game.id);
    try {
      await this.waitForLeaveAnimation();
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
    } finally {
      this.endLeaving(game.id);
    }
  }

  private beginLeaving(id: string) {
    this.leavingIds.update(current => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  private endLeaving(id: string) {
    this.leavingIds.update(current => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  private waitForLeaveAnimation() {
    return new Promise<void>(resolve => setTimeout(resolve, this.leaveDurationMs));
  }

  banner(game: { assets?: { banner300?: string; banner400?: string; boxart?: string } }): string | null {
    return game.assets?.banner300 || game.assets?.banner400 || game.assets?.boxart || null;
  }

}
