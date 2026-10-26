import { Component, computed, input, output, viewChild } from '@angular/core';
import { ChipSwiper, ChipTile } from '../chip-swiper/chip-swiper';

export interface ShopSwiperItem {
  id: number;
  name: string;
  caption?: string;
}

@Component({
  selector: 'app-shop-swiper',
  standalone: true,
  imports: [ChipSwiper],
  templateUrl: './shop-swiper.html',
  styleUrl: './shop-swiper.css',
})
export class ShopSwiper {
  shops = input<ShopSwiperItem[]>([]);
  selectedId = input<number | null>(null);
  showAll = input(false);
  allLabel = input('Todas');
  allCaption = input('');
  allIcon = input('apps');
  loading = input(false);
  skeletonCount = input(8);
  busy = input(false);

  select = output<number | null>();

  private readonly chips = viewChild(ChipSwiper);

  tiles = computed<ChipTile[]>(() => {
    const selected = this.selectedId();
    const busy = this.busy();
    const tiles: ChipTile[] = [];

    if (this.showAll()) {
      tiles.push({
        id: 'all',
        label: this.allLabel(),
        caption: this.allCaption() || undefined,
        icon: this.allIcon(),
        active: selected == null,
        disabled: busy && selected != null,
      });
    }

    for (const shop of this.shops()) {
      const active = selected === shop.id;
      tiles.push({
        id: String(shop.id),
        label: shop.name,
        caption: shop.caption,
        shopId: shop.id,
        shopName: shop.name,
        active,
        disabled: busy && !active,
      });
    }

    return tiles;
  });

  onSelect(item: ChipTile) {
    this.select.emit(item.id === 'all' ? null : Number(item.id));
  }

  capturePosition(): number {
    return this.chips()?.capturePosition() ?? 0;
  }

  restorePosition(translate: number) {
    this.chips()?.restorePosition(translate);
  }
}
