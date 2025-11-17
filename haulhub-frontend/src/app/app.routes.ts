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
    path: 'lorry-owner',
    canActivate: [authGuard],
    data: { roles: [UserRole.LorryOwner] },
    loadChildren: () => import('./features/lorry-owner/lorry-owner.routes').then(m => m.LORRY_OWNER_ROUTES)
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
    path: '**',
    redirectTo: '/auth/login'
  }
];
