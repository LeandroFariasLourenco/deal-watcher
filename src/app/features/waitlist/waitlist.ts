import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { MatIconModule } from '@angular/material/icon';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { WaitlistService } from '../../services/waitlist';
import { ItadAuthService } from '../../services/itad-auth';
import { EmailService } from '../../services/email';
import { ItadWebhookService } from '../../services/itad-webhook';
import { ItadNotificationsService } from '../../services/itad-notifications';
import { ImgShimmerDirective } from '../../shared/img-shimmer';

@Component({
  selector: 'app-waitlist',
  standalone: true,
  imports: [CommonModule, SkeletonModule, RouterLink, MatIconModule, ToastModule, ImgShimmerDirective],
  providers: [MessageService],
  templateUrl: './waitlist.html',
  styleUrl: './waitlist.css'
})
export class Waitlist {
  readonly waitlist = inject(WaitlistService);
  readonly auth = inject(ItadAuthService);
  readonly email = inject(EmailService);
  readonly webhook = inject(ItadWebhookService);
  readonly notifications = inject(ItadNotificationsService);
  private readonly messageService = inject(MessageService);

  games = this.waitlist.games;
  loading = computed(() => this.waitlist.loading() || !this.waitlist.hydrated());
  notificationsOpen = signal(false);

  connect() {
    void this.auth.login('/waitlist');
  }

  logout() {
    this.auth.logout();
    this.notifications.clear();
    this.notificationsOpen.set(false);
    void this.waitlist.refresh();
  }

  toggleNotifications() {
    this.notificationsOpen.update(open => !open);
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

  banner(game: { assets?: { banner300?: string; banner400?: string; boxart?: string } }): string | null {
    return game.assets?.banner300 || game.assets?.banner400 || game.assets?.boxart || null;
  }
}
