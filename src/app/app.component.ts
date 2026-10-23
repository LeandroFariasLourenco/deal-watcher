import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, signal, Type } from '@angular/core';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PwaService } from './pwa';
import { MAIN_TABS, MainTab, NavigationService } from './services/navigation';
import { ItadNotificationsService } from './services/itad-notifications';
import { Deals } from './features/deals/deals';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, NgComponentOutlet, MatIconModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Vigia de Ofertas';
  pwa = inject(PwaService);
  nav = inject(NavigationService);
  notifications = inject(ItadNotificationsService);
  showIOSGuide = signal(false);
  readonly tabs = MAIN_TABS;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private wheelDelta = 0;
  private wheelLockUntil = 0;
  private readonly wheelThreshold = 80;
  private readonly wheelStepMs = 90;
  private readonly loadingTabs = new Set<MainTab>();

  tabViews = signal<Partial<Record<MainTab, Type<unknown>>>>({
    deals: Deals,
  });

  constructor() {
    effect(() => {
      document.body.classList.toggle('is-deals-tab', this.nav.isDealsList());
    });

    effect(() => {
      void this.ensureTab(this.nav.currentTab());
    });

    afterNextRender(() => {
      const tabs = this.host.nativeElement.querySelector('footer .app-rail');
      tabs?.addEventListener('wheel', this.onTabsWheel, { passive: false });
      this.destroyRef.onDestroy(() => {
        tabs?.removeEventListener('wheel', this.onTabsWheel);
      });
    });
  }

  isTabActive(tab: MainTab): boolean {
    return this.nav.currentTab() === tab;
  }

  private async ensureTab(tab: MainTab) {
    if (this.tabViews()[tab] || this.loadingTabs.has(tab)) return;
    this.loadingTabs.add(tab);
    const component = await this.loadTab(tab);
    this.tabViews.update(current => ({ ...current, [tab]: component }));
    this.loadingTabs.delete(tab);
  }

  private loadTab(tab: MainTab): Promise<Type<unknown>> {
    switch (tab) {
      case 'deals':
        return Promise.resolve(Deals);
      case 'search':
        return import('./features/search/search').then(m => m.Search);
      case 'waitlist':
        return import('./features/waitlist/waitlist').then(m => m.Waitlist);
      case 'giveaways':
        return import('./features/giveaways/giveaways').then(m => m.Giveaways);
    }
  }

  private readonly onTabsWheel = (event: WheelEvent) => {
    if (this.showIOSGuide()) return;
    event.preventDefault();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    this.consumeWheel(delta);
  };

  private consumeWheel(delta: number) {
    const now = Date.now();
    if (now < this.wheelLockUntil) return;

    if (this.wheelDelta && Math.sign(this.wheelDelta) !== Math.sign(delta)) {
      this.wheelDelta = 0;
    }
    this.wheelDelta += delta;
    if (Math.abs(this.wheelDelta) < this.wheelThreshold) return;

    const direction = Math.sign(this.wheelDelta);
    this.wheelDelta = 0;
    this.wheelLockUntil = now + this.wheelStepMs;
    this.nav.cycleTab(direction);
  }
}
