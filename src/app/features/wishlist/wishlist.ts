import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { MatIconModule } from '@angular/material/icon';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { WaitlistService } from '../../services/waitlist';
import { ItadAuthService } from '../../services/itad-auth';
import { EmailService } from '../../services/email';

@Component({
  selector: 'app-wishlist',
  standalone: true,
  imports: [CommonModule, SkeletonModule, RouterLink, MatIconModule, ToastModule],
  providers: [MessageService],
  templateUrl: './wishlist.html',
  styleUrl: './wishlist.css'
})
export class Wishlist {
  readonly waitlist = inject(WaitlistService);
  readonly auth = inject(ItadAuthService);
  readonly email = inject(EmailService);
  private readonly messageService = inject(MessageService);

  games = this.waitlist.games;
  loading = computed(() => this.waitlist.loading() || !this.waitlist.hydrated());

  connect() {
    void this.auth.login('/wishlist');
  }

  logout() {
    this.auth.logout();
    void this.waitlist.refresh();
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
