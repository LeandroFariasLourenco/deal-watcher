import { Injectable, signal } from '@angular/core';

export interface DealItem {
  id: string;
  title: string;
  type?: string;
  shop: { id: number; name: string };
  price: { amount: number; currency: string };
  regular: { amount: number; currency: string };
  cut: number;
  assets: { banner300?: string };
  expiry?: string;
  historyLow?: { amount: number; currency: string } | null;
}

export interface StoreItem {
  id: number;
  title: string;
  name: string;
  deals: number;
  games: number;
  update?: string;
  icon: string;
  logo?: string;
}

export interface DealFeedState {
  items: DealItem[];
  offset: number;
}

@Injectable({
  providedIn: 'root'
})
export class DealsStateService {
  featured = signal<DealFeedState>({ items: [], offset: 0 });
  rated = signal<DealFeedState>({ items: [], offset: 0 });
  played = signal<DealFeedState>({ items: [], offset: 0 });
  allApiShops = signal<any[]>([]);
  shops = signal<StoreItem[]>([]);
  selectedShops = signal<number[]>([]);
  loading = signal<boolean>(false);
  loadingShops = signal<boolean>(false);
  isInitialized = signal<boolean>(false);

  saveState(
    featured: DealFeedState,
    rated: DealFeedState,
    played: DealFeedState,
    allApiShops: any[],
    shops: StoreItem[],
    selectedShops: number[]
  ) {
    this.featured.set(featured);
    this.rated.set(rated);
    this.played.set(played);
    this.allApiShops.set(allApiShops);
    this.shops.set(shops);
    this.selectedShops.set(selectedShops);
    this.isInitialized.set(true);
  }

  clear() {
    this.featured.set({ items: [], offset: 0 });
    this.rated.set({ items: [], offset: 0 });
    this.played.set({ items: [], offset: 0 });
    this.selectedShops.set([]);
    this.isInitialized.set(false);
  }
}
