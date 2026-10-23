import { Routes } from '@angular/router';
import { TabPlaceholder } from './routing/tab-placeholder';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'deals',
    pathMatch: 'full'
  },
  {
    path: 'deals',
    component: TabPlaceholder
  },
  {
    path: 'search',
    component: TabPlaceholder
  },
  {
    path: 'waitlist',
    component: TabPlaceholder
  },
  {
    path: 'wishlist',
    redirectTo: 'waitlist',
    pathMatch: 'full'
  },
  {
    path: 'giveaways',
    component: TabPlaceholder
  },
  {
    path: 'owned',
    loadComponent: () => import('./features/owned/owned').then(m => m.Owned)
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
