import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ErrorService } from '../services/error.service';
import { Router } from '@angular/router';

/**
 * HTTP Interceptor that handles errors globally and displays user-friendly messages
 * 
 * Error handling strategy:
 * - 400: Validation errors - show field-specific messages
 * - 401: Authentication errors - handled by auth interceptor, but show message if refresh fails
 * - 403: Authorization errors - show permission denied message
 * - 404: Not found errors - show helpful message
 * - 500+: Server errors - show generic error message
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const errorService = inject(ErrorService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Don't handle 401 errors here - let the auth interceptor handle them
      // The auth interceptor will attempt token refresh and only redirect if refresh fails
      if (error.status === 401) {
        return throwError(() => error);
      }

      // Don't show error messages for auth refresh attempts
      if (req.url.includes('/auth/refresh')) {
        return throwError(() => error);
      }

      // Handle specific error cases
      if (error.status === 403) {
        // Authorization error
        errorService.showError('You do not have permission to perform this action.');
      } else if (error.status === 404) {
        // Not found error
        errorService.showError('The requested resource was not found.');
      } else if (error.status >= 500) {
        // Server error
        errorService.showError('A server error occurred. Please try again later.');
      } else if (error.status === 400) {
        // Validation error - extract and show specific messages
        const message = errorService.handleHttpError(error);
        errorService.showError(message);
      } else if (error.status === 0) {
        // Network error or timeout
        if ((error as any).name === 'TimeoutError') {
          errorService.showError('Request timed out. The server is taking too long to respond.');
        } else {
          errorService.showError('Unable to connect to the server. Please check your internet connection.');
        }
      } else {
        // Other errors
        const message = errorService.handleHttpError(error);
        errorService.showError(message);
      }

      // Re-throw the error so components can handle it if needed
      return throwError(() => error);
    })
  );
};
