import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpErrorResponse } from '@angular/common/http';
import { ErrorService } from './error.service';

describe('ErrorService', () => {
  let service: ErrorService;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('MatSnackBar', ['open']);

    TestBed.configureTestingModule({
      providers: [
        ErrorService,
        { provide: MatSnackBar, useValue: spy }
      ]
    });

    service = TestBed.inject(ErrorService);
    snackBarSpy = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('showError', () => {
    it('should display error message with correct styling', () => {
      service.showError('Test error');

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        'Test error',
        'Close',
        jasmine.objectContaining({
          panelClass: ['error-snackbar']
        })
      );
    });
  });

  describe('showSuccess', () => {
    it('should display success message with correct styling', () => {
      service.showSuccess('Test success');

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        'Test success',
        'Close',
        jasmine.objectContaining({
          panelClass: ['success-snackbar']
        })
      );
    });
  });

  describe('handleHttpError', () => {
    it('should handle 400 validation errors', () => {
      const error = new HttpErrorResponse({
        status: 400,
        error: { message: 'Validation failed' }
      });

      const message = service.handleHttpError(error);

      expect(message).toBe('Validation failed');
    });

    it('should handle 401 authentication errors', () => {
      const error = new HttpErrorResponse({ status: 401 });

      const message = service.handleHttpError(error);

      expect(message).toBe('Your session has expired. Please log in again.');
    });

    it('should handle 403 authorization errors', () => {
      const error = new HttpErrorResponse({ status: 403 });

      const message = service.handleHttpError(error);

      expect(message).toBe('You do not have permission to perform this action.');
    });

    it('should handle 404 not found errors', () => {
      const error = new HttpErrorResponse({ status: 404 });

      const message = service.handleHttpError(error);

      expect(message).toBe('The requested resource was not found.');
    });

    it('should handle 500 server errors', () => {
      const error = new HttpErrorResponse({ status: 500 });

      const message = service.handleHttpError(error);

      expect(message).toBe('A server error occurred. Please try again later.');
    });
  });
});
