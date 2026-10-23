import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, input, output, viewChild } from '@angular/core';
import { register as registerSwiper } from 'swiper/element/bundle';
import { MatIconModule } from '@angular/material/icon';
import { StoreLogo } from '../store-logo/store-logo';

registerSwiper();

export interface ChipTile {
  id: string;
  label: string;
  caption?: string;
  icon?: string;
  shopId?: number | null;
  shopName?: string | null;
  href?: string | null;
  active?: boolean;
  disabled?: boolean;
  spinning?: boolean;
}

interface ChipSwiperInstance {
  size: number;
  slidesGrid: number[];
  slidesSizesGrid: number[];
  minTranslate: () => number;
  maxTranslate: () => number;
  setTransition: (duration: number) => void;
  setTranslate: (translate: number) => void;
  updateActiveIndex: () => void;
  updateSlidesClasses: () => void;
}

@Component({
  selector: 'app-chip-swiper',
  standalone: true,
  imports: [MatIconModule, StoreLogo],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './chip-swiper.html',
  styleUrl: './chip-swiper.css',
})
export class ChipSwiper {
  items = input<ChipTile[]>([]);
  loading = input(false);
  skeletonCount = input(6);
  centerOnClick = input(false);

  select = output<ChipTile>();

  private swiperRef = viewChild<ElementRef<HTMLElement>>('chipSwiper');
  private lastSelectAt = 0;

  skeletons(): number[] {
    return Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i);
  }

  onSelect(item: ChipTile, event?: Event) {
    event?.stopPropagation();
    if (item.disabled) return;
    const now = Date.now();
    if (now - this.lastSelectAt < 250) return;
    this.lastSelectAt = now;
    if (this.centerOnClick()) {
      const index = this.items().findIndex(tile => tile.id === item.id);
      if (index >= 0) this.centerSlide(index);
    }
    this.select.emit(item);
  }

  private centerSlide(index: number) {
    const swiper = (this.swiperRef()?.nativeElement as HTMLElement & { swiper?: ChipSwiperInstance } | undefined)?.swiper;
    if (!swiper) return;

    const offset = swiper.slidesGrid[index];
    const slideSize = swiper.slidesSizesGrid[index];
    if (offset == null || slideSize == null) return;

    const target = -offset + (swiper.size - slideSize) / 2;
    const min = swiper.minTranslate();
    const max = swiper.maxTranslate();
    const translate = Math.max(max, Math.min(min, target));

    swiper.setTransition(420);
    swiper.setTranslate(translate);
    swiper.updateActiveIndex();
    swiper.updateSlidesClasses();
  }
}
