import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { MatIconModule } from '@angular/material/icon';
import { WaitlistService } from '../../services/waitlist';
import { ItadAuthService } from '../../services/itad-auth';

@Component({
  selector: 'app-wishlist',
  standalone: true,
  imports: [CommonModule, ButtonModule, SkeletonModule, RouterLink, MatIconModule],
  templateUrl: './wishlist.html',
  styleUrl: './wishlist.css'
})
export class Wishlist {
  readonly waitlist = inject(WaitlistService);
  readonly auth = inject(ItadAuthService);

  games = this.waitlist.games;
  loading = computed(() => this.waitlist.loading() || !this.waitlist.hydrated());

  connect() {
    void this.auth.login('/wishlist');
  }

  logout() {
    this.auth.logout();
    void this.waitlist.refresh();
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
