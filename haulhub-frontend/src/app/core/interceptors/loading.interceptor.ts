import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, timeout, catchError, throwError } from 'rxjs';
import { LoadingService } from '../services/loading.service';

/**
 * HTTP Interceptor that shows/hides loading indicator for async operations
 * 
 * Automatically shows loading indicator when requests start and hides when they complete
 * Includes a 30-second timeout to prevent indefinite loading states
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);

  // Skip loading indicator for certain endpoints
  const skipLoading = req.headers.has('X-Skip-Loading') || 
                      req.url.includes('/auth/refresh'); // Don't show spinner for token refresh
  
  if (!skipLoading) {
    loadingService.show();
  }

  return next(req).pipe(
    // Add 30-second timeout to prevent indefinite loading
    timeout(30000),
    catchError((error) => {
      // Ensure loading spinner is hidden on timeout
      if (!skipLoading) {
        loadingService.hide();
      }
      return throwError(() => error);
    }),
    finalize(() => {
      if (!skipLoading) {
        loadingService.hide();
      }
    })
  );
};
