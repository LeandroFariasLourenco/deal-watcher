import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private platformId = inject(PLATFORM_ID);
  
  deferredPrompt = signal<BeforeInstallPromptEvent | null>(null);
  isInstalled = signal(false);
  isIOS = signal(false);
  isInstallable = signal(false);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.init();
    }
  }

  private init() {
    // Detect standalone mode
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;
    
    this.isInstalled.set(isStandalone);

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    this.isIOS.set(/iphone|ipad|ipod/.test(userAgent));

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt.set(e as BeforeInstallPromptEvent);
      this.isInstallable.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.isInstalled.set(true);
      this.isInstallable.set(false);
      this.deferredPrompt.set(null);
      void this.registerBackgroundNotifications();
    });

    void this.registerBackgroundNotifications();
  }

  private async registerBackgroundNotifications() {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      const periodicSync = (registration as ServiceWorkerRegistration & {
        periodicSync?: {
          register: (tag: string, options: { minInterval: number }) => Promise<void>;
        };
      }).periodicSync;

      if (!periodicSync) return;

      await periodicSync.register('sync-itad-notifications', {
        minInterval: 24 * 60 * 60 * 1000,
      });
    } catch (error) {
      console.warn('Periodic background sync indisponível', error);
    }
  }

  async install() {
    const prompt = this.deferredPrompt();
    if (!prompt) return;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    
    if (outcome === 'accepted') {
      this.deferredPrompt.set(null);
      this.isInstallable.set(false);
    }
  }
}
