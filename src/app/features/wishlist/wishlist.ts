import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { MatIconModule } from '@angular/material/icon';
import { StorageService } from '../../services/storage';

@Component({
  selector: 'app-wishlist',
  standalone: true,
  imports: [CommonModule, ButtonModule, SkeletonModule, RouterLink, MatIconModule],
  templateUrl: './wishlist.html',
  styleUrl: './wishlist.css'
})
export class Wishlist {
  private storage = inject(StorageService);

  games = this.storage.games;
  loading = computed(() => !this.storage.hydrated());

  async removeGame(id: number | undefined, event: Event) {
    event.stopPropagation();
    if (id === undefined) return;

    try {
      await this.storage.removeGame(id);
    } catch (e) {
      console.error('Failed to remove game', e);
    }
  }

  formatPrice(amount: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
  }
}
