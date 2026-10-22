import { ApplicationConfig, inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { TabRouteReuseStrategy } from './routing/tab-route-reuse.strategy';
import { ItadAuthService } from './services/itad-auth';
import { WaitlistService } from './services/waitlist';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    { provide: APP_BASE_HREF, useValue: import.meta.env.BASE_URL },
    provideRouter(routes),
    { provide: RouteReuseStrategy, useClass: TabRouteReuseStrategy },
    provideHttpClient(),
    provideAppInitializer(() => {
      const auth = inject(ItadAuthService);
      const waitlist = inject(WaitlistService);
      return auth.restore().then(() => {
        if (auth.isLoggedIn()) {
          return waitlist.refresh().catch(() => undefined);
        }
      });
    })
  ]
};
