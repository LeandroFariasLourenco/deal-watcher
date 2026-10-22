import { Component, signal, computed, OnInit, inject, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { MatIconModule } from '@angular/material/icon';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { animate, stagger } from 'motion';
import { GamePriceCard } from '../../shared/game-price-card/game-price-card';

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

import { DealItem, DealsStateService } from '../../services/deals-state';
import { ItadApiService } from '../../services/itad-api';

@Component({
  selector: 'app-deals',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule, SkeletonModule, MatIconModule, ToastModule, GamePriceCard],
  providers: [MessageService],
  templateUrl: './deals.html',
  styleUrl: './deals.css'
})
export class Deals implements OnInit {
  private itadApi = inject(ItadApiService);
  private dealsState = inject(DealsStateService);
  private el = inject(ElementRef);
  
  deals = signal<DealItem[]>([]);
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
    this.itadApi.getShops('BR').subscribe({
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
    this.itadApi.getDeals('BR', this.offset(), this.limit, shops, 'rank').subscribe({
      next: (data) => {
        const rawList = Array.isArray(data?.list) ? data.list : (Array.isArray(data) ? data : []);
        const newDeals: DealItem[] = rawList.map((item: any) => ({
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

}

