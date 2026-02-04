import { Routes } from '@angular/router';
import { authGuard, noAuthGuard } from './core/guards';
import { UserRole } from '@haulhub/shared';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/auth/login',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    canActivate: [noAuthGuard],
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
  },
  {
    path: 'dispatcher',
    canActivate: [authGuard],
    data: { roles: [UserRole.Dispatcher] },
    loadChildren: () => import('./features/dispatcher/dispatcher.routes').then(m => m.DISPATCHER_ROUTES)
  },
  {
    path: 'truck-owner',
    canActivate: [authGuard],
    data: { roles: [UserRole.LorryOwner] },
    loadChildren: () => import('./features/truck-owner/truck-owner.routes').then(m => m.TRUCK_OWNER_ROUTES)
  },
  {
    path: 'driver',
    canActivate: [authGuard],
    data: { roles: [UserRole.Driver] },
    loadChildren: () => import('./features/driver/driver.routes').then(m => m.DRIVER_ROUTES)
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    data: { roles: [UserRole.Admin] },
    loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES)
  },
  {
    path: 'carrier',
    canActivate: [authGuard],
    data: { roles: [UserRole.Carrier] },
    loadChildren: () => import('./features/carrier/carrier.routes').then(m => m.CARRIER_ROUTES)
  },
  {
    path: '**',
    redirectTo: '/auth/login'
  }
];
