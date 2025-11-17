import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'lorries/verification',
    loadComponent: () => import('./lorry-verification/lorry-verification.component').then(m => m.LorryVerificationComponent)
  },
  {
    path: 'users/verification',
    loadComponent: () => import('./user-verification/user-verification.component').then(m => m.UserVerificationComponent)
  },
  {
    path: 'brokers',
    loadComponent: () => import('./broker-management/broker-management.component').then(m => m.BrokerManagementComponent)
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];
