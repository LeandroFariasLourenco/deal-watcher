import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PwaService } from './pwa';
import { NavigationService } from './services/navigation';
import { ItadNotificationsService } from './services/itad-notifications';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, MatIconModule],
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
      const isDeals = this.nav.currentTab() === 'deals';
      document.body.classList.toggle('is-deals-tab', isDeals);
    });

    afterNextRender(() => {
      const tabs = this.host.nativeElement.querySelector('footer .app-rail');
      tabs?.addEventListener('wheel', this.onTabsWheel, { passive: false });
      this.destroyRef.onDestroy(() => {
        tabs?.removeEventListener('wheel', this.onTabsWheel);
      });
    });
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
