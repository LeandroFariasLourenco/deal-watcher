import { Injectable, signal, inject } from '@angular/core';
import { Router, NavigationEnd, NavigationStart } from '@angular/router';

export type MainTab = 'deals' | 'search' | 'waitlist' | 'giveaways';

export const MAIN_TABS: MainTab[] = ['deals', 'search', 'waitlist', 'giveaways'];

const CACHED_TABS = new Set<MainTab>(MAIN_TABS);

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  private router = inject(Router);
  private readonly scrolls = new Map<string, number>();
  private queuedTab: MainTab | null = null;

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
        this.queuedTab = null;
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
    const fromParam = queryParams.get('from');

    if (cleanUrl.startsWith('/deals')) {
      this.currentTab.set('deals');
    } else if (cleanUrl.startsWith('/search')) {
      this.currentTab.set('search');
    } else if (cleanUrl.startsWith('/waitlist')) {
      this.currentTab.set('waitlist');
    } else if (cleanUrl.startsWith('/giveaways')) {
      this.currentTab.set('giveaways');
    } else if (cleanUrl.startsWith('/details')) {
      const fromTab = fromParam === 'wishlist' ? 'waitlist' : fromParam;
      if (fromTab && MAIN_TABS.includes(fromTab)) {
        this.currentTab.set(fromTab);
      }
      // If no fromParam, keep currentTab as is!
    }
  }

  setTab(tab: MainTab) {
    this.currentTab.set(tab);
  }

  isOnMainTab(): boolean {
    return this.tabFromUrl(this.router.url) !== null;
  }

  cycleTab(step: number) {
    if (!step) return;
    const direction = step > 0 ? 1 : -1;
    const current = this.queuedTab ?? this.tabFromUrl(this.router.url) ?? this.currentTab();
    const index = Math.max(0, MAIN_TABS.indexOf(current));
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= MAIN_TABS.length) return;
    const next = MAIN_TABS[nextIndex];
    if (next === current) return;
    this.queuedTab = next;
    this.router.navigate([`/${next}`]);
  }

  goBack() {
    const targetTab = this.currentTab() || 'deals';
    this.router.navigate([`/${targetTab}`]);
  }

  getTabLabel(tab: MainTab): string {
    switch (tab) {
      case 'deals': return 'Ofertas';
      case 'search': return 'Pesquisa';
      case 'waitlist': return 'Waitlist';
      case 'giveaways': return 'Gratuitos';
    }
  }
}
