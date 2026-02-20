import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'brokers',
    loadComponent: () => import('./broker-management/broker-management.component').then(m => m.BrokerManagementComponent)
  },
  // Legacy redirects
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
