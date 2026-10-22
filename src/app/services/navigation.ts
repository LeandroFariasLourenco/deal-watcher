import { Injectable, signal, inject } from '@angular/core';
import { Router, NavigationEnd, NavigationStart } from '@angular/router';

export type MainTab = 'deals' | 'search' | 'wishlist' | 'giveaways';

const CACHED_TABS = new Set<MainTab>(['deals', 'search', 'wishlist', 'giveaways']);

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  private router = inject(Router);
  private readonly scrolls = new Map<string, number>();

  currentTab = signal<MainTab>('deals');

  constructor() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        const from = this.tabFromUrl(this.router.url);
        if (from) {
          this.scrolls.set(from, this.readScroll());
        }
      }

      if (event instanceof NavigationEnd) {
        const url = event.urlAfterRedirects || event.url || '';
        this.updateContextFromUrl(url);
        const to = this.tabFromUrl(url);
        if (to && this.scrolls.has(to)) {
          const top = this.scrolls.get(to) ?? 0;
          requestAnimationFrame(() => this.writeScroll(top));
        } else if (!to) {
          requestAnimationFrame(() => this.writeScroll(0));
        }
      }
    });
  }

  private tabFromUrl(url: string): MainTab | null {
    const path = url.split('?')[0].split('#')[0].replace(/^\//, '').split('/')[0];
    return CACHED_TABS.has(path as MainTab) ? path as MainTab : null;
  }

  private scrollContainer(): HTMLElement | null {
    return document.querySelector('main.app-rail, main');
  }

  private readScroll(): number {
    return this.scrollContainer()?.scrollTop ?? 0;
  }

  private writeScroll(top: number) {
    const container = this.scrollContainer();
    if (container) {
      container.scrollTop = top;
    }
  }

  updateContextFromUrl(url: string) {
    const cleanUrl = url.split('?')[0];
    const queryParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    const fromParam = queryParams.get('from') as MainTab | null;

    if (cleanUrl.startsWith('/deals')) {
      this.currentTab.set('deals');
    } else if (cleanUrl.startsWith('/search')) {
      this.currentTab.set('search');
    } else if (cleanUrl.startsWith('/wishlist')) {
      this.currentTab.set('wishlist');
    } else if (cleanUrl.startsWith('/giveaways')) {
      this.currentTab.set('giveaways');
    } else if (cleanUrl.startsWith('/details')) {
      if (fromParam && ['deals', 'search', 'wishlist', 'giveaways'].includes(fromParam)) {
        this.currentTab.set(fromParam);
      }
      // If no fromParam, keep currentTab as is!
    }
  }

  setTab(tab: MainTab) {
    this.currentTab.set(tab);
  }

  goBack() {
    const targetTab = this.currentTab() || 'deals';
    this.router.navigate([`/${targetTab}`]);
  }

  getTabLabel(tab: MainTab): string {
    switch (tab) {
      case 'deals': return 'Ofertas';
      case 'search': return 'Pesquisa';
      case 'wishlist': return 'Monitoramento';
      case 'giveaways': return 'Gratuitos';
    }
  }
}
