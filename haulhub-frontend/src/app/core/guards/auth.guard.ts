import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '@haulhub/shared';

/**
 * Guard to protect routes that require authentication
 */
export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Check if user is authenticated
  if (!authService.isAuthenticated) {
    // Store the attempted URL for redirecting after login
    router.navigate(['/auth/login'], {
      queryParams: { returnUrl: state.url }
    });
    return false;
  }

  // Check if route requires specific roles
  const requiredRoles = route.data['roles'] as UserRole[] | undefined;
  if (requiredRoles && requiredRoles.length > 0) {
    const userRole = authService.userRole;
    if (!userRole || !requiredRoles.includes(userRole)) {
      // User doesn't have required role, redirect to their dashboard
      authService.navigateToDashboard();
      return false;
    }
  }

  return true;
};

/**
 * Guard to prevent authenticated users from accessing auth pages
 */
export const noAuthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);

  // If user is authenticated, redirect to their dashboard
  if (authService.isAuthenticated) {
    authService.navigateToDashboard();
    return false;
  }

  return true;
};
