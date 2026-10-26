import { Component, DestroyRef, signal, computed, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ItadApiService } from '../../services/itad-api';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { ReactiveFormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ChartModule } from 'primeng/chart';
import { MatIconModule } from '@angular/material/icon';
import { APP_COUNTRY, DEFAULT_SHOP_IDS, ALLOWED_STORE_CONFIG } from '../../shared/constants';
import { StoreLogo } from '../../shared/store-logo/store-logo';
import { ShopSwiper, ShopSwiperItem } from '../../shared/shop-swiper/shop-swiper';
import { ImgShimmerDirective } from '../../shared/img-shimmer';
import { DeferLoadDirective } from '../../shared/defer-load';
import { ITADGameBundle, ITADGamePrices, ITADGameSub } from '../../../types/itad';
import { SteamAppReview, SteamNewsItem, SteamReviewSummary, SteamReviewType, SteamReviewTypeValue } from '../../../services/steam';
import { WaitlistService } from '../../services/waitlist';
import { OwnedGamesService } from '../../services/owned-games';
import { RestoreWaitlistPrompt } from '../../shared/restore-waitlist-dialog/restore-waitlist-dialog';
import { TimeService } from '../../services/time';
import { GameSummaryService } from '../../services/game-summary';
import { GameAiSummary } from './game-ai-summary';

export interface HistoryShopItem {
  id: number;
  name: string;
  icon: string;
  count: number;
}

