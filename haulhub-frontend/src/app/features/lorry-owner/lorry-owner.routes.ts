import { Routes } from '@angular/router';

export const LORRY_OWNER_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./lorry-registration/lorry-registration.component').then(m => m.LorryRegistrationComponent)
  },
  {
    path: 'lorries',
    loadComponent: () => import('./lorry-list/lorry-list.component').then(m => m.LorryListComponent)
  },
  {
    path: 'trips',
    loadComponent: () => import('./lorry-trip-list/lorry-trip-list.component').then(m => m.LorryTripListComponent)
  },
  {
    path: 'payments',
    loadComponent: () => import('./lorry-payment-report/lorry-payment-report.component').then(m => m.LorryPaymentReportComponent)
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];
