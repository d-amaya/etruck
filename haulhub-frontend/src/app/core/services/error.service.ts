import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpErrorResponse } from '@angular/common/http';

/**
 * Service to handle and display user-friendly error messages
 */
@Injectable({
  providedIn: 'root'
})
export class ErrorService {
  private snackBar = inject(MatSnackBar);

  /**
   * Display an error message to the user
   */
  showError(message: string, duration: number = 5000): void {
    this.snackBar.open(message, 'Close', {
      duration,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['error-snackbar']
    });
  }

  /**
   * Display a success message to the user
   */
  showSuccess(message: string, duration: number = 3000): void {
    this.snackBar.open(message, 'Close', {
      duration,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['success-snackbar']
    });
  }

  /**
   * Display an info message to the user
   */
  showInfo(message: string, duration: number = 3000): void {
    this.snackBar.open(message, 'Close', {
      duration,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['info-snackbar']
    });
  }

  /**
   * Handle HTTP errors and display appropriate messages
   */
  handleHttpError(error: HttpErrorResponse): string {
    let errorMessage = 'An unexpected error occurred. Please try again.';

    if (error.error instanceof ErrorEvent) {
      // Client-side or network error
      errorMessage = `Network error: ${error.error.message}`;
    } else {
      // Backend returned an unsuccessful response code
      switch (error.status) {
        case 400:
          // Validation errors
          errorMessage = this.extractValidationErrors(error);
          break;
        case 401:
          // Authentication error - handled by auth interceptor
          errorMessage = 'Your session has expired. Please log in again.';
          break;
        case 403:
          // Authorization error
          errorMessage = 'You do not have permission to perform this action.';
          break;
        case 404:
          // Not found error
          errorMessage = 'The requested resource was not found.';
          break;
        case 409:
          // Conflict error (e.g., duplicate entry)
          errorMessage = error.error?.message || 'A conflict occurred. The resource may already exist.';
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          // Server errors
          errorMessage = 'A server error occurred. Please try again later.';
          break;
        default:
          // Other errors
          errorMessage = error.error?.message || errorMessage;
      }
    }

    return errorMessage;
  }

  /**
   * Extract validation error messages from 400 responses
   */
  private extractValidationErrors(error: HttpErrorResponse): string {
    if (error.error?.message) {
      // If there's a single message
      if (typeof error.error.message === 'string') {
        return error.error.message;
      }
      
      // If there are multiple validation errors (array)
      if (Array.isArray(error.error.message)) {
        return error.error.message.join(', ');
      }
    }

    // If there are field-specific errors
    if (error.error?.errors && typeof error.error.errors === 'object') {
      const errors = Object.values(error.error.errors).flat();
      return errors.join(', ');
    }

    return 'Invalid data provided. Please check your input and try again.';
  }
}
