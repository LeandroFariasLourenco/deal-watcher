import { Component, signal, computed, OnInit, inject, ElementRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { register as registerSwiper } from 'swiper/element/bundle';

registerSwiper();
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { MatIconModule } from '@angular/material/icon';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { animate, stagger } from 'motion';
import { GamePriceCard } from '../../shared/game-price-card/game-price-card';
import { StoreLogo } from '../../shared/store-logo/store-logo';

interface ShopItem {
  id: number;
  title: string;
  name: string;
  deals: number;
  games: number;
  update?: string;
  icon: string;
  logo: string;
}

import { APP_COUNTRY, DEFAULT_SHOP_IDS, ALLOWED_STORE_CONFIG } from '../../shared/constants';

import { DealItem, DealsStateService } from '../../services/deals-state';
import { ItadApiService } from '../../services/itad-api';

type DealFeedId = 'featured' | 'rated' | 'played';

interface DealFeed {
  id: DealFeedId;
  title: string;
  icon: string;
  sort: string;
  highlightFirst: boolean;
  items: ReturnType<typeof signal<DealItem[]>>;
  offset: ReturnType<typeof signal<number>>;
  loading: ReturnType<typeof signal<boolean>>;
  loadingMore: ReturnType<typeof signal<boolean>>;
  hasMore: ReturnType<typeof signal<boolean>>;
}

@Component({
  selector: 'app-deals',
  standalone: true,
  imports: [CommonModule, ButtonModule, SkeletonModule, MatIconModule, ToastModule, GamePriceCard, StoreLogo],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [MessageService],
  templateUrl: './deals.html',
  styleUrl: './deals.css'
})
export class Deals implements OnInit {
  private itadApi = inject(ItadApiService);
  private dealsState = inject(DealsStateService);
  private el = inject(ElementRef);

  allApiShops = signal<any[]>([]);
  shops = signal<ShopItem[]>([]);
  loadingShops = signal(true);
  selectedShops = signal<number[]>([]);
  private loadingShopId = signal<number | 'all' | null>(null);
  limit = 20;
  readonly skeletonSlots = Array.from({ length: this.limit }, (_, i) => i);

  feeds: DealFeed[] = [
    this.createFeed('featured', 'Em destaques', 'auto_awesome', 'rank', true),
    this.createFeed('played', 'Mais jogados', 'sports_esports', '-steam-players', false),
    this.createFeed('rated', 'Melhores avaliados', 'military_tech', '-metacritic', false),
  ];

  activeShopIds = computed<number[]>(() => {
    const selected = this.selectedShops();
    if (selected.length > 0) {
      return selected;
    }
    return DEFAULT_SHOP_IDS;
  });

  isAllShopsSelected = computed(() => this.selectedShops().length === 0);

  shopsLocked = computed(() => this.feeds.some(feed => feed.loading()));

  totalDeals = computed(() =>
    this.shops().reduce((sum, shop) => sum + (Number(shop.deals) || 0), 0)
  );

  ngOnInit() {
    if (this.dealsState.isInitialized() && this.dealsState.featured().items.length > 0) {
      this.restoreFeed('featured', this.dealsState.featured());
      this.restoreFeed('rated', this.dealsState.rated());
      this.restoreFeed('played', this.dealsState.played());
      this.allApiShops.set(this.dealsState.allApiShops());
      this.shops.set(this.dealsState.shops());
      this.selectedShops.set(this.dealsState.selectedShops());
      this.loadingShops.set(false);
      for (const feed of this.feeds) {
        if (feed.items().length === 0) {
          this.loadFeed(feed.id);
        }
      }
    } else {
      this.loadShops();
    }
  }

  triggerCascadeAnimation(startIndex: number = 0) {
    setTimeout(() => {
      const allItems = this.el.nativeElement.querySelectorAll('.cascade-item');
      if (!allItems || allItems.length === 0) return;
      const targetItems = Array.from(allItems).slice(startIndex);
      if (targetItems.length > 0) {
        animate(
          targetItems,
          { opacity: [0, 1], y: [16, 0] },
          { delay: stagger(0.04), duration: 0.42, ease: 'easeOut' }
        );
      }
    }, 40);
  }

  private createFeed(
    id: DealFeedId,
    title: string,
    icon: string,
    sort: string,
    highlightFirst: boolean
  ): DealFeed {
    return {
      id,
      title,
      icon,
      sort,
      highlightFirst,
      items: signal<DealItem[]>([]),
      offset: signal(0),
      loading: signal(true),
      loadingMore: signal(false),
      hasMore: signal(true),
    };
  }

  private getFeed(id: DealFeedId): DealFeed {
    return this.feeds.find(feed => feed.id === id)!;
  }

  private restoreFeed(id: DealFeedId, state: { items: DealItem[]; offset: number }) {
    const feed = this.getFeed(id);
    feed.items.set(state.items);
    feed.offset.set(state.offset);
    feed.loading.set(false);
    feed.hasMore.set(state.items.length > 0);
  }

  private syncState() {
    this.dealsState.saveState(
      { items: this.getFeed('featured').items(), offset: this.getFeed('featured').offset() },
      { items: this.getFeed('rated').items(), offset: this.getFeed('rated').offset() },
      { items: this.getFeed('played').items(), offset: this.getFeed('played').offset() },
      this.allApiShops(),
      this.shops(),
      this.selectedShops()
    );
  }

  loadShops() {
    this.loadingShops.set(true);
    this.itadApi.getShops(APP_COUNTRY).subscribe({
      next: (data) => {
        const rawShops = Array.isArray(data) ? data : [];
        this.allApiShops.set(rawShops);

        const filteredShops: ShopItem[] = [];
        for (const config of ALLOWED_STORE_CONFIG) {
          const matched = rawShops.find((s: any) => {
            const rawName = (s.title || s.name || '').toLowerCase().trim();
            return s.id === config.id || config.matchTitles.includes(rawName);
          });

          if (matched) {
            filteredShops.push({
              ...matched,
              id: config.id,
              name: config.shortName,
              deals: matched.deals ?? 0,
              games: matched.games ?? 0,
              icon: config.icon,
              logo: config.logo
            });
          }
        }

        this.shops.set(filteredShops);
        this.loadingShops.set(false);
        this.loadAllFeeds();
      },
      error: () => {
        this.loadingShops.set(false);
        this.loadAllFeeds();
      }
    });
  }

  private loadAllFeeds() {
    for (const feed of this.feeds) {
      feed.offset.set(0);
      feed.items.set([]);
      feed.hasMore.set(true);
      feed.loadingMore.set(false);
      feed.loading.set(true);
    }
    for (const feed of this.feeds) {
      this.loadFeed(feed.id);
    }
  }

  private mapDeals(data: any): DealItem[] {
    const rawList = Array.isArray(data?.list) ? data.list : (Array.isArray(data) ? data : []);
    return rawList.map((item: any) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      shop: item.deal?.shop || item.shop || { id: 0, name: 'Loja Oficial' },
      price: item.deal?.price || item.price || { amount: 0, currency: 'BRL' },
      regular: item.deal?.regular || item.regular || { amount: 0, currency: 'BRL' },
      cut: item.deal?.cut ?? item.cut ?? 0,
      assets: item.assets || {},
      expiry: item.deal?.expiry || item.expiry,
      historyLow: item.deal?.historyLow || item.historyLow || null
    }));
  }

  loadFeed(id: DealFeedId, append = false) {
    const feed = this.getFeed(id);
    const shops: number[] = this.activeShopIds();
    if (shops.length === 0) {
      feed.loading.set(false);
      feed.loadingMore.set(false);
      return;
    }

    if (append) {
      feed.loadingMore.set(true);
    } else {
      feed.loading.set(true);
      feed.hasMore.set(true);
    }

    const startIndex = append ? feed.items().length : 0;
    this.itadApi.getDeals(APP_COUNTRY, feed.offset(), this.limit, shops, feed.sort).subscribe({
      next: (data) => {
        const newDeals = this.mapDeals(data);
        if (append) {
          feed.items.update(current => [...current, ...newDeals]);
        } else {
          feed.items.set(newDeals);
        }
        feed.hasMore.set(newDeals.length >= this.limit);
        this.syncState();
        feed.loading.set(false);
        feed.loadingMore.set(false);
        if (id === 'featured') {
          this.triggerCascadeAnimation(startIndex);
        }
      },
      error: () => {
        feed.loading.set(false);
        feed.loadingMore.set(false);
      }
    });
  }

  isShopDisabled(shopId: number): boolean {
    return this.shopsLocked() && this.loadingShopId() !== shopId;
  }

  isAllShopsDisabled(): boolean {
    return this.shopsLocked() && this.loadingShopId() !== 'all';
  }

  toggleShop(shopId: number) {
    if (this.shopsLocked()) return;
    this.loadingShopId.set(shopId);
    this.selectedShops.update(current => {
      if (current.includes(shopId)) {
        return current.filter(id => id !== shopId);
      } else {
        return [...current, shopId];
      }
    });
    this.syncState();
    this.loadAllFeeds();
  }

  clearShops() {
    if (this.shopsLocked() || this.selectedShops().length === 0) return;
    this.loadingShopId.set('all');
    this.selectedShops.set([]);
    this.syncState();
    this.loadAllFeeds();
  }

  isShopSelected(shopId: number): boolean {
    return this.selectedShops().includes(shopId);
  }

  formatDealCount(count: number): string {
    const value = Number(count) || 0;
    if (value >= 1000) {
      return `${Math.round(value / 1000)}K`;
    }
    return String(value);
  }

  onFeedReachEnd(id: DealFeedId) {
    const feed = this.getFeed(id);
    if (feed.loading() || feed.loadingMore() || !feed.hasMore()) return;
    feed.offset.update(v => v + this.limit);
    this.loadFeed(id, true);
  }

}