@Component({
  selector: 'app-details',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ButtonModule,
    CardModule,
    TagModule,
    SkeletonModule,
    ReactiveFormsModule,
    ToastModule,
    ChartModule,
    MatIconModule,
    StoreLogo,
    ShopSwiper,
    ImgShimmerDirective,
    DeferLoadDirective,
    GameAiSummary
  ],
  providers: [MessageService],
  templateUrl: './details.html',
  styleUrl: './details.css'
})
export class Details implements OnInit {
  private itadApi = inject(ItadApiService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private messageService = inject(MessageService);
  private gameSummary = inject(GameSummaryService);
  private readonly lazySections = ['prices', 'subs', 'bundles', 'history', 'reviews', 'news'] as const;
  private revealed = signal(new Set<string>());
  private settled = signal(new Set<string>());
  public waitlist = inject(WaitlistService);
  public owned = inject(OwnedGamesService);
  private restoreWaitlist = inject(RestoreWaitlistPrompt);
  public timeService = inject(TimeService);

  uuid = signal<string | null>(null);
  details = signal<any>(null);
  history = signal<any[]>([]);
  subscriptions = signal<ITADGameSub[]>([]);
  bundles = signal<ITADGameBundle[]>([]);
  pricePack = signal<ITADGamePrices | null>(null);
  loading = signal(true);
  loadingPrices = signal(true);
  loadingHistory = signal(true);
  loadingSubs = signal(true);
  loadingBundles = signal(true);
  loadingSteamReviews = signal(false);
  loadingSteamNews = signal(false);
  steamReviews = signal<SteamAppReview[]>([]);
  steamReviewSummary = signal<SteamReviewSummary | null>(null);
  steamReviewType = signal<SteamReviewTypeValue>(SteamReviewType.All);
  steamReviewsOpened = signal(false);
  steamNews = signal<SteamNewsItem[]>([]);
  readonly steamReviewTypeOptions: Array<{ value: SteamReviewTypeValue; label: string }> = [
    { value: SteamReviewType.All, label: 'Todas' },
    { value: SteamReviewType.Positive, label: 'Positivas' },
    { value: SteamReviewType.Negative, label: 'Negativas' },
  ];
  adding = signal(false);
  owning = signal(false);
  isAlreadyInWaitlist = computed(() => this.waitlist.isMonitored(this.uuid()));
  isOwned = computed(() => this.owned.isOwned(this.uuid()));
  error = signal<string | null>(null);

  historyShops = signal<HistoryShopItem[]>([]);
  selectedHistoryShop = signal<number | null>(null);
  selectedHistoryShopName = computed(() => {
    const shopId = this.selectedHistoryShop();
    if (!shopId) return null;
    const found = this.historyShops().find(s => s.id === shopId);
    return found ? found.name : null;
  });

  historyShopTiles = computed<ShopSwiperItem[]>(() =>
    this.historyShops().map(shop => ({
      id: shop.id,
      name: shop.name,
      caption: `${shop.count} ${shop.count === 1 ? 'registro' : 'registros'}`,
    }))
  );

  chartData = signal<any>(null);
  chartOptions = signal<any>(null);

  gameInfo = computed(() => this.details()?.info || null);
  gamePrices = computed<any[]>(() => this.details()?.prices || []);
  gameTags = computed<string[]>(() => this.gameInfo()?.tags || []);
  gameDevelopers = computed<any[]>(() => this.gameInfo()?.developers || []);
  gamePublishers = computed<any[]>(() => this.gameInfo()?.publishers || []);
  gameReviews = computed<any[]>(() => this.gameInfo()?.reviews || []);
  steamAppId = computed<number | null>(() => {
    const appid = Number(this.gameInfo()?.appid);
    return Number.isInteger(appid) && appid > 0 ? appid : null;
  });
  steamReviewsPageUrl = computed(() => {
    const appId = this.steamAppId();
    return appId ? `https://steamcommunity.com/app/${appId}/reviews` : null;
  });
  gameStats = computed(() => this.gameInfo()?.stats || null);
  gamePlayers = computed(() => this.gameInfo()?.players || null);
  detailsReadyForSummary = computed(() => {
    if (this.loading() || !this.gameInfo()) return false;
    const revealed = this.revealed();
    if (!this.lazySections.every(section => revealed.has(section))) return false;
    return (
      !this.loadingPrices() &&
      !this.loadingSubs() &&
      !this.loadingBundles() &&
      !this.loadingHistory() &&
      !this.loadingSteamNews() &&
      !this.loadingSteamReviews()
    );
  });
  summaryPayload = computed(() =>
    this.gameSummary.buildPayload({
      info: this.gameInfo(),
      pricePack: this.pricePack(),
      subscriptions: this.subscriptions(),
      news: this.steamNews(),
      reviewSummary: this.steamReviewSummary(),
      reviews: this.steamReviews(),
    })
  );

  heroBanner = computed<string | null>(() => {
    const assets = this.gameInfo()?.assets;
    if (!assets) return null;
    return assets.banner600 || assets.banner400 || assets.banner300 || assets.banner145 || assets.boxart || null;
  });

  boxartUrl = computed<string | null>(() => {
    const assets = this.gameInfo()?.assets;
    if (!assets) return null;
    return assets.boxart || assets.banner300 || assets.banner145 || null;
  });

  bestPriceDeal = computed<any | null>(() => {
    const prices = this.gamePrices();
    if (!prices.length) return null;
    return [...prices].sort((a, b) => (a.price?.amount ?? 0) - (b.price?.amount ?? 0))[0];
  });


  ngOnInit() {
    this.initChartOptions();
    this.route.paramMap.subscribe(params => {
      const uuid = params.get('uuid');
      if (uuid) {
        this.resetGameSignals();
        this.uuid.set(uuid);
        this.loadInfo(uuid);
      }
    });
  }

  resetGameSignals() {
    this.details.set(null);
    this.history.set([]);
    this.subscriptions.set([]);
    this.bundles.set([]);
    this.pricePack.set(null);
    this.steamReviews.set([]);
    this.steamReviewSummary.set(null);
    this.steamReviewType.set(SteamReviewType.All);
    this.steamReviewsOpened.set(false);
    this.steamNews.set([]);
    this.historyShops.set([]);
    this.selectedHistoryShop.set(null);
    this.chartData.set(null);
    this.error.set(null);
    this.revealed.set(new Set());
    this.settled.set(new Set());
    this.loading.set(true);
    this.loadingPrices.set(true);
    this.loadingHistory.set(true);
    this.loadingSubs.set(true);
    this.loadingBundles.set(true);
    this.loadingSteamReviews.set(false);
    this.loadingSteamNews.set(false);
  }

  reveal(section: 'prices' | 'subs' | 'bundles' | 'history' | 'reviews' | 'news') {
    const uuid = this.uuid();
    if (!uuid) return;
    if (this.settled().has(section) || this.isSectionBusy(section)) return;
    this.revealed.update(current => {
      if (current.has(section)) return current;
      const next = new Set(current);
      next.add(section);
      return next;
    });

    switch (section) {
      case 'prices':
        this.loadPrices(uuid);
        break;
      case 'subs':
        this.loadSubscriptions(uuid);
        break;
      case 'bundles':
        this.loadBundles(uuid);
        break;
      case 'history':
        this.loadHistory(uuid);
        break;
      case 'reviews':
        this.loadSteamReviews();
        break;
      case 'news':
        this.loadSteamNews();
        break;
    }
  }

  private isSectionBusy(section: 'prices' | 'subs' | 'bundles' | 'history' | 'reviews' | 'news') {
    if (!this.revealed().has(section)) return false;
    switch (section) {
      case 'prices':
        return this.loadingPrices();
      case 'subs':
        return this.loadingSubs();
      case 'bundles':
        return this.loadingBundles();
      case 'history':
        return this.loadingHistory();
      case 'reviews':
        return this.loadingSteamReviews();
      case 'news':
        return this.loadingSteamNews();
    }
  }

  private markSettled(section: string) {
    this.settled.update(current => {
      if (current.has(section)) return current;
      const next = new Set(current);
      next.add(section);
      return next;
    });
  }

  requestAiSummary() {
    for (const section of this.lazySections) {
      this.reveal(section);
    }
  }

  initChartOptions() {
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => this.chartOptions.set(this.buildChartOptions(mq.matches));
    apply();
    mq.addEventListener('change', apply);
    this.destroyRef.onDestroy(() => mq.removeEventListener('change', apply));
  }

  private compactChartMonth(label: string): string {
    const text = String(label).replace(/\./g, '').trim();
    const parts = text.split(/\s+/);
    return parts[parts.length - 1] || text;
  }

  private buildChartOptions(isMobile: boolean) {
    return {
      maintainAspectRatio: false,
      aspectRatio: 0.6,
      layout: {
        padding: { left: 0, right: isMobile ? 0 : 4, top: 4, bottom: 0 }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context: any) => {
              const val = context.parsed.y;
              return `Preço: ${this.formatPrice(val)}`;
            }
          }
        }
      },
      scales: {
        x: {
          offset: !isMobile,
          border: {
            display: false
          },
          ticks: {
            color: '#ffffff66',
            padding: isMobile ? 0 : 3,
            maxRotation: isMobile ? 0 : 45,
            minRotation: isMobile ? 0 : 45,
            autoSkip: true,
            maxTicksLimit: isMobile ? 5 : 10,
            font: { size: isMobile ? 10 : 11 },
            callback: (value: string | number) => {
              const label = String(value);
              if (!isMobile) return label;
              return this.compactChartMonth(label);
            }
          },
          grid: {
            color: '#ffffff11',
            drawBorder: false,
            offset: !isMobile
          }
        },
        y: {
          ticks: {
            display: !isMobile,
            color: '#ffffff66',
            padding: isMobile ? 0 : 3,
            callback: (value: any) => this.formatPrice(value)
          },
          border: {
            display: !isMobile
          },
          grid: {
            color: '#ffffff11',
            drawBorder: false,
            drawTicks: !isMobile
          },
          afterFit: isMobile
            ? (scale: { width: number }) => {
                scale.width = 0;
              }
            : undefined
        }
      }
    };
  }

  loadInfo(uuid: string) {
    this.loading.set(true);
    this.error.set(null);
    this.itadApi.getGameInfo(uuid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (info) => {
        if (this.uuid() !== uuid) return;
        if (!info || info.error) {
          this.error.set(info?.error || 'Erro ao carregar detalhes');
          this.loading.set(false);
          return;
        }
        this.details.set({
          info,
          prices: this.details()?.prices || [],
          history: []
        });
        if (this.revealed().has('news') && !this.settled().has('news') && !this.loadingSteamNews()) {
          this.loadSteamNews();
        }
        if (this.revealed().has('reviews') && !this.settled().has('reviews') && !this.loadingSteamReviews()) {
          this.loadSteamReviews();
        }
        this.loading.set(false);
      },
      error: () => {
        if (this.uuid() !== uuid) return;
        this.error.set('Falha na comunicação com o servidor');
        this.loading.set(false);
      }
    });
  }

  loadPrices(uuid: string) {
    this.loadingPrices.set(true);
    this.itadApi.getGamePricePack(uuid, APP_COUNTRY, DEFAULT_SHOP_IDS).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ pack, deals }) => {
        if (this.uuid() !== uuid) return;
        this.pricePack.set(pack);
        this.details.update(current => ({
          info: current?.info || null,
          prices: Array.isArray(deals) ? deals : [],
          history: current?.history || []
        }));
        this.loadingPrices.set(false);
        this.markSettled('prices');
      },
      error: () => {
        if (this.uuid() !== uuid) return;
        this.pricePack.set(null);
        this.details.update(current => ({
          info: current?.info || null,
          prices: current?.prices || [],
          history: current?.history || []
        }));
        this.loadingPrices.set(false);
      }
    });
  }

  loadSubscriptions(uuid: string) {
    this.loadingSubs.set(true);
    this.itadApi.getGameSubs(uuid, APP_COUNTRY).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        if (this.uuid() !== uuid) return;
        this.subscriptions.set(Array.isArray(data) ? data : []);
        this.loadingSubs.set(false);
        this.markSettled('subs');
      },
      error: () => {
        if (this.uuid() !== uuid) return;
        this.subscriptions.set([]);
        this.loadingSubs.set(false);
      }
    });
  }

  loadBundles(uuid: string) {
    this.loadingBundles.set(true);
    this.itadApi.getGameBundles(uuid, APP_COUNTRY).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        if (this.uuid() !== uuid) return;
        this.bundles.set(Array.isArray(data) ? data : []);
        this.loadingBundles.set(false);
        this.markSettled('bundles');
      },
      error: () => {
        if (this.uuid() !== uuid) return;
        this.bundles.set([]);
        this.loadingBundles.set(false);
      }
    });
  }

  loadHistory(uuid: string) {
    this.loadingHistory.set(true);
    this.itadApi.getHistory(uuid, APP_COUNTRY, DEFAULT_SHOP_IDS).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        if (this.uuid() !== uuid) return;
        const list = Array.isArray(data) ? data : [];
        this.history.set(list);
        this.processHistoryShops(list);
        this.loadingHistory.set(false);
        this.markSettled('history');
      },
      error: () => {
        if (this.uuid() !== uuid) return;
        this.loadingHistory.set(false);
        this.historyShops.set([]);
        this.selectedHistoryShop.set(null);
        this.chartData.set(null);
      }
    });
  }

  loadSteamNews() {
    const appId = this.steamAppId();
    if (!appId) {
      if (!this.gameInfo()) return;
      this.steamNews.set([]);
      this.loadingSteamNews.set(false);
      this.markSettled('news');
      return;
    }

    this.loadingSteamNews.set(true);
    this.itadApi.getSteamNews(appId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        if (this.steamAppId() !== appId) return;
        this.steamNews.set(Array.isArray(data) ? data : []);
        this.loadingSteamNews.set(false);
        this.markSettled('news');
      },
      error: () => {
        if (this.steamAppId() !== appId) return;
        this.steamNews.set([]);
        this.loadingSteamNews.set(false);
      }
    });
  }

  setSteamReviewType(type: SteamReviewTypeValue) {
    if (this.steamReviewType() === type) return;
    this.steamReviewType.set(type);
    this.settled.update(current => {
      if (!current.has('reviews')) return current;
      const next = new Set(current);
      next.delete('reviews');
      return next;
    });
    this.revealed.update(current => {
      if (current.has('reviews')) return current;
      const next = new Set(current);
      next.add('reviews');
      return next;
    });
    this.loadSteamReviews();
  }

  loadSteamReviews() {
    const appId = this.steamAppId();
    const reviewType = this.steamReviewType();
    if (!appId) {
      if (!this.gameInfo()) return;
      this.steamReviews.set([]);
      this.steamReviewSummary.set(null);
      this.loadingSteamReviews.set(false);
      this.markSettled('reviews');
      return;
    }

    this.steamReviewsOpened.set(true);
    this.loadingSteamReviews.set(true);
    this.itadApi.getSteamReviews(appId, reviewType).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        if (this.steamAppId() !== appId || this.steamReviewType() !== reviewType) return;
        this.steamReviewSummary.set(data?.query_summary || null);
        this.steamReviews.set(Array.isArray(data?.reviews) ? data.reviews : []);
        this.loadingSteamReviews.set(false);
        this.markSettled('reviews');
      },
      error: () => {
        if (this.steamAppId() !== appId || this.steamReviewType() !== reviewType) return;
        this.steamReviews.set([]);
        this.steamReviewSummary.set(null);
        this.loadingSteamReviews.set(false);
      }
    });
  }

  processHistoryShops(list: any[]) {
    if (!Array.isArray(list) || list.length === 0) {
      this.historyShops.set([]);
      this.selectedHistoryShop.set(null);
      this.chartData.set(null);
      return;
    }

    const matchedShops: HistoryShopItem[] = [];

    for (const config of ALLOWED_STORE_CONFIG) {
      const records = list.filter(item => {
        if (item.shopId && item.shopId === config.id) return true;
        const rawName = (item.shop || '').toLowerCase().trim();
        return config.matchTitles.includes(rawName) || rawName.includes(config.displayName.toLowerCase());
      });

      if (records.length > 0) {
        matchedShops.push({
          id: config.id,
          name: config.displayName,
          icon: config.icon,
          count: records.length
        });
      }
    }

    this.historyShops.set(matchedShops);

    if (matchedShops.length > 0) {
      const currentSelected = this.selectedHistoryShop();
      const stillValid = currentSelected && matchedShops.some(s => s.id === currentSelected);
      if (stillValid) {
        this.prepareChartForShop(currentSelected);
      } else {
        const steam = matchedShops.find(s => s.id === 61);
        const defaultShopId = steam ? steam.id : matchedShops[0].id;
        this.selectedHistoryShop.set(defaultShopId);
        this.prepareChartForShop(defaultShopId);
      }
    } else {
      this.selectedHistoryShop.set(null);
      this.chartData.set(null);
    }
  }

  selectHistoryShop(shopId: number | null) {
    if (shopId == null || this.selectedHistoryShop() === shopId) return;
    this.selectedHistoryShop.set(shopId);
    this.prepareChartForShop(shopId);
  }

  prepareChartForShop(shopId: number) {
    const list = this.history();
    const config = ALLOWED_STORE_CONFIG.find(c => c.id === shopId);
    if (!config || !Array.isArray(list) || list.length === 0) {
      this.chartData.set(null);
      return;
    }

    const filtered = list.filter(item => {
      if (item.shopId && item.shopId === shopId) return true;
      const rawName = (item.shop || '').toLowerCase().trim();
      return config.matchTitles.includes(rawName) || rawName.includes(config.displayName.toLowerCase());
    });

    const sorted = [...filtered]
      .filter(item => item && item.timestamp && !isNaN(new Date(item.timestamp).getTime()))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (sorted.length === 0) {
      this.chartData.set(null);
      return;
    }

    const slice = sorted.slice(-30);

    this.chartData.set({
      labels: slice.map(item => {
        const d = new Date(item.timestamp);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      }),
      datasets: [
        {
          label: `Preço (${config.displayName})`,
          data: slice.map(item => item.price),
          fill: true,
          borderColor: '#66C0F4',
          tension: 0.25,
          backgroundColor: 'rgba(102, 192, 244, 0.12)',
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#66C0F4'
        }
      ]
    });
  }

  async addToWaitlist() {
    const uuid = this.uuid();
    if (!uuid) return;

    this.adding.set(true);
    try {
      await this.waitlist.toggle(uuid);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao atualizar a waitlist' });
    } finally {
      this.adding.set(false);
    }
  }

  async toggleOwned() {
    const info = this.gameInfo();
    if (!info?.id) return;

    this.owning.set(true);
    try {
      const result = await this.owned.toggle({
        id: info.id,
        slug: info.slug,
        title: info.title,
        type: info.type,
        mature: info.mature,
        assets: info.assets,
      });
      if (result === 'added' && this.waitlist.isMonitored(info.id)) {
        await this.waitlist.remove(info.id).catch(() => undefined);
      }
      if (result === 'removed') {
        await this.restoreWaitlist.afterRemovedFromLibrary({
          id: info.id,
          slug: info.slug,
          title: info.title,
          type: info.type,
          mature: info.mature,
          assets: info.assets,
        });
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao atualizar os jogos comprados' });
    } finally {
      this.owning.set(false);
    }
  }

  formatPrice(amount: any, currency = 'BRL') {
    if (amount === undefined || amount === null) return '-';
    try {
      const val = typeof amount === 'object' && amount !== null ? (amount.amount ?? amount.price ?? 0) : Number(amount);
      if (isNaN(val)) return '-';
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(val);
    } catch {
      return `${currency || 'BRL'} ${amount}`;
    }
  }

  formatDate(dateStr: string | undefined | null) {
    if (!dateStr) return 'Não informada';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatDateTime(dateStr: string | undefined | null) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  formatNumber(val: number | undefined | null) {
    if (val === undefined || val === null) return '0';
    return new Intl.NumberFormat('pt-BR').format(val);
  }

  formatPlaytime(minutes: number | undefined | null): string {
    if (!minutes || minutes < 1) return 'Tempo de jogo indisponível';
    if (minutes < 60) return `${minutes} min de jogo`;
    const hours = Math.round(minutes / 60);
    return `${this.formatNumber(hours)} h de jogo`;
  }

  formatUnixDate(timestamp: number | undefined | null): string | null {
    if (!timestamp) return null;
    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatFlag(flag: string | null | undefined) {
    if (!flag) return null;
    const f = flag.toUpperCase();
    if (f === 'H') return 'Menor Preço Histórico';
    if (f === 'S') return 'Menor Preço na Loja';
    if (f === 'N') return 'Nova Oferta';
    return flag;
  }

  formatGameType(type: string | null | undefined): string {
    const value = (type || '').trim().toLowerCase();
    if (!value) return 'Não especificado';
    if (value === 'game') return 'Jogo';
    if (value === 'dlc' || value === 'expansion' || value === 'dlc_expansion') return 'DLC';
    if (value === 'package' || value === 'pack') return 'Pacote';
    if (value === 'bundle') return 'Bundle';
    if (value === 'mod') return 'Mod';
    if (value === 'music' || value === 'soundtrack') return 'Trilha sonora';
    return type!.trim();
  }

  formatCompanyNames(companies: any[] | undefined | null): string {
    if (!Array.isArray(companies) || companies.length === 0) return 'Não informado';
    const names = companies
      .map(company => (typeof company === 'string' ? company : company?.name))
      .map(name => (typeof name === 'string' ? name.trim() : ''))
      .filter(Boolean);
    return names.length > 0 ? names.join(', ') : 'Não informado';
  }

  formatYesNo(value: boolean | null | undefined): string {
    return value ? 'Sim' : 'Não';
  }
}
