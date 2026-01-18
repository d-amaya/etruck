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
  // Trip management routes
  {
    path: 'trips/create',
    loadComponent: () => import('./trip-create/trip-create.component').then(m => m.TripCreateComponent)
  },
  {
    path: 'trips/:tripId/edit',
    loadComponent: () => import('./trip-edit/trip-edit.component').then(m => m.TripEditComponent)
  },
  {
    path: 'trips/:tripId',
    loadComponent: () => import('./trip-detail/trip-detail.component').then(m => m.TripDetailComponent)
  },
  // Redirects
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
