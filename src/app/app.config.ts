import { ApplicationConfig, inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { DialogService } from 'primeng/dynamicdialog';
import { routes } from './app.routes';
import { TabRouteReuseStrategy } from './routing/tab-route-reuse.strategy';
import { ItadAuthService } from './services/itad-auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideAnimations(),
    DialogService,
    { provide: APP_BASE_HREF, useValue: import.meta.env.BASE_URL },
    provideRouter(routes),
    { provide: RouteReuseStrategy, useClass: TabRouteReuseStrategy },
    provideHttpClient(),
    provideAppInitializer(() => inject(ItadAuthService).restore())
  ]
};
