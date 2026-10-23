import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'deals',
    pathMatch: 'full'
  },
  {
    path: 'deals',
    loadComponent: () => import('./features/deals/deals').then(m => m.Deals),
    data: { reuse: true }
  },
  {
    path: 'search',
    loadComponent: () => import('./features/search/search').then(m => m.Search),
    data: { reuse: true }
  },
  {
    path: 'waitlist',
    loadComponent: () => import('./features/waitlist/waitlist').then(m => m.Waitlist),
    data: { reuse: true }
  },
  {
    path: 'wishlist',
    redirectTo: 'waitlist',
    pathMatch: 'full'
  },
  {
    path: 'giveaways',
    loadComponent: () => import('./features/giveaways/giveaways').then(m => m.Giveaways),
    data: { reuse: true }
  },
  {
    path: 'details/:uuid',
    loadComponent: () => import('./features/details/details').then(m => m.Details)
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/callback').then(m => m.AuthCallback)
  }
];
