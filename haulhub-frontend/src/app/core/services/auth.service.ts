import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { tap, catchError, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LoginDto, RegisterDto, AuthResponse } from '@haulhub/shared';
import { UserRole } from '@haulhub/shared';

interface UserData {
  userId: string;
  role: UserRole;
  email: string;
  fullName: string;
  carrierId?: string;
  nationalId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly USER_DATA_KEY = 'etrucky_user';
  private readonly ACCESS_TOKEN_KEY = 'etrucky_access_token';
  private readonly REFRESH_TOKEN_KEY = 'etrucky_refresh_token';

  private currentUserSubject!: BehaviorSubject<UserData | null>;
  public currentUser$!: Observable<UserData | null>;

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    
    // Initialize the subject with stored user data
    let storedUser: UserData | null = null;
    try {
      storedUser = this.getStoredUserData();
      
      // Validate that if we have user data, we also have tokens and valid role
      if (storedUser) {
        const hasAccessToken = !!this.getAccessToken();
        const hasRefreshToken = !!localStorage.getItem(this.REFRESH_TOKEN_KEY);
        const hasValidRole = !!storedUser.role;
        
        // If user data exists but tokens/role are missing, clear everything
        if (!hasAccessToken || !hasRefreshToken || !hasValidRole) {
          console.warn('User data is corrupted (missing tokens or role), clearing localStorage');
          // Clear localStorage directly without calling clearUserData() since subject isn't initialized yet
          try {
            localStorage.removeItem(this.USER_DATA_KEY);
            localStorage.removeItem(this.ACCESS_TOKEN_KEY);
            localStorage.removeItem(this.REFRESH_TOKEN_KEY);
          } catch (e) {
            console.error('Error clearing localStorage:', e);
          }
          storedUser = null;
        }
      } else {
        console.log('No stored user data found');
      }
    } catch (error) {
      console.error('Error loading stored user data:', error);
      // Clear corrupted data directly
      try {
        localStorage.removeItem(this.USER_DATA_KEY);
        localStorage.removeItem(this.ACCESS_TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
      } catch (e) {
        console.error('Error clearing localStorage:', e);
      }
      storedUser = null;
    }
    
    this.currentUserSubject = new BehaviorSubject<UserData | null>(storedUser);
    this.currentUser$ = this.currentUserSubject.asObservable();
  }

  /**
   * Get the current user value
   */
  get currentUserValue(): UserData | null {
    return this.currentUserSubject.value;
  }

  /**
   * Check if user is authenticated
   * Note: This only checks if we have user data stored locally.
   * The actual authentication is verified by the backend via httpOnly cookies.
   */
  get isAuthenticated(): boolean {
    return this.currentUserValue !== null;
  }

  /**
   * Get the current user's role
   */
  get userRole(): UserRole | null {
    return this.currentUserValue?.role || null;
  }

  /**
   * Get the current user's carrier ID
   */
  get carrierId(): string | null {
    return this.currentUserValue?.carrierId || null;
  }

  get userId(): string | null {
    return this.currentUserValue?.userId || null;
  }

