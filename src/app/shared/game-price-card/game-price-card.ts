import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MessageService } from 'primeng/api';
import { DealItem } from '../../services/deals-state';
import { TimeService } from '../../services/time';
import { WaitlistService } from '../../services/waitlist';

@Component({
  selector: 'app-game-price-card',
  standalone: true,
  imports: [MatIconModule, RouterLink],
  host: {
    class: 'game-price-card',
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

  timeService = inject(TimeService);
  waitlist = inject(WaitlistService);
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
      const result = await this.waitlist.toggle(this.game().id);
      if (result === 'login' || result === 'added') return;
      this.messageService.add({
        severity: 'success',
        summary: 'Waitlist ITAD',
        detail: 'Removido da waitlist',
      });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao atualizar a waitlist' });
    }
  }
}
