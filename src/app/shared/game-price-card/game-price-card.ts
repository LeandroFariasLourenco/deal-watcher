import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MessageService } from 'primeng/api';
import { DealItem } from '../../services/deals-state';
import { TimeService } from '../../services/time';
import { WaitlistService } from '../../services/waitlist';
import { OwnedGamesService } from '../../services/owned-games';
import { StoreLogo } from '../store-logo/store-logo';
import { ImgShimmerDirective } from '../img-shimmer';

@Component({
  selector: 'app-game-price-card',
  standalone: true,
  imports: [MatIconModule, RouterLink, StoreLogo, ImgShimmerDirective],
  host: {
    class: 'game-price-card',
    '[class.is-featured]': 'variant() === "featured"',
    '[style.animation-delay.ms]': 'enterDelay()',
  },
  templateUrl: './game-price-card.html',
  styleUrl: './game-price-card.css',
})
export class GamePriceCard {
  game = input.required<DealItem>();
  rank = input<number | null>(null);
  from = input('deals');
  enterDelay = input<number | null>(null);
  variant = input<'list' | 'featured'>('list');
  highlight = input(false);

  isHistoryLow = computed(() => {
    const current = this.game().price?.amount;
    const low = this.game().historyLow?.amount;
    if (current == null || low == null) return false;
    return current <= low + 0.01;
  });

  timeService = inject(TimeService);
  waitlist = inject(WaitlistService);
  owned = inject(OwnedGamesService);
  private messageService = inject(MessageService);

  formatPrice(amount: number | null | undefined) {
    if (amount === undefined || amount === null) return '-';
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
    } catch {
      return `R$ ${amount}`;
    }
  }

  async addToWatchlist(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    try {
      await this.waitlist.toggle(this.game().id);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao atualizar a waitlist' });
    }
  }
}
