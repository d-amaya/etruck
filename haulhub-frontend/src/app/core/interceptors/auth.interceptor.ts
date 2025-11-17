import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * HTTP Interceptor that:
 * 1. Adds Authorization header with access token to requests
 * 2. Handles 401 errors by attempting to refresh the token
 * 3. Redirects to login if refresh fails
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  // Skip adding token for auth endpoints (except logout)
  const isAuthEndpoint = req.url.includes('/auth/login') || 
                         req.url.includes('/auth/register') ||
                         req.url.includes('/auth/refresh');

  // Clone request to include Authorization header
  let authReq = req;
  if (!isAuthEndpoint) {
    const accessToken = authService.getAccessToken();
    if (accessToken) {
      authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${accessToken}`
        }
      });
    }
  }

  // Handle the request
  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // If we get a 401 and it's not an auth endpoint, try to refresh the token
      if (error.status === 401 && !isAuthEndpoint && !req.url.includes('/auth/refresh')) {
        // Silently refresh the token and retry the request
        return authService.refreshToken().pipe(
          switchMap(() => {
            // Retry the original request with the new token
            const newAccessToken = authService.getAccessToken();
            if (!newAccessToken) {
              return throwError(() => new Error('No access token after refresh'));
            }
            const retryReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${newAccessToken}`
              }
            });
            return next(retryReq);
          }),
          catchError((refreshError) => {
            // If refresh fails, the AuthService will handle logout and redirect
            return throwError(() => refreshError);
          })
        );
      }

      // For other errors or if refresh already failed, just pass through
      return throwError(() => error);
    })
  );
};
