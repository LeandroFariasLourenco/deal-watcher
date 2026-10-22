import { Component, signal, OnInit, inject, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ItadApiService } from '../../services/itad-api';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { MatIconModule } from '@angular/material/icon';
import { animate, stagger } from 'motion';

interface Giveaway {
  id: number;
  title: string;
  url?: string;
  store: { id: number; name: string };
  type: string;
  games: { id: string; title: string; type?: string; assets: { banner300?: string; banner400?: string; boxart?: string } }[];
  start: string;
  expiry: string;
}

@Component({
  selector: 'app-giveaways',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule, SkeletonModule, TagModule, RouterLink, MatIconModule],
  templateUrl: './giveaways.html',
  styleUrl: './giveaways.css'
})
export class Giveaways implements OnInit {
  private itadApi = inject(ItadApiService);
  private el = inject(ElementRef);
  
  giveaways = signal<Giveaway[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  error = signal<string | null>(null);
  offset = signal(0);
  limit = 20;

  ngOnInit() {
    this.initGiveaways();
  }

  initGiveaways() {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    try {
      const cachedStr = localStorage.getItem('giveaways_cache_v1');
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (
          cached && 
          typeof cached.timestamp === 'number' && 
          (Date.now() - cached.timestamp < ONE_DAY_MS) && 
          Array.isArray(cached.data) && 
          cached.data.length > 0
        ) {
          this.giveaways.set(cached.data);
          this.offset.set(cached.offset || 0);
          this.loading.set(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Error reading giveaways cache from localStorage', e);
    }

    this.loadGiveaways(false);
  }

  triggerCascadeAnimation(startIndex: number = 0) {
    setTimeout(() => {
      const allItems = this.el.nativeElement.querySelectorAll('.cascade-item');
      if (!allItems || allItems.length === 0) return;
      const targetItems = Array.from(allItems).slice(startIndex);
      if (targetItems.length > 0) {
        animate(
          targetItems,
          { opacity: [0, 1], y: [16, 0] },
          { delay: stagger(0.04), duration: 0.42, ease: 'easeOut' }
        );
      }
    }, 40);
  }

  loadGiveaways(append = false) {
    if (append) {
      this.loadingMore.set(true);
    } else {
      this.loading.set(true);
    }
    this.error.set(null);
    const startIndex = append ? this.giveaways().length : 0;
    this.itadApi.getGiveaways(this.offset(), this.limit).subscribe({
      next: (data) => {
        const rawList = Array.isArray(data) ? data : (Array.isArray(data?.list) ? data.list : []);
        const newGiveaways: Giveaway[] = rawList.map((item: any) => ({
          ...item,
          store: item.shop || item.store || { id: 0, name: 'Grátis' },
          games: Array.isArray(item.games) ? item.games : []
        }));
        if (append) {
          this.giveaways.update(current => [...current, ...newGiveaways]);
          try {
            localStorage.setItem('giveaways_cache_v1', JSON.stringify({
              timestamp: Date.now(),
              offset: this.offset(),
              data: this.giveaways()
            }));
          } catch (e) {
            console.warn('Error updating giveaways cache in localStorage', e);
          }
        } else {
          this.giveaways.set(newGiveaways);
          try {
            localStorage.setItem('giveaways_cache_v1', JSON.stringify({
              timestamp: Date.now(),
              offset: this.offset(),
              data: newGiveaways
            }));
          } catch (e) {
            console.warn('Error saving giveaways cache to localStorage', e);
          }
        }
        this.loading.set(false);
        this.loadingMore.set(false);
        this.triggerCascadeAnimation(startIndex);
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
        if (!append && this.giveaways().length === 0) {
          this.error.set('Não foi possível carregar os jogos gratuitos.');
        }
      }
    });
  }

  formatExpiry(expiryStr: string | null | undefined): string {
    if (!expiryStr) return 'Grátis';
    try {
      const d = new Date(expiryStr);
      if (isNaN(d.getTime())) return 'Grátis';
      return `Até ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
    } catch {
      return 'Grátis';
    }
  }

  loadMore() {
    this.offset.update(v => v + this.limit);
    this.loadGiveaways(true);
  }

  getGameBanner(giveaway: Giveaway): string | null {
    const assets = giveaway.games?.[0]?.assets;
    return assets?.banner400 || assets?.banner300 || assets?.boxart || null;
  }
}
