import { Injectable, signal, OnDestroy } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TimeService implements OnDestroy {
  currentTime = signal(Date.now());
  private intervalId: any;

  constructor() {
    this.intervalId = setInterval(() => {
      this.currentTime.set(Date.now());
    }, 1000);
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  getCountdown(expiry: string | null | undefined): string | null {
    if (!expiry) return null;
    
    const expiryTime = new Date(expiry).getTime();
    const now = this.currentTime();
    const diff = expiryTime - now;

    if (diff <= 0) return 'Expirado';

    const hours = diff / (1000 * 60 * 60);
    
    if (hours > 72) {
      const days = Math.floor(hours / 24);
      return `${days} ${days === 1 ? 'dia' : 'dias'}`;
    }

    const h = Math.floor(hours);
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
