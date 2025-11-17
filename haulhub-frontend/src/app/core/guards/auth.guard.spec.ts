import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard, noAuthGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { UserRole } from '@haulhub/shared';

describe('Auth Guards', () => {
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;
  let mockRoute: ActivatedRouteSnapshot;
  let mockState: RouterStateSnapshot;

  beforeEach(() => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['navigateToDashboard'], {
      isAuthenticated: false,
      userRole: null
    });
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    mockRoute = {
      data: {}
    } as any;

    mockState = {
      url: '/test-url'
    } as any;
  });

  describe('authGuard', () => {
    it('should allow access when user is authenticated', () => {
      Object.defineProperty(authService, 'isAuthenticated', { value: true, writable: true });
      Object.defineProperty(authService, 'userRole', { value: UserRole.Dispatcher, writable: true });

      const result = TestBed.runInInjectionContext(() => 
        authGuard(mockRoute, mockState)
      );

      expect(result).toBe(true);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should redirect to login when user is not authenticated', () => {
      Object.defineProperty(authService, 'isAuthenticated', { value: false, writable: true });

      const result = TestBed.runInInjectionContext(() => 
        authGuard(mockRoute, mockState)
      );

      expect(result).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/auth/login'], {
        queryParams: { returnUrl: '/test-url' }
      });
    });

    it('should allow access when user has required role', () => {
      Object.defineProperty(authService, 'isAuthenticated', { value: true, writable: true });
      Object.defineProperty(authService, 'userRole', { value: UserRole.Dispatcher, writable: true });
      
      mockRoute.data = { roles: [UserRole.Dispatcher, UserRole.Admin] };

      const result = TestBed.runInInjectionContext(() => 
        authGuard(mockRoute, mockState)
      );

      expect(result).toBe(true);
      expect(authService.navigateToDashboard).not.toHaveBeenCalled();
    });

    it('should redirect to dashboard when user does not have required role', () => {
      Object.defineProperty(authService, 'isAuthenticated', { value: true, writable: true });
      Object.defineProperty(authService, 'userRole', { value: UserRole.Driver, writable: true });
      
      mockRoute.data = { roles: [UserRole.Dispatcher, UserRole.Admin] };

      const result = TestBed.runInInjectionContext(() => 
        authGuard(mockRoute, mockState)
      );

      expect(result).toBe(false);
      expect(authService.navigateToDashboard).toHaveBeenCalled();
    });

    it('should allow access when no specific roles are required', () => {
      Object.defineProperty(authService, 'isAuthenticated', { value: true, writable: true });
      Object.defineProperty(authService, 'userRole', { value: UserRole.Driver, writable: true });
      
      mockRoute.data = {};

      const result = TestBed.runInInjectionContext(() => 
        authGuard(mockRoute, mockState)
      );

      expect(result).toBe(true);
    });

    it('should redirect to dashboard when user role is null but roles are required', () => {
      Object.defineProperty(authService, 'isAuthenticated', { value: true, writable: true });
      Object.defineProperty(authService, 'userRole', { value: null, writable: true });
      
      mockRoute.data = { roles: [UserRole.Dispatcher] };

      const result = TestBed.runInInjectionContext(() => 
        authGuard(mockRoute, mockState)
      );

      expect(result).toBe(false);
      expect(authService.navigateToDashboard).toHaveBeenCalled();
    });
  });

  describe('noAuthGuard', () => {
    it('should allow access when user is not authenticated', () => {
      Object.defineProperty(authService, 'isAuthenticated', { value: false, writable: true });

      const result = TestBed.runInInjectionContext(() => 
        noAuthGuard(mockRoute, mockState)
      );

      expect(result).toBe(true);
      expect(authService.navigateToDashboard).not.toHaveBeenCalled();
    });

    it('should redirect to dashboard when user is authenticated', () => {
      Object.defineProperty(authService, 'isAuthenticated', { value: true, writable: true });

      const result = TestBed.runInInjectionContext(() => 
        noAuthGuard(mockRoute, mockState)
      );

      expect(result).toBe(false);
      expect(authService.navigateToDashboard).toHaveBeenCalled();
    });
  });
});
