import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  // Legacy redirects
  {
    path: 'brokers',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'lorries/verification',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'users/verification',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];
