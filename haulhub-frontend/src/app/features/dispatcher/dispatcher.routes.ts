import { Routes } from '@angular/router';

export const DISPATCHER_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'trips',
    loadComponent: () => import('./trip-list/trip-list.component').then(m => m.TripListComponent)
  },
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
