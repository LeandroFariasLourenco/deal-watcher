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
import { ShopSwiper, ShopSwiperItem } from '../../shared/shop-swiper/shop-swiper';

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

interface FeedSwiper {
  activeIndex: number;
  size: number;
  slidesSizesGrid?: number[];
}

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
  imports: [CommonModule, ButtonModule, SkeletonModule, MatIconModule, ToastModule, GamePriceCard, ShopSwiper],
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
  limit = 20;
  readonly skeletonSlots = Array.from({ length: this.limit }, (_, i) => i);
  readonly pageSkeletonSlots = [1, 2, 3, 4, 5, 6];
  private readonly feedPrefetchSlides = 6;

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

  selectedShopId = computed(() => this.selectedShops()[0] ?? null);

  shopSwiperItems = computed<ShopSwiperItem[]>(() =>
    this.shops().map(shop => ({
      id: shop.id,
      name: shop.name,
      caption: `${this.formatDealCount(shop.deals)} ofertas`,
    }))
  );

  allShopsCaption = computed(() => `${this.formatDealCount(this.totalDeals())} ofertas`);

  shopsLocked = computed(() => this.feeds.some(feed => feed.loading()) || this.browseLoading());

  readonly priceFilters: Array<{ label: string; max: number }> = [
    { label: 'Até R$10', max: 10 },
    { label: 'Até R$25', max: 25 },
    { label: 'Até R$50', max: 50 },
  ];

  readonly sortOptions: Array<{ id: string; label: string }> = [
    { id: 'time', label: 'Mais novos' },
    { id: '-time', label: 'Mais antigos' },
    { id: 'expiry', label: 'Expirando' },
    { id: 'price', label: 'Mais baratos' },
    { id: '-price', label: 'Mais caros' },
  ];

  browseItems = signal<DealItem[]>([]);
  browseOffset = signal(0);
  browseLoading = signal(true);
  browseLoadingMore = signal(false);
  browseHasMore = signal(true);
  browsePriceMax = signal<number | null>(null);
  browseSort = signal<string | null>('expiry');
  private browseSeq = 0;

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
      this.selectedShops.set(this.normalizeSelectedShops(this.dealsState.selectedShops()));
      this.loadingShops.set(false);
      for (const feed of this.feeds) {
        if (feed.items().length === 0) {
          this.loadFeed(feed.id);
        }
      }
      this.loadBrowse();
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
    this.loadBrowse();
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
        this.refreshFeedSwiper(id);
        if (id === 'featured' && !append) {
          this.triggerCascadeAnimation(startIndex);
        }
      },
      error: () => {
        feed.loading.set(false);
        feed.loadingMore.set(false);
      }
    });
  }

  toggleShop(shopId: number) {
    if (this.shopsLocked()) return;
    const current = this.selectedShops();
    if (current.length === 1 && current[0] === shopId) {
      this.selectedShops.set([]);
    } else {
      this.selectedShops.set([shopId]);
    }
    this.syncState();
    this.loadAllFeeds();
  }

  clearShops() {
    if (this.shopsLocked() || this.selectedShops().length === 0) return;
    this.selectedShops.set([]);
    this.syncState();
    this.loadAllFeeds();
  }

  onShopSelect(shopId: number | null) {
    if (shopId == null) {
      this.clearShops();
      return;
    }
    this.toggleShop(shopId);
  }

  private normalizeSelectedShops(shopIds: number[]): number[] {
    if (shopIds.length <= 1) return shopIds;
    return [shopIds[0]];
  }

  formatDealCount(count: number): string {
    const value = Number(count) || 0;
    if (value >= 1000) {
      return `${Math.round(value / 1000)}K`;
    }
    return String(value);
  }

  onFeedProgress(id: DealFeedId, event: Event) {
    if (!this.isNearFeedEnd(id, event)) return;
    this.onFeedLoadMore(id);
  }

  onFeedLoadMore(id: DealFeedId) {
    const feed = this.getFeed(id);
    if (feed.loading() || feed.loadingMore() || !feed.hasMore() || feed.items().length === 0) return;
    feed.offset.update(v => v + this.limit);
    this.loadFeed(id, true);
  }

  private isNearFeedEnd(id: DealFeedId, event: Event): boolean {
    const feed = this.getFeed(id);
    const count = feed.items().length;
    if (count === 0) return false;

    const swiper = this.swiperFromEvent(event);
    if (swiper) {
      const slideSize = swiper.slidesSizesGrid?.[swiper.activeIndex] || swiper.slidesSizesGrid?.[0] || 260;
      const visible = Math.max(1, Math.ceil((swiper.size || 0) / Math.max(slideSize, 1)));
      const lastVisible = (swiper.activeIndex ?? 0) + visible;
      return lastVisible >= count - this.feedPrefetchSlides;
    }

    const progress = this.swiperProgress(event);
    return progress >= 0.55;
  }

  private swiperFromEvent(event: Event): FeedSwiper | null {
    const target = event.target as (HTMLElement & { swiper?: FeedSwiper }) | null;
    if (target?.swiper?.slidesSizesGrid) return target.swiper;
    const detail = (event as CustomEvent).detail;
    if (Array.isArray(detail) && detail[0]?.slidesSizesGrid) return detail[0] as FeedSwiper;
    return null;
  }

  private swiperProgress(event: Event): number {
    const detail = (event as CustomEvent).detail;
    if (Array.isArray(detail) && typeof detail[1] === 'number') return detail[1];
    if (typeof detail === 'number') return detail;
    return 0;
  }

  private refreshFeedSwiper(id: DealFeedId) {
    requestAnimationFrame(() => {
      const el = this.el.nativeElement.querySelector(
        `swiper-container.deals-swiper[data-feed="${id}"]`
      ) as (HTMLElement & { swiper?: { update?: () => void } }) | null;
      el?.swiper?.update?.();
    });
  }

  setBrowsePrice(max: number) {
    this.browsePriceMax.update(current => current === max ? null : max);
    this.loadBrowse();
  }

  setBrowseSort(sort: string) {
    this.browseSort.update(current => current === sort ? null : sort);
    this.loadBrowse();
  }

  loadMoreBrowse() {
    if (this.browseLoading() || this.browseLoadingMore() || !this.browseHasMore()) return;
    this.browseOffset.update(v => v + this.limit);
    this.loadBrowse(true);
  }

  private browseFilter(): Record<string, unknown> | null {
    const max = this.browsePriceMax();
    if (max == null) return null;
    return { price: { min: null, max } };
  }

  loadBrowse(append = false) {
    const shops: number[] = this.activeShopIds();
    if (shops.length === 0) {
      this.browseLoading.set(false);
      this.browseLoadingMore.set(false);
      return;
    }

    if (!append) {
      this.browseOffset.set(0);
      this.browseItems.set([]);
      this.browseHasMore.set(true);
      this.browseLoading.set(true);
      this.browseLoadingMore.set(false);
    } else {
      this.browseLoadingMore.set(true);
    }

    const seq = ++this.browseSeq;
    const offset = this.browseOffset();
    this.itadApi.getDeals(APP_COUNTRY, offset, this.limit, shops, this.browseSort() ?? undefined, this.browseFilter()).subscribe({
      next: (data) => {
        if (seq !== this.browseSeq) return;
        const newDeals = this.mapDeals(data);
        if (append) {
          this.browseItems.update(current => [...current, ...newDeals]);
        } else {
          this.browseItems.set(newDeals);
        }
        this.browseHasMore.set(newDeals.length >= this.limit);
        this.browseLoading.set(false);
        this.browseLoadingMore.set(false);
      },
      error: () => {
        if (seq !== this.browseSeq) return;
        this.browseLoading.set(false);
        this.browseLoadingMore.set(false);
      }
    });
  }

}
