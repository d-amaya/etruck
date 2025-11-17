import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LoginDto, RegisterDto, AuthResponse } from '@haulhub/shared';
import { UserRole } from '@haulhub/shared';

interface UserData {
  userId: string;
  role: UserRole;
  email: string;
  fullName: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly USER_DATA_KEY = 'haulhub_user';
  private readonly ACCESS_TOKEN_KEY = 'haulhub_access_token';
  private readonly REFRESH_TOKEN_KEY = 'haulhub_refresh_token';

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
      
      // Validate that if we have user data, we also have tokens
      if (storedUser) {
        const hasAccessToken = !!this.getAccessToken();
        const hasRefreshToken = !!localStorage.getItem(this.REFRESH_TOKEN_KEY);
        
        // If user data exists but tokens are missing, clear everything
        if (!hasAccessToken || !hasRefreshToken) {
          console.warn('User data exists but tokens are missing, clearing auth data');
          this.clearUserData();
          storedUser = null;
        }
      }
    } catch (error) {
      console.error('Error loading stored user data:', error);
      // Clear corrupted data
      this.clearUserData();
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
   */
  refreshToken(): Observable<Omit<AuthResponse, 'refreshToken'>> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.clearUserData();
      this.router.navigate(['/auth/login']);
      return throwError(() => new Error('No refresh token available'));
    }

    return this.http.post<Omit<AuthResponse, 'refreshToken'>>(
      `${this.baseUrl}/auth/refresh`,
      { refreshToken }
    ).pipe(
      tap(response => this.handleAuthResponse(response as AuthResponse)),
      catchError(error => {
        console.error('Token refresh error:', error);
        // If refresh fails, logout user
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
    const userData: UserData = {
      userId: response.userId,
      role: response.role,
      email: response.email,
      fullName: response.fullName
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
   * Navigate to role-specific dashboard
   */
  navigateToDashboard(): void {
    const role = this.userRole;
    if (!role) {
      this.router.navigate(['/auth/login']);
      return;
    }

    switch (role) {
      case UserRole.Dispatcher:
        this.router.navigate(['/dispatcher/dashboard']);
        break;
      case UserRole.LorryOwner:
        this.router.navigate(['/lorry-owner/dashboard']);
        break;
      case UserRole.Driver:
        this.router.navigate(['/driver/dashboard']);
        break;
      case UserRole.Admin:
        this.router.navigate(['/admin/dashboard']);
        break;
      default:
        this.router.navigate(['/auth/login']);
    }
  }
}
