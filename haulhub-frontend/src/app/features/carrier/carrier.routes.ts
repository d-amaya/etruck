import { Routes } from '@angular/router';

export const CARRIER_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.CarrierDashboardComponent)
  },
  {
    path: 'users',
    loadComponent: () => import('./user-management/user-management.component').then(m => m.UserManagementComponent)
  },
  {
    path: 'assets',
    loadComponent: () => import('./asset-management/asset-management.component').then(m => m.AssetManagementComponent)
  },
  {
    path: 'orders',
    loadComponent: () => import('./trip-list/trip-list.component').then(m => m.CarrierTripListComponent)
  },
  {
    path: 'orders/:orderId',
    loadComponent: () => import('../dispatcher/trip-detail/trip-detail.component').then(m => m.TripDetailComponent)
  },
  // Legacy redirects
  { path: 'trips', redirectTo: 'orders', pathMatch: 'full' },
  { path: 'trips/:tripId', redirectTo: 'orders/:tripId', pathMatch: 'full' },
  {
    path: 'analytics',
    loadComponent: () => import('./analytics/analytics.component').then(m => m.CarrierAnalyticsComponent)
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];
