import { Component, signal, computed, OnInit, inject, ElementRef, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
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

import { DealFeedState, DealItem, DealsStateService } from '../../services/deals-state';
import { ItadApiService } from '../../services/itad-api';

type DealFeedId = 'featured' | 'rated' | 'played';

interface FeedSwiper {
  activeIndex: number;
  size: number;
  slidesSizesGrid?: number[];
  translate?: number;
  setTransition?: (duration: number) => void;
  setTranslate?: (translate: number) => void;
  slideTo?: (index: number, speed?: number) => void;
  update?: () => void;
  updateActiveIndex?: () => void;
  updateSlidesClasses?: () => void;
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
  slideIndex: number;
  slideTranslate: number;
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
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private readonly shopSwiper = viewChild(ShopSwiper);
  private restoringCarousels = false;

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
    this.sortShopsByDealCount(this.shops()).map(shop => ({
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

  readonly sortOptions: Array<{ id: string; label: string; icon: string }> = [
    { id: 'rank', label: 'Mais populares', icon: 'whatshot' },
    { id: 'time', label: 'Mais novos', icon: 'new_releases' },
    { id: '-time', label: 'Mais antigos', icon: 'history' },
    { id: 'price', label: 'Mais baratos', icon: 'trending_down' },
    { id: '-price', label: 'Mais caros', icon: 'trending_up' },
  ];

  browseItems = signal<DealItem[]>([]);
  browseOffset = signal(0);
  browseLoading = signal(true);
  browseLoadingMore = signal(false);
  browseHasMore = signal(true);
  browsePriceMax = signal<number | null>(50);
  browseSort = signal<string | null>('rank');
  private browseSeq = 0;

  totalDeals = computed(() =>
    this.shops().reduce((sum, shop) => sum + (Number(shop.deals) || 0), 0)
  );

  ngOnInit() {
    this.bindNavigationRestore();
    if (this.dealsState.isInitialized() && this.dealsState.featured().items.length > 0) {
      this.restoreFeed('featured', this.dealsState.featured());
      this.restoreFeed('rated', this.dealsState.rated());
      this.restoreFeed('played', this.dealsState.played());
      this.allApiShops.set(this.dealsState.allApiShops());
      this.shops.set(this.sortShopsByDealCount(this.dealsState.shops()));
      this.selectedShops.set(this.normalizeSelectedShops(this.dealsState.selectedShops()));
      this.restoreBrowse(this.dealsState.browse());
      this.loadingShops.set(false);
      for (const feed of this.feeds) {
        if (feed.items().length === 0) {
          this.loadFeed(feed.id);
        }
      }
      if (this.browseItems().length === 0 && !this.browseLoading()) {
        this.loadBrowse();
      }
      this.scheduleRestoreCarousels();
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
      slideIndex: 0,
      slideTranslate: 0,
    };
  }

  private getFeed(id: DealFeedId): DealFeed {
    return this.feeds.find(feed => feed.id === id)!;
  }

  private restoreFeed(id: DealFeedId, state: DealFeedState) {
    const feed = this.getFeed(id);
    feed.items.set(state.items);
    feed.offset.set(state.offset);
    feed.loading.set(false);
    feed.hasMore.set(state.items.length > 0);
    feed.slideIndex = state.slideIndex ?? 0;
    feed.slideTranslate = state.slideTranslate ?? 0;
  }

  private restoreBrowse(state: { items: DealItem[]; offset: number; hasMore: boolean; priceMax: number | null; sort: string | null }) {
    const sort = state.sort === 'expiry' ? 'rank' : state.sort;
    this.browsePriceMax.set(state.priceMax);
    this.browseSort.set(sort);
    if (state.sort === 'expiry') {
      this.loadBrowse();
      return;
    }
    this.browseItems.set(state.items);
    this.browseOffset.set(state.offset);
    this.browseHasMore.set(state.hasMore);
    this.browseLoading.set(false);
    this.browseLoadingMore.set(false);
  }

  private feedSnapshot(id: DealFeedId): DealFeedState {
    const feed = this.getFeed(id);
    return {
      items: feed.items(),
      offset: feed.offset(),
      slideIndex: feed.slideIndex,
      slideTranslate: feed.slideTranslate,
    };
  }

  private syncState() {
    this.dealsState.saveState(
      this.feedSnapshot('featured'),
      this.feedSnapshot('rated'),
      this.feedSnapshot('played'),
      this.allApiShops(),
      this.shops(),
      this.selectedShops(),
      {
        items: this.browseItems(),
        offset: this.browseOffset(),
        hasMore: this.browseHasMore(),
        priceMax: this.browsePriceMax(),
        sort: this.browseSort(),
      },
      this.shopSwiper()?.capturePosition() ?? this.dealsState.shopTranslate()
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

        this.shops.set(this.sortShopsByDealCount(filteredShops));
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
      feed.slideIndex = 0;
      feed.slideTranslate = 0;
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

  private sortShopsByDealCount(shops: ShopItem[]): ShopItem[] {
    return [...shops].sort((left, right) => {
      const dealDiff = (Number(right.deals) || 0) - (Number(left.deals) || 0);
      if (dealDiff !== 0) return dealDiff;
      return left.name.localeCompare(right.name, 'pt-BR');
    });
  }

  formatDealCount(count: number): string {
    const value = Number(count) || 0;
    if (value >= 1000) {
      return `${Math.round(value / 1000)}K`;
    }
    return String(value);
  }

  onFeedProgress(id: DealFeedId, event: Event) {
    this.captureFeedPosition(id, event);
    if (!this.isNearFeedEnd(id, event)) return;
    this.onFeedLoadMore(id);
  }

  onFeedSwiperInit(id: DealFeedId) {
    this.restoreFeedCarousel(id);
  }

  onFeedSlidesUpdated(id: DealFeedId, event: Event) {
    this.restoreFeedCarousel(id);
    this.onFeedProgress(id, event);
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
      const swiper = this.feedSwiper(id);
      swiper?.update?.();
      this.restoreFeedCarousel(id);
    });
  }

  private bindNavigationRestore() {
    const sub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart && this.isDealsUrl(this.router.url)) {
        this.captureCarousels();
        this.syncState();
      }
      if (event instanceof NavigationEnd && this.isDealsUrl(event.urlAfterRedirects || event.url)) {
        this.scheduleRestoreCarousels();
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private isDealsUrl(url: string): boolean {
    const path = url.split('?')[0].split('#')[0];
    return path === '/deals' || path.endsWith('/deals');
  }

  private scheduleRestoreCarousels() {
    this.restoringCarousels = true;
    const apply = () => {
      this.restoreCarousels();
      requestAnimationFrame(() => {
        this.restoreCarousels();
        this.restoringCarousels = false;
      });
    };
    requestAnimationFrame(apply);
  }

  private captureCarousels() {
    for (const feed of this.feeds) {
      this.captureFeedPosition(feed.id);
    }
    this.shopSwiper()?.capturePosition();
  }

  private restoreCarousels() {
    for (const feed of this.feeds) {
      this.restoreFeedCarousel(feed.id);
    }
    this.shopSwiper()?.restorePosition(this.dealsState.shopTranslate());
  }

  private captureFeedPosition(id: DealFeedId, event?: Event) {
    if (this.restoringCarousels) return;
    const host = this.el.nativeElement as HTMLElement;
    if (host.isConnected === false) return;
    const swiper = event ? this.swiperFromEvent(event) : this.feedSwiper(id);
    if (!swiper) return;
    const feed = this.getFeed(id);
    if (typeof swiper.activeIndex === 'number') feed.slideIndex = swiper.activeIndex;
    if (typeof swiper.translate === 'number' && !Number.isNaN(swiper.translate)) {
      feed.slideTranslate = swiper.translate;
    }
  }

  private restoreFeedCarousel(id: DealFeedId) {
    const feed = this.getFeed(id);
    const swiper = this.feedSwiper(id);
    if (!swiper || feed.items().length === 0) return;
    this.restoringCarousels = true;
    swiper.setTransition?.(0);
    if (typeof feed.slideTranslate === 'number') {
      swiper.setTranslate?.(feed.slideTranslate);
    }
    if (feed.slideIndex > 0) {
      swiper.slideTo?.(feed.slideIndex, 0);
      swiper.setTranslate?.(feed.slideTranslate);
    }
    swiper.updateActiveIndex?.();
    swiper.updateSlidesClasses?.();
    requestAnimationFrame(() => {
      this.restoringCarousels = false;
    });
  }

  private feedSwiper(id: DealFeedId): FeedSwiper | null {
    const el = this.el.nativeElement.querySelector(
      `swiper-container.deals-swiper[data-feed="${id}"]`
    ) as (HTMLElement & { swiper?: FeedSwiper }) | null;
    return el?.swiper ?? null;
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
        this.syncState();
      },
      error: () => {
        if (seq !== this.browseSeq) return;
        this.browseLoading.set(false);
        this.browseLoadingMore.set(false);
      }
    });
  }

}
