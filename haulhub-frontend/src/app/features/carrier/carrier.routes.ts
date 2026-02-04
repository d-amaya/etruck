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
    path: 'trips',
    loadComponent: () => import('./trip-list/trip-list.component').then(m => m.CarrierTripListComponent)
  },
  {
    path: 'trips/:tripId',
    loadComponent: () => import('../dispatcher/trip-detail/trip-detail.component').then(m => m.TripDetailComponent)
  },
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
