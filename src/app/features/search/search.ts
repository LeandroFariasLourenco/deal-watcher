import { Component, signal, inject, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { MatIconModule } from '@angular/material/icon';
import { WaitlistService } from '../../services/waitlist';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { SearchStateService } from '../../services/search-state';
import { TimeService } from '../../services/time';
import { DEFAULT_SHOP_IDS } from '../../shared/constants';
import { ItadApiService } from '../../services/itad-api';
import { animate, stagger } from 'motion';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    InputTextModule, 
    ButtonModule, 
    SkeletonModule, 
    RouterLink,
    MatIconModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './search.html',
  styleUrl: './search.css'
})
export class Search implements OnInit {
  private itadApi = inject(ItadApiService);
  public waitlist = inject(WaitlistService);
  private messageService = inject(MessageService);
  private searchState = inject(SearchStateService);
  public timeService = inject(TimeService);
  private el = inject(ElementRef);
  
  searchControl = new FormControl('', { nonNullable: true });
  results = signal<any[]>([]);
  loading = signal(false);

  trendingGames = signal<any[]>([]);
  loadingTrending = signal(false);

  ngOnInit() {
    if (this.searchState.hasSearched()) {
      this.searchControl.setValue(this.searchState.query());
      this.results.set(this.searchState.results());
    }
    this.loadTrendingGames();
  }

  loadTrendingGames() {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    try {
      const cachedStr = localStorage.getItem('trending_games_cache_v1');
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (
          cached && 
          typeof cached.timestamp === 'number' && 
          (Date.now() - cached.timestamp < ONE_DAY_MS) && 
          Array.isArray(cached.data) && 
          cached.data.length > 0
        ) {
          this.trendingGames.set(cached.data);
          this.loadingTrending.set(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Error reading trending games cache from localStorage', e);
    }

    this.loadingTrending.set(true);
    this.itadApi.getDeals('BR', 0, 10, DEFAULT_SHOP_IDS, 'steam-players').subscribe({
      next: (data) => {
        const rawList = Array.isArray(data?.list) ? data.list : (Array.isArray(data) ? data : []);
        const items = rawList.slice(0, 10).map((item: any) => ({
          id: item.id,
          title: item.title,
          shop: item.deal?.shop || item.shop || { id: 0, name: 'Loja Oficial' },
          price: item.deal?.price || item.price || { amount: 0, currency: 'BRL' },
          regular: item.deal?.regular || item.regular || { amount: 0, currency: 'BRL' },
          cut: item.deal?.cut ?? item.cut ?? 0,
          assets: item.assets || {},
          expiry: item.deal?.expiry || item.expiry
        }));
        this.trendingGames.set(items);
        this.loadingTrending.set(false);
        try {
          localStorage.setItem('trending_games_cache_v1', JSON.stringify({
            timestamp: Date.now(),
            data: items
          }));
        } catch (e) {
          console.warn('Error saving trending games to localStorage', e);
        }
        this.triggerCascadeAnimation();
      },
      error: () => this.loadingTrending.set(false)
    });
  }

  triggerCascadeAnimation() {
    setTimeout(() => {
      const items = this.el.nativeElement.querySelectorAll('.trending-cascade-item');
      if (items && items.length > 0) {
        animate(
          items,
          { opacity: [0, 1], y: [16, 0] },
          { delay: stagger(0.06), duration: 0.42, ease: 'easeOut' }
        );
      }
    }, 40);
  }

  onSearch() {
    const query = this.searchControl.value;
    if (!query) return;
    this.loading.set(true);
    this.itadApi.searchGames(query).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : [];
        this.results.set(list);
        this.searchState.saveState(query, list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  clearSearch() {
    this.searchControl.setValue('');
    this.results.set([]);
    this.searchState.saveState('', []);
    this.triggerCascadeAnimation();
  }

  formatPrice(amount: number | undefined | null, currency = 'BRL') {
    if (amount === undefined || amount === null) return '-';
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(amount);
    } catch {
      return `${currency || 'BRL'} ${amount}`;
    }
  }

  async addToWatchlist(game: any, event: Event) {
    event.stopPropagation();
    try {
      const result = await this.waitlist.toggle(game.id);
      if (result === 'login') return;
      this.messageService.add({
        severity: 'success',
        summary: 'Waitlist ITAD',
        detail: result === 'removed' ? 'Removido da waitlist' : 'Adicionado à waitlist'
      });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao atualizar a waitlist' });
    }
  }
}
