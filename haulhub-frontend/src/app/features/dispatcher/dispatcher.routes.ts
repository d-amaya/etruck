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
  // Keep trip management routes for direct access and trip operations
  {
    path: 'trips/create',
    loadComponent: () => import('./trip-create/trip-create.component').then(m => m.TripCreateComponent)
  },
  {
    path: 'trips/:tripId/edit',
    loadComponent: () => import('./trip-edit/trip-edit.component').then(m => m.TripEditComponent)
  },
  {
    path: 'trips/:tripId/status',
    loadComponent: () => import('./trip-status-update/trip-status-update.component').then(m => m.TripStatusUpdateComponent)
  },
  {
    path: 'trips/:tripId',
    loadComponent: () => import('./trip-detail/trip-detail.component').then(m => m.TripDetailComponent)
  },
  // Deprecated routes - functionality moved to dashboard
  // Keep for backward compatibility but remove from navigation
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
  // Invoice management routes
  {
    path: 'invoices',
    loadComponent: () => import('./invoice-management/invoice-list.component').then(m => m.InvoiceListComponent)
  },
  {
    path: 'invoices/:invoiceId',
    loadComponent: () => import('./invoice-management/invoice-detail.component').then(m => m.InvoiceDetailComponent)
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];
