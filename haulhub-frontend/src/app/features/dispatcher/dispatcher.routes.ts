import { Routes } from '@angular/router';

export const DISPATCHER_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'analytics',
    loadComponent: () => import('./analytics-dashboard/analytics-dashboard.component').then(m => m.AnalyticsDashboardComponent)
  },
  // Order management routes (v2)
  {
    path: 'orders/create',
    loadComponent: () => import('./trip-create/trip-create.component').then(m => m.TripCreateComponent)
  },
  {
    path: 'orders/:orderId/edit',
    loadComponent: () => import('./trip-edit/trip-edit.component').then(m => m.TripEditComponent)
  },
  {
    path: 'orders/:orderId',
    loadComponent: () => import('./trip-detail/trip-detail.component').then(m => m.TripDetailComponent)
  },
  // Legacy redirects
  {
    path: 'trips/create',
    redirectTo: 'orders/create',
    pathMatch: 'full'
  },
  {
    path: 'trips/:tripId/edit',
    redirectTo: 'orders/:tripId/edit'
  },
  {
    path: 'trips/:tripId',
    redirectTo: 'orders/:tripId'
  },
  {
    path: 'trips',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'payment-reports',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];
