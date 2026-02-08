import { Routes } from '@angular/router';

export const DRIVER_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadChildren: () => import('./dashboard/driver-dashboard.module').then(m => m.DriverDashboardModule)
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
