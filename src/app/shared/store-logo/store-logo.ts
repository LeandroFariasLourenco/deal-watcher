import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { storeLogoUrl } from '../constants';
import { ImgShimmerDirective } from '../img-shimmer';

@Component({
  selector: 'app-store-logo',
  standalone: true,
  imports: [MatIconModule, ImgShimmerDirective],
  template: `
    @if (src()) {
      <img
        class="store-logo"
        [src]="src()"
        [alt]="label()"
        [style.width.px]="size()"
        [style.height.px]="size()"
      />
    } @else {
      <mat-icon class="store-logo-fallback" [style.font-size.px]="size()" [style.width.px]="size()" [style.height.px]="size()">storefront</mat-icon>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      line-height: 0;
    }
    .store-logo {
      display: block;
      object-fit: contain;
      border-radius: 0.2rem;
    }
    .store-logo-fallback {
      color: currentColor;
    }
  `
})
export class StoreLogo {
  shopId = input<number | null | undefined>(null);
  shopName = input<string | null | undefined>(null);
  size = input(20);

  src = computed(() => storeLogoUrl(this.shopId(), this.shopName()));
  label = computed(() => this.shopName() || 'Loja');
}
