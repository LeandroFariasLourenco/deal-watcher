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
}

export interface StoreItem {
  id: number;
  title: string;
  name: string;
  deals: number;
  games: number;
  update?: string;
  icon: string;
}

@Injectable({
  providedIn: 'root'
})
export class DealsStateService {
  deals = signal<DealItem[]>([]);
  allApiShops = signal<any[]>([]);
  shops = signal<StoreItem[]>([]);
  selectedShops = signal<number[]>([]);
  offset = signal<number>(0);
  loading = signal<boolean>(false);
  loadingShops = signal<boolean>(false);
  isInitialized = signal<boolean>(false);

  saveState(
    deals: DealItem[],
    allApiShops: any[],
    shops: StoreItem[],
    selectedShops: number[],
    offset: number
  ) {
    this.deals.set(deals);
    this.allApiShops.set(allApiShops);
    this.shops.set(shops);
    this.selectedShops.set(selectedShops);
    this.offset.set(offset);
    this.isInitialized.set(true);
  }

  clear() {
    this.deals.set([]);
    this.selectedShops.set([]);
    this.offset.set(0);
    this.isInitialized.set(false);
  }
}
