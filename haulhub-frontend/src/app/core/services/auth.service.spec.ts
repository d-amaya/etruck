import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import { LoginDto, RegisterDto, AuthResponse, UserRole } from '@haulhub/shared';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  const mockAuthResponse: AuthResponse = {
    accessToken: 'mock-access-token', // Not used in httpOnly cookie approach
    refreshToken: 'mock-refresh-token', // Not used in httpOnly cookie approach
    expiresIn: 3600, // 1 hour
    userId: 'user-123',
    role: UserRole.Dispatcher,
    email: 'test@example.com',
    fullName: 'Test User'
  };

  beforeEach(() => {
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: Router, useValue: routerSpy }
      ]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('register', () => {
    it('should register a new user without logging them in', () => {
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
        phoneNumber: '1234567890',
        role: UserRole.Dispatcher
      };

      const mockRegisterResponse = {
        message: 'User registered successfully. You can now log in.',
        userId: 'user-123'
      };

      service.register(registerDto).subscribe(response => {
        expect(response).toEqual(mockRegisterResponse);
        // User should NOT be authenticated after registration
        expect(service.isAuthenticated).toBe(false);
        expect(service.userRole).toBeNull();
        expect(service.currentUserValue).toBeNull();
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/register`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(registerDto);
      req.flush(mockRegisterResponse);
    });

    it('should handle registration errors', () => {
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
        phoneNumber: '1234567890',
        role: UserRole.Dispatcher
      };

      service.register(registerDto).subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.status).toBe(400);
        }
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/register`);
      req.flush({ message: 'Email already exists' }, { status: 400, statusText: 'Bad Request' });
    });
  });

  describe('login', () => {
    it('should login user and store user data', () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(loginDto).subscribe(response => {
        expect(response).toEqual(mockAuthResponse);
        expect(service.isAuthenticated).toBe(true);
        expect(service.currentUserValue).toBeTruthy();
        expect(service.currentUserValue?.email).toBe('test@example.com');
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(loginDto);
      req.flush(mockAuthResponse);
    });

    it('should handle login errors', () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      service.login(loginDto).subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.status).toBe(401);
        }
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      req.flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token using httpOnly cookie', () => {
      // First login to establish user session
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(loginDto).subscribe();
      const loginReq = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      loginReq.flush(mockAuthResponse);

      // Now refresh the token
      service.refreshToken().subscribe(response => {
        expect(response).toEqual(mockAuthResponse);
        expect(service.isAuthenticated).toBe(true);
      });

      const refreshReq = httpMock.expectOne(`${environment.apiBaseUrl}/auth/refresh`);
      expect(refreshReq.request.method).toBe('POST');
      expect(refreshReq.request.body).toEqual({ refreshToken: 'mock-refresh-token' });
      refreshReq.flush(mockAuthResponse);
    });

    it('should clear user data and redirect on refresh token failure', () => {
      // First login
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(loginDto).subscribe();
      const loginReq = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      loginReq.flush(mockAuthResponse);

      expect(service.isAuthenticated).toBe(true);

      // Attempt to refresh with expired token
      service.refreshToken().subscribe({
        next: () => fail('should have failed'),
        error: () => {
          expect(service.isAuthenticated).toBe(false);
          expect(service.currentUserValue).toBeNull();
          expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
        }
      });

      const refreshReq = httpMock.expectOne(`${environment.apiBaseUrl}/auth/refresh`);
      refreshReq.flush({ message: 'Refresh token expired' }, { status: 401, statusText: 'Unauthorized' });
    });
  });

  describe('logout', () => {
    it('should logout user and clear user data', () => {
      // First login
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(loginDto).subscribe();
      const loginReq = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      loginReq.flush(mockAuthResponse);

      expect(service.isAuthenticated).toBe(true);

      // Now logout
      service.logout().subscribe(() => {
        expect(service.isAuthenticated).toBe(false);
        expect(service.currentUserValue).toBeNull();
        expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
      });

      const logoutReq = httpMock.expectOne(`${environment.apiBaseUrl}/auth/logout`);
      expect(logoutReq.request.method).toBe('POST');
      logoutReq.flush({});
    });

    it('should clear local data even if logout request fails', () => {
      // First login
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(loginDto).subscribe();
      const loginReq = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      loginReq.flush(mockAuthResponse);

      // Logout with server error
      service.logout().subscribe({
        error: () => {
          expect(service.isAuthenticated).toBe(false);
          expect(service.currentUserValue).toBeNull();
          expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
        }
      });

      const logoutReq = httpMock.expectOne(`${environment.apiBaseUrl}/auth/logout`);
      logoutReq.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no user is logged in', () => {
      expect(service.isAuthenticated).toBe(false);
    });

    it('should return true when user is logged in', () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(loginDto).subscribe();
      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      req.flush(mockAuthResponse);

      expect(service.isAuthenticated).toBe(true);
    });
  });

  describe('navigateToDashboard', () => {
    it('should navigate to dispatcher dashboard for dispatcher role', () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(loginDto).subscribe(() => {
        service.navigateToDashboard();
        expect(router.navigate).toHaveBeenCalledWith(['/dispatcher/dashboard']);
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      req.flush(mockAuthResponse);
    });

    it('should navigate to carrier dashboard for carrier role', () => {
      const carrierResponse: AuthResponse = {
        ...mockAuthResponse,
        role: UserRole.Carrier
      };

      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(loginDto).subscribe(() => {
        service.navigateToDashboard();
        expect(router.navigate).toHaveBeenCalledWith(['/carrier/dashboard']);
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      req.flush(carrierResponse);
    });

    it('should navigate to driver dashboard for driver role', () => {
      const driverResponse: AuthResponse = {
        ...mockAuthResponse,
        role: UserRole.Driver
      };

      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(loginDto).subscribe(() => {
        service.navigateToDashboard();
        expect(router.navigate).toHaveBeenCalledWith(['/driver/dashboard']);
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      req.flush(driverResponse);
    });

    it('should navigate to admin dashboard for admin role', () => {
      const adminResponse: AuthResponse = {
        ...mockAuthResponse,
        role: UserRole.Admin
      };

      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(loginDto).subscribe(() => {
        service.navigateToDashboard();
        expect(router.navigate).toHaveBeenCalledWith(['/admin/dashboard']);
      });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      req.flush(adminResponse);
    });

    it('should navigate to login when no user is authenticated', () => {
      service.navigateToDashboard();
      expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
    });
  });

  describe('localStorage persistence', () => {
    it('should persist user data to localStorage', (done) => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(loginDto).subscribe(() => {
        const stored = localStorage.getItem('etrucky_user');
        expect(stored).toBeTruthy();
        
        if (stored) {
          const userData = JSON.parse(stored);
          expect(userData.email).toBe('test@example.com');
          expect(userData.role).toBe(UserRole.Dispatcher);
          // Tokens should NOT be in localStorage
          expect(userData.accessToken).toBeUndefined();
          expect(userData.refreshToken).toBeUndefined();
        }
        done();
      });
      
      const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
      req.flush(mockAuthResponse);
    });

    it('should restore user data from localStorage on service initialization', () => {
      // Manually store user data AND tokens BEFORE creating service
      const userData = {
        userId: 'user-123',
        role: UserRole.Dispatcher,
        email: 'stored@example.com',
        fullName: 'Stored User'
      };
      localStorage.setItem('etrucky_user', JSON.stringify(userData));
      localStorage.setItem('etrucky_access_token', 'fake-access-token');
      localStorage.setItem('etrucky_refresh_token', 'fake-refresh-token');

      // Create new service - it will load from localStorage in constructor
      const http = TestBed.inject(HttpClient);
      const newService = new AuthService(http, router);
      
      expect(newService.isAuthenticated).toBe(true);
      expect(newService.userRole).toBe(UserRole.Dispatcher);
      expect(newService.currentUserValue?.email).toBe('stored@example.com');
    });

    it('should handle corrupted localStorage data gracefully', () => {
      // Store invalid JSON
      localStorage.setItem('etrucky_user', 'invalid-json{');

      // Reset TestBed and create new service instance
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [HttpClientTestingModule],
        providers: [
          AuthService,
          { provide: Router, useValue: router }
        ]
      });
      
      const newService = TestBed.inject(AuthService);
      const newHttpMock = TestBed.inject(HttpTestingController);
      
      expect(newService.isAuthenticated).toBe(false);
      // Service should have cleared the corrupted data
      const stored = localStorage.getItem('haulhub_user');
      expect(stored).toBeNull();
      
      // Clean up
      newHttpMock.verify();
    });
  });
});
