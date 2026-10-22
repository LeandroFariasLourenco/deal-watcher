import { Component, signal, computed, OnInit, inject } from '@angular/core';
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
import { DEFAULT_SHOP_IDS, ALLOWED_STORE_CONFIG } from '../../shared/constants';
import { WaitlistService } from '../../services/waitlist';
import { TimeService } from '../../services/time';

export interface HistoryShopItem {
  id: number;
  name: string;
  icon: string;
  count: number;
}

import { NavigationService } from '../../services/navigation';

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
    MatIconModule
  ],
  providers: [MessageService],
  templateUrl: './details.html',
  styleUrl: './details.css'
})
export class Details implements OnInit {
  private itadApi = inject(ItadApiService);
  private route = inject(ActivatedRoute);
  private messageService = inject(MessageService);
  public waitlist = inject(WaitlistService);
  public timeService = inject(TimeService);
  public nav = inject(NavigationService);

  uuid = signal<string | null>(null);
  details = signal<any>(null);
  history = signal<any[]>([]);
  loading = signal(true);
  loadingHistory = signal(true);
  adding = signal(false);
  isAlreadyInWishlist = computed(() => this.waitlist.isMonitored(this.uuid()));
  error = signal<string | null>(null);

  historyShops = signal<HistoryShopItem[]>([]);
  selectedHistoryShop = signal<number | null>(null);
  selectedHistoryShopName = computed(() => {
    const shopId = this.selectedHistoryShop();
    if (!shopId) return null;
    const found = this.historyShops().find(s => s.id === shopId);
    return found ? found.name : null;
  });

  chartData = signal<any>(null);
  chartOptions = signal<any>({
    maintainAspectRatio: false,
    aspectRatio: 0.6,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const val = context.raw;
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
          }
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        ticks: {
          color: 'rgba(255, 255, 255, 0.6)',
          font: { size: 11 },
          callback: (value: any) => `R$ ${value}`
        }
      }
    }
  });

  gameInfo = computed(() => this.details()?.info || null);
  gamePrices = computed<any[]>(() => this.details()?.prices || []);
  gameTags = computed<string[]>(() => this.gameInfo()?.tags || []);
  gameDevelopers = computed<any[]>(() => this.gameInfo()?.developers || []);
  gamePublishers = computed<any[]>(() => this.gameInfo()?.publishers || []);
  gameReviews = computed<any[]>(() => this.gameInfo()?.reviews || []);
  gameStats = computed(() => this.gameInfo()?.stats || null);
  gamePlayers = computed(() => this.gameInfo()?.players || null);

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
        this.loadDetails(uuid);
        this.loadHistory(uuid);
      }
    });
  }

  resetGameSignals() {
    this.details.set(null);
    this.history.set([]);
    this.historyShops.set([]);
    this.selectedHistoryShop.set(null);
    this.chartData.set(null);
    this.error.set(null);
  }

  initChartOptions() {
    this.chartOptions.set({
      maintainAspectRatio: false,
      aspectRatio: 0.6,
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
          ticks: {
            color: '#ffffff66',
            maxRotation: 45,
            minRotation: 45
          },
          grid: {
            color: '#ffffff11',
            drawBorder: false
          }
        },
        y: {
          ticks: {
            color: '#ffffff66',
            callback: (value: any) => this.formatPrice(value)
          },
          grid: {
            color: '#ffffff11',
            drawBorder: false
          }
        }
      }
    });
  }

  loadDetails(uuid: string) {
    this.loading.set(true);
    this.error.set(null);
    this.itadApi.getGameDetails(uuid, 'BR', DEFAULT_SHOP_IDS).subscribe({
      next: (data) => {
        if (!data || data.error) {
          this.error.set(data?.error || 'Erro ao carregar detalhes');
          this.loading.set(false);
          return;
        }
        this.details.set(data);
        if (Array.isArray(data?.history) && data.history.length > 0 && this.history().length === 0) {
          this.history.set(data.history);
          this.processHistoryShops(data.history);
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Falha na comunicação com o servidor');
        this.loading.set(false);
      }
    });
  }

  loadHistory(uuid: string) {
    this.loadingHistory.set(true);
    this.itadApi.getHistory(uuid, 'BR', DEFAULT_SHOP_IDS).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : [];
        this.history.set(list);
        this.processHistoryShops(list);
        this.loadingHistory.set(false);
      },
      error: () => {
        this.loadingHistory.set(false);
        this.historyShops.set([]);
        this.selectedHistoryShop.set(null);
        this.chartData.set(null);
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

  selectHistoryShop(shopId: number) {
    if (this.selectedHistoryShop() === shopId) return; // Always keep one selected
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

  async addToWishlist() {
    const uuid = this.uuid();
    if (!uuid) return;

    this.adding.set(true);
    try {
      const result = await this.waitlist.toggle(uuid);
      if (result === 'login') return;
      this.messageService.add({
        severity: 'success',
        summary: 'Waitlist ITAD',
        detail: result === 'removed' ? 'Removido da waitlist' : 'Adicionado à waitlist'
      });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao atualizar a waitlist' });
    } finally {
      this.adding.set(false);
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

  formatFlag(flag: string | null | undefined) {
    if (!flag) return null;
    const f = flag.toUpperCase();
    if (f === 'H') return 'Menor Preço Histórico';
    if (f === 'S') return 'Menor Preço na Loja';
    if (f === 'N') return 'Nova Oferta';
    return flag;
  }

  getPlatformNames(platforms: any[] | undefined | null): string[] {
    if (!Array.isArray(platforms)) return [];
    return platforms.map(p => (typeof p === 'string' ? p : p?.name)).filter(Boolean);
  }

  getDrmNames(drm: any[] | undefined | null): string[] {
    if (!Array.isArray(drm) || drm.length === 0) return ['Sem DRM'];
    return drm.map(d => (typeof d === 'string' ? d : d?.name || 'DRM')).filter(Boolean);
  }
}
