import { Routes } from '@angular/router';

export const DRIVER_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'trips',
    loadComponent: () => import('./trip-list/trip-list.component').then(m => m.TripListComponent)
  },
  {
    path: 'payment-reports',
    loadComponent: () => import('./payment-report/payment-report.component').then(m => m.PaymentReportComponent)
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];
