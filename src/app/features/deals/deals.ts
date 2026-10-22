import { Component, signal, computed, OnInit, inject, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { MatIconModule } from '@angular/material/icon';
import { TimeService } from '../../services/time';
import { StorageService } from '../../services/storage';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { animate, stagger } from 'motion';

interface Deal {
  id: string;
  title: string;
  shop: { id: number; name: string };
  price: { amount: number; currency: string };
  regular: { amount: number; currency: string };
  cut: number;
  assets: { banner300?: string };
  expiry?: string;
}

interface ShopItem {
  id: number;
  title: string;
  name: string;
  deals: number;
  games: number;
  update?: string;
  icon: string;
}

import { DEFAULT_SHOP_IDS, ALLOWED_STORE_CONFIG } from '../../shared/constants';

import { DealsStateService } from '../../services/deals-state';

@Component({
  selector: 'app-deals',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule, SkeletonModule, RouterLink, MatIconModule, ToastModule],
  providers: [MessageService],
  templateUrl: './deals.html',
  styleUrl: './deals.css'
})
export class Deals implements OnInit {
  private http = inject(HttpClient);
  public timeService = inject(TimeService);
  public storage = inject(StorageService);
  private messageService = inject(MessageService);
  private dealsState = inject(DealsStateService);
  private el = inject(ElementRef);
  
  deals = signal<Deal[]>([]);
  allApiShops = signal<any[]>([]);
  shops = signal<ShopItem[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  loadingShops = signal(true);
  selectedShops = signal<number[]>([]);
  offset = signal(0);
  limit = 20;

  activeShopIds = computed<number[]>(() => {
    const selected = this.selectedShops();
    if (selected.length > 0) {
      return selected;
    }
    const loadedShopIds = this.shops().map(shop => shop.id);
    if (loadedShopIds.length > 0) {
      return loadedShopIds;
    }
    return DEFAULT_SHOP_IDS;
  });

  ngOnInit() {
    if (this.dealsState.isInitialized() && this.dealsState.deals().length > 0) {
      this.deals.set(this.dealsState.deals());
      this.allApiShops.set(this.dealsState.allApiShops());
      this.shops.set(this.dealsState.shops());
      this.selectedShops.set(this.dealsState.selectedShops());
      this.offset.set(this.dealsState.offset());
      this.loading.set(false);
      this.loadingShops.set(false);
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

  private syncState() {
    this.dealsState.saveState(
      this.deals(),
      this.allApiShops(),
      this.shops(),
      this.selectedShops(),
      this.offset()
    );
  }

  loadShops() {
    this.loadingShops.set(true);
    this.http.get<any[]>('/api/proxy/itad/shops?country=BR').subscribe({
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
              name: config.displayName,
              deals: matched.deals ?? 0,
              games: matched.games ?? 0,
              icon: config.icon
            });
          }
        }

        this.shops.set(filteredShops);
        this.loadingShops.set(false);
        this.loadDeals();
      },
      error: () => {
        this.loadingShops.set(false);
        this.loadDeals();
      }
    });
  }

  loadDeals(append = false) {
    const shops: number[] = this.activeShopIds();
    if (shops.length === 0) {
      this.loading.set(false);
      this.loadingMore.set(false);
      return;
    }

    if (append) {
      this.loadingMore.set(true);
    } else {
      this.loading.set(true);
    }

    const startIndex = append ? this.deals().length : 0;
    const shopsParam = shops.join(',');
    this.http.get<any>(`/api/proxy/itad/deals?country=BR&offset=${this.offset()}&limit=${this.limit}&shops=${shopsParam}&sort=rank`).subscribe({
      next: (data) => {
        const rawList = Array.isArray(data?.list) ? data.list : (Array.isArray(data) ? data : []);
        const newDeals: Deal[] = rawList.map((item: any) => ({
          id: item.id,
          title: item.title,
          shop: item.deal?.shop || item.shop || { id: 0, name: 'Loja Oficial' },
          price: item.deal?.price || item.price || { amount: 0, currency: 'BRL' },
          regular: item.deal?.regular || item.regular || { amount: 0, currency: 'BRL' },
          cut: item.deal?.cut ?? item.cut ?? 0,
          assets: item.assets || {},
          expiry: item.deal?.expiry || item.expiry
        }));
        if (append) {
          this.deals.update(current => [...current, ...newDeals]);
        } else {
          this.deals.set(newDeals);
        }
        this.syncState();
        this.loading.set(false);
        this.loadingMore.set(false);
        this.triggerCascadeAnimation(startIndex);
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
      }
    });
  }

  toggleShop(shopId: number) {
    this.selectedShops.update(current => {
      if (current.includes(shopId)) {
        return current.filter(id => id !== shopId);
      } else {
        return [...current, shopId];
      }
    });
    this.offset.set(0);
    this.syncState();
    this.loadDeals();
  }

  clearShops() {
    if (this.selectedShops().length === 0) return;
    this.selectedShops.set([]);
    this.offset.set(0);
    this.syncState();
    this.loadDeals();
  }

  isShopSelected(shopId: number): boolean {
    return this.selectedShops().includes(shopId);
  }

  loadMore() {
    this.offset.update(v => v + this.limit);
    this.loadDeals(true);
  }

  formatPrice(amount: any) {
    if (amount === undefined || amount === null) return '-';
    try {
      const val = typeof amount === 'object' && amount !== null ? (amount.amount ?? amount.price ?? 0) : Number(amount);
      if (isNaN(val)) return '-';
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    } catch {
      return `R$ ${amount}`;
    }
  }

  async addToWatchlist(deal: Deal, event: Event) {
    event.stopPropagation();
    const game = {
      itad_uuid: deal.id,
      title: deal.title,
      banner: deal.assets?.banner300 || null
    };

    try {
      const isMonitored = await this.storage.isGameMonitored(deal.id);
      if (isMonitored) {
        this.messageService.add({ severity: 'info', summary: 'Info', detail: 'Jogo já está na lista' });
        return;
      }
      await this.storage.addGame(game);
      this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: 'Adicionado à lista' });
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Erro ao salvar' });
    }
  }
}

