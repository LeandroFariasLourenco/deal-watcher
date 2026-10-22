import { afterNextRender, Component, ElementRef, inject, Injector, OnInit, signal } from '@angular/core';
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
import { DEFAULT_SHOP_IDS } from '../../shared/constants';
import { ItadApiService } from '../../services/itad-api';
import { DealItem } from '../../services/deals-state';
import { GamePriceCard } from '../../shared/game-price-card/game-price-card';
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
    ToastModule,
    GamePriceCard
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
  private el = inject(ElementRef);
  private injector = inject(Injector);
  
  searchControl = new FormControl('', { nonNullable: true });
  results = signal<any[]>([]);
  loading = signal(false);
  /** Query that was actually submitted. Typing alone does not set this. */
  submittedQuery = signal('');
  /** Bumped on each search or clear so a late response cannot restore results. */
  private searchSeq = 0;

  trendingGames = signal<DealItem[]>([]);
  loadingTrending = signal(false);

  ngOnInit() {
    if (this.searchState.hasSearched()) {
      this.searchControl.setValue(this.searchState.query());
      this.results.set(this.searchState.results());
      this.submittedQuery.set(this.searchState.query());
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
          cached.data.length > 0 &&
          typeof cached.data[0]?.type === 'string'
        ) {
          this.trendingGames.set(cached.data);
          this.loadingTrending.set(false);
          this.triggerCascadeAnimation();
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
          type: item.type,
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
    afterNextRender(() => {
      const items = this.el.nativeElement.querySelectorAll('.trending-cascade-item');
      if (!items || items.length === 0) return;
      animate(
        items,
        { opacity: [0, 1], y: [16, 0] },
        { delay: stagger(0.06), duration: 0.42, ease: 'easeOut' }
      );
    }, { injector: this.injector });
  }

  /** Visible while the field has text or a search is still on screen. */
  showClearButton(): boolean {
    return !!this.searchControl.value || !!this.submittedQuery() || this.results().length > 0 || this.loading();
  }

  /**
   * Right-slot submit icon. Shown on an empty bar, and while the typed query
   * is not the one already on screen. Once that query is active, the slot
   * switches to the clear icon.
   */
  showSubmitButton(): boolean {
    const value = this.searchControl.value.trim();
    if (!value) {
      return !this.submittedQuery() && this.results().length === 0 && !this.loading();
    }
    return value !== this.submittedQuery().trim();
  }

  onSearch() {
    const query = this.searchControl.value;
    if (!query) return;
    const seq = ++this.searchSeq;
    this.submittedQuery.set(query);
    this.loading.set(true);
    this.itadApi.searchGames(query).subscribe({
      next: (data) => {
        if (seq !== this.searchSeq) return;
        const list = Array.isArray(data) ? data : [];
        this.results.set(list);
        this.searchState.saveState(query, list);
        this.loading.set(false);
      },
      error: () => {
        if (seq !== this.searchSeq) return;
        this.loading.set(false);
      }
    });
  }

  clearSearch() {
    this.searchSeq++;
    this.searchControl.setValue('');
    this.results.set([]);
    this.submittedQuery.set('');
    this.loading.set(false);
    this.searchState.clear();
    this.triggerCascadeAnimation();
  }

  async addToWatchlist(game: any, event: Event) {
    event.stopPropagation();
    try {
      await this.waitlist.toggle(game.id);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao atualizar a waitlist' });
    }
  }
}
