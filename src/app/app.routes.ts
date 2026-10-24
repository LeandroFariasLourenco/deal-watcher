import { Routes } from '@angular/router';
import { Deals } from './features/deals/deals';

const reuse = { reuse: true };

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'deals',
    pathMatch: 'full'
  },
  {
    path: 'deals',
    component: Deals,
    data: reuse
  },
  {
    path: 'search',
    loadComponent: () => import('./features/search/search').then(m => m.Search),
    data: reuse
  },
  {
    path: 'waitlist',
    loadComponent: () => import('./features/waitlist/waitlist').then(m => m.Waitlist),
    data: reuse
  },
  {
    path: 'wishlist',
    redirectTo: 'waitlist',
    pathMatch: 'full'
  },
  {
    path: 'giveaways',
    loadComponent: () => import('./features/giveaways/giveaways').then(m => m.Giveaways),
    data: reuse
  },
  {
    path: 'owned',
    loadComponent: () => import('./features/owned/owned').then(m => m.Owned),
    data: reuse
  },
  {
    path: 'notifications',
    loadComponent: () => import('./features/notifications/notifications').then(m => m.Notifications)
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
