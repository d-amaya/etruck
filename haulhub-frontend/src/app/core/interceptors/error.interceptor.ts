import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Skip 401 errors - they're handled by authInterceptor
      if (error.status !== 401) {
        handleError(error, snackBar, router);
      }
      return throwError(() => error);
    })
  );
};

function handleError(error: HttpErrorResponse, snackBar: MatSnackBar, router: Router): void {
    let errorMessage = 'An unexpected error occurred';

    if (error.status === 0) {
      // Network error
      errorMessage = 'Network connection error. Please check your internet connection.';
    } else if (error.status === 403) {
      // Forbidden
      errorMessage = 'You do not have permission to perform this action.';
    } else if (error.status === 404) {
      // Not found
      errorMessage = 'The requested resource was not found.';
    } else if (error.status >= 500) {
      // Server error
      errorMessage = 'Server error. Please try again later.';
    } else if (error.error?.message) {
      // API error with message
      errorMessage = error.error.message;
    } else {
      // Generic client error
      errorMessage = `Error ${error.status}: ${error.statusText}`;
    }

  // Log error for debugging
  console.error('HTTP Error:', {
    status: error.status,
    statusText: error.statusText,
    url: error.url,
    message: errorMessage,
    error: error.error
  });

  // Show snackbar notification
  snackBar.open(errorMessage, 'Dismiss', {
    duration: 5000,
    panelClass: ['error-snackbar']
  });
}