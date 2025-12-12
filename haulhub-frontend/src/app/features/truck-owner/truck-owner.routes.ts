import { Routes } from '@angular/router';

export const TRUCK_OWNER_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'trucks',
    loadComponent: () => import('./truck-list/truck-list.component').then(m => m.TruckListComponent)
  },
  {
    path: 'trucks/register',
    loadComponent: () => import('./truck-registration/truck-registration.component').then(m => m.TruckRegistrationComponent)
  },
  {
    path: 'trailers',
    loadComponent: () => import('./trailer-list/trailer-list.component').then(m => m.TrailerListComponent)
  },
  {
    path: 'trailers/register',
    loadComponent: () => import('./trailer-registration/trailer-registration.component').then(m => m.TrailerRegistrationComponent)
  }
];