  /**
   * Register a new user
   * Note: Registration does not automatically log the user in.
   * User must log in separately after registration.
   */
  register(registerDto: RegisterDto): Observable<{ message: string; userId: string }> {
    return this.http.post<{ message: string; userId: string }>(
      `${this.baseUrl}/auth/register`,
      registerDto
    ).pipe(
      catchError(error => {
        console.error('Registration error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Login user
   */
  login(loginDto: LoginDto): Observable<AuthResponse> {
    // Clear any stale data from previous sessions
    this.clearUserData();
    return this.http.post<AuthResponse>(
      `${this.baseUrl}/auth/login`,
      loginDto
    ).pipe(
      tap(response => this.handleAuthResponse(response)),
      catchError(error => {
        console.error('Login error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Refresh the access token
   * Note: Refresh response doesn't include a new refresh token (it stays the same)
   * Note: Refresh response may not include full user data, only the new access token
   */
  refreshToken(): Observable<Omit<AuthResponse, 'refreshToken'>> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      console.error('No refresh token available');
      this.clearUserData();
      this.router.navigate(['/auth/login']);
      return throwError(() => new Error('No refresh token available'));
    }

    console.log('Attempting token refresh...');
    return this.http.post<Omit<AuthResponse, 'refreshToken'>>(
      `${this.baseUrl}/auth/refresh`,
      { refreshToken }
    ).pipe(
      tap(response => {
        console.log('Token refresh successful, updating access token...');
        // Only update the access token, don't touch user data
        if (response.accessToken) {
          this.storeAccessToken(response.accessToken);
        }
      }),
      catchError(error => {
        console.error('Token refresh error:', error);
        
        // If the request was aborted, reload the page to get a clean state
        // The user data and tokens are still valid, so they'll stay logged in
        if (error.name === 'AbortError' || error.status === 0) {
          console.warn('Token refresh was aborted, reloading page...');
          window.location.reload();
          return throwError(() => error);
        }
        
        // For other errors, logout
        this.clearUserData();
        this.router.navigate(['/auth/login']);
        return throwError(() => error);
      })
    );
  }

  /**
   * Logout user
   */
  logout(): Observable<any> {
    const accessToken = this.getAccessToken();
    const options = accessToken 
      ? { headers: { 'Authorization': `Bearer ${accessToken}` } }
      : {};
    
    return this.http.post(
      `${this.baseUrl}/auth/logout`,
      {},
      options
    ).pipe(
      tap(() => {
        this.clearUserData();
        this.router.navigate(['/auth/login']);
      }),
      catchError(error => {
        console.error('Logout error:', error);
        // Even if logout fails on server, clear local data
        this.clearUserData();
        this.router.navigate(['/auth/login']);
        return throwError(() => error);
      })
    );
  }

  /**
   * Handle authentication response
   * Store user data and tokens in localStorage
   */
  private handleAuthResponse(response: AuthResponse): void {
    // Validate response has required fields
    if (!response.userId || !response.role || !response.email || !response.fullName) {
      console.error('Invalid auth response - missing required fields:', response);
      throw new Error('Invalid authentication response');
    }

    const userData: UserData = {
      userId: response.userId,
      role: response.role,
      email: response.email,
      fullName: response.fullName,
      carrierId: response.carrierId,
      nationalId: response.nationalId
    };
    
    // Store user data and tokens in localStorage
    this.storeUserData(userData);
    if (response.accessToken) {
      this.storeAccessToken(response.accessToken);
    }
    // Only update refresh token if provided (login/register provide it, refresh doesn't)
    if ('refreshToken' in response && response.refreshToken) {
      this.storeRefreshToken(response.refreshToken);
    }

    // Update current user subject
    this.currentUserSubject.next(userData);
  }

  /**
   * Store user data in localStorage
   */
  private storeUserData(userData: UserData): void {
    try {
      localStorage.setItem(this.USER_DATA_KEY, JSON.stringify(userData));
    } catch (error) {
      console.error('Error storing user data:', error);
    }
  }

  /**
   * Get stored user data from localStorage
   */
  private getStoredUserData(): UserData | null {
    try {
      const stored = localStorage.getItem(this.USER_DATA_KEY);
      if (!stored) {
        return null;
      }

      return JSON.parse(stored) as UserData;
    } catch (error) {
      console.error('Error retrieving user data:', error);
      try {
        localStorage.removeItem(this.USER_DATA_KEY);
      } catch (e) {
        console.error('Error clearing user data:', e);
      }
      return null;
    }
  }

  /**
   * Clear user data and tokens from localStorage
   */
  private clearUserData(): void {
    try {
      localStorage.removeItem(this.USER_DATA_KEY);
      localStorage.removeItem(this.ACCESS_TOKEN_KEY);
      localStorage.removeItem(this.REFRESH_TOKEN_KEY);
      localStorage.removeItem('etrucky_dispatcher_asset_cache');
      localStorage.removeItem('etrucky_carrier_asset_cache');
      localStorage.removeItem('etrucky_driver_asset_cache');
    } catch (error) {
      console.error('Error clearing user data:', error);
    }

    // Update subject
    this.currentUserSubject.next(null);
  }

  /**
   * Store access token in localStorage
   */
  private storeAccessToken(token: string): void {
    try {
      localStorage.setItem(this.ACCESS_TOKEN_KEY, token);
    } catch (error) {
      console.error('Error storing access token:', error);
    }
  }

  /**
   * Store refresh token in localStorage
   */
  private storeRefreshToken(token: string): void {
    try {
      localStorage.setItem(this.REFRESH_TOKEN_KEY, token);
    } catch (error) {
      console.error('Error storing refresh token:', error);
    }
  }

  /**
   * Get access token from localStorage
   */
  getAccessToken(): string | null {
    try {
      return localStorage.getItem(this.ACCESS_TOKEN_KEY);
    } catch (error) {
      console.error('Error retrieving access token:', error);
      return null;
    }
  }

  /**
   * Get refresh token from localStorage
   */
  private getRefreshToken(): string | null {
    try {
      return localStorage.getItem(this.REFRESH_TOKEN_KEY);
    } catch (error) {
      console.error('Error retrieving refresh token:', error);
      return null;
    }
  }

  /**
   * Get the dashboard route for the current user's role
   */
  getDashboardRoute(): string {
    const role = this.userRole;
    if (!role) {
      return '/auth/login';
    }

    switch (role) {
      case UserRole.Dispatcher:
        return '/dispatcher/dashboard';
      case UserRole.LorryOwner:
        return '/truck-owner/dashboard';
      case UserRole.Driver:
        return '/driver/dashboard';
      case UserRole.Admin:
        return '/admin/dashboard';
      case UserRole.Carrier:
        return '/carrier/dashboard';
      default:
        return '/auth/login';
    }
  }

  /**
   * Navigate to role-specific dashboard
   */
  navigateToDashboard(): void {
    const dashboardRoute = this.getDashboardRoute();
    this.router.navigate([dashboardRoute]);
  }
}
