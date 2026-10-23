import { Injectable, signal, computed, inject } from '@angular/core';
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
  isDetailsPage = signal(false);
  private currentUrl = signal(this.router.url);
  isDealsList = computed(() => this.currentTab() === 'deals' && !this.isDetailsPage());
  useAppRail = computed(() => !this.isDealsList());
  isMainTabView = computed(() => this.tabFromUrl(this.currentUrl()) !== null);

  constructor() {
    this.updateContextFromUrl(this.router.url);
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        const from = this.viewKey(this.router.url);
        if (from) {
          this.scrolls.set(from, this.readScroll());
        }
      }

      if (event instanceof NavigationEnd) {
        const url = event.urlAfterRedirects || event.url || '';
        this.currentUrl.set(url);
        this.updateContextFromUrl(url);
        this.queuedTab = null;
        const to = this.viewKey(url);
        if (to && this.scrolls.has(to)) {
          const top = this.scrolls.get(to) ?? 0;
          this.writeScrollSoon(top);
        } else if (!to) {
          this.writeScrollSoon(0);
        }
      }
    });
  }

  private firstPath(url: string): string {
    return url.split('?')[0].split('#')[0].replace(/^\//, '').split('/')[0];
  }

  private tabFromUrl(url: string): MainTab | null {
    const path = this.firstPath(url);
    return CACHED_TABS.has(path as MainTab) ? path as MainTab : null;
  }

  private viewKey(url: string): string | null {
    const path = this.firstPath(url);
    if (!path || path === 'details' || path === 'auth') return null;
    return path;
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

  private writeScrollSoon(top: number) {
    requestAnimationFrame(() => {
      this.writeScroll(top);
      requestAnimationFrame(() => this.writeScroll(top));
    });
  }

  updateContextFromUrl(url: string) {
    const cleanUrl = url.split('?')[0];
    const queryParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    const fromParam = queryParams.get('from');

    this.isDetailsPage.set(cleanUrl.startsWith('/details'));

    if (cleanUrl.startsWith('/deals')) {
      this.currentTab.set('deals');
    } else if (cleanUrl.startsWith('/search')) {
      this.currentTab.set('search');
    } else if (cleanUrl.startsWith('/waitlist') || cleanUrl.startsWith('/owned')) {
      this.currentTab.set('waitlist');
    } else if (cleanUrl.startsWith('/giveaways')) {
      this.currentTab.set('giveaways');
    } else if (cleanUrl.startsWith('/details')) {
      const fromTab = fromParam === 'wishlist' || fromParam === 'owned' ? 'waitlist' : fromParam;
      if (fromTab && MAIN_TABS.includes(fromTab as MainTab)) {
        this.currentTab.set(fromTab as MainTab);
      }
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
