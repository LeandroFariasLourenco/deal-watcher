import { Component, input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonModule } from 'primeng/skeleton';
import { MatIconModule } from '@angular/material/icon';
import { ItadNotificationsService } from '../../services/itad-notifications';
import { WaitlistService } from '../../services/waitlist';
import { TimeService } from '../../services/time';
import { StoreLogo } from '../store-logo/store-logo';
import { ITADNotificationGame } from '../../../types/itad';

@Component({
  selector: 'app-notifications-list',
  standalone: true,
  imports: [CommonModule, SkeletonModule, MatIconModule, StoreLogo],
  templateUrl: './notifications-list.html',
  styleUrl: './notifications-list.css'
})
export class NotificationsList {
  readonly variant = input<'panel' | 'page'>('panel');
  readonly notifications = inject(ItadNotificationsService);
  readonly waitlist = inject(WaitlistService);
  readonly timeService = inject(TimeService);

  toggleNotificationDetail(id: string) {
    this.notifications.toggleExpanded(id);
  }

  retryNotificationDetail(id: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    void this.notifications.loadDetails(id);
  }

  notificationGameBanner(gameId: string): string | null {
    const game = this.waitlist.games().find(item => item.id === gameId);
    if (!game) return null;
    return game.assets?.banner300 || game.assets?.banner400 || game.assets?.boxart || null;
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
