import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PwaService } from './pwa';
import { NavigationService } from './services/navigation';
import { ItadNotificationsService } from './services/itad-notifications';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, MatIconModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Vigia de Ofertas';
  pwa = inject(PwaService);
  nav = inject(NavigationService);
  notifications = inject(ItadNotificationsService);
  showIOSGuide = signal(false);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private wheelDelta = 0;
  private wheelLockUntil = 0;
  private readonly wheelThreshold = 80;
  private readonly wheelStepMs = 90;

  constructor() {
    effect(() => {
      document.body.classList.toggle('is-deals-tab', this.nav.isDealsList());
    });

    afterNextRender(() => {
      const tabs = this.host.nativeElement.querySelector('footer .app-rail');
      tabs?.addEventListener('wheel', this.onTabsWheel, { passive: false });
      this.destroyRef.onDestroy(() => {
        tabs?.removeEventListener('wheel', this.onTabsWheel);
      });
    });
  }

  onRouteActivate() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    requestAnimationFrame(() => this.replayRouteEnter());
  }

  private replayRouteEnter() {
    const main = this.host.nativeElement.querySelector('main.app-content') as HTMLElement | null;
    if (!main) return;
    const page = Array.from(main.children).find(el => {
      const tag = el.tagName.toLowerCase();
      return tag !== 'router-outlet' && !el.classList.contains('app-disclaimer');
    }) as HTMLElement | undefined;
    if (!page) return;
    page.classList.remove('app-route-enter');
    void page.offsetWidth;
    page.classList.add('app-route-enter');
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
