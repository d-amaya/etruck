import { Routes } from '@angular/router';

export const DRIVER_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile/driver-profile.component').then(m => m.DriverProfileComponent)
  },
  {
    path: 'payment-tracking',
    loadComponent: () => import('./payment-tracking/payment-tracking.component').then(m => m.PaymentTrackingComponent)
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
