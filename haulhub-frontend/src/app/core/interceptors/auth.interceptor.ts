import { HttpInterceptorFn, HttpErrorResponse, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError, Observable, BehaviorSubject, filter, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Shared state to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

/**
 * HTTP Interceptor that:
 * 1. Adds Authorization header with access token to requests
 * 2. Handles 401 errors by attempting to refresh the token
 * 3. Prevents multiple simultaneous refresh attempts
 * 4. Redirects to login if refresh fails
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
        
        // If already refreshing, wait for the refresh to complete (with timeout)
        if (isRefreshing) {
          return new Observable<HttpEvent<unknown>>(observer => {
            const timeout = setTimeout(() => {
              console.warn('Token refresh wait timeout, resetting and retrying');
              isRefreshing = false;
              refreshTokenSubject.next(null);
              observer.error(error);
            }, 10000); // 10 second timeout

            const subscription = refreshTokenSubject.pipe(
              filter(token => token !== null),
              take(1)
            ).subscribe({
              next: (token) => {
                clearTimeout(timeout);
                // Retry the original request with the new token
                const retryReq = req.clone({
                  setHeaders: {
                    Authorization: `Bearer ${token}`
                  }
                });
                next(retryReq).subscribe(observer);
              },
              error: (err) => {
                clearTimeout(timeout);
                observer.error(err);
              }
            });

            return () => {
              clearTimeout(timeout);
              subscription.unsubscribe();
            };
          });
        }

        // Start refreshing
        isRefreshing = true;
        refreshTokenSubject.next(null);

        return authService.refreshToken().pipe(
          switchMap(() => {
            // Get the new token
            const newAccessToken = authService.getAccessToken();
            if (!newAccessToken) {
              isRefreshing = false;
              refreshTokenSubject.next(null);
              return throwError(() => new Error('No access token after refresh'));
            }

            // Notify waiting requests
            isRefreshing = false;
            refreshTokenSubject.next(newAccessToken);

            // Retry the original request with the new token
            const retryReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${newAccessToken}`
              }
            });
            return next(retryReq);
          }),
          catchError((refreshError) => {
            console.error('Token refresh failed in interceptor:', refreshError);
            
            // Reset refresh state immediately
            isRefreshing = false;
            refreshTokenSubject.next(null);
            
            // If the refresh was aborted, reload the page to get a clean state
            // The user data and tokens are still valid, so they'll stay logged in
            if (refreshError.name === 'AbortError' || refreshError.status === 0) {
              console.warn('Token refresh was aborted, reloading page for clean state...');
              setTimeout(() => window.location.reload(), 100);
              return throwError(() => error);
            }
            
            // For other errors, the AuthService will handle logout and redirect
            return throwError(() => refreshError);
          })
        );
      }

      // For other errors or if refresh already failed, just pass through
      return throwError(() => error);
    })
  );
};
