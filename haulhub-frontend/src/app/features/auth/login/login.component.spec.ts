import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, provideRouter } from '@angular/router';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserRole } from '@haulhub/shared';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let router: Router;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', [
      'login',
      'navigateToDashboard'
    ], {
      isAuthenticated: false
    });
    const snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        LoginComponent,
        ReactiveFormsModule,
        BrowserAnimationsModule
      ],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy }
      ]
    }).compileComponents();

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    router = TestBed.inject(Router);
    snackBar = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;
    spyOn(router, 'navigate');

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with empty values', () => {
    expect(component.loginForm.get('email')?.value).toBe('');
    expect(component.loginForm.get('password')?.value).toBe('');
  });

  it('should validate email field as required', () => {
    const emailControl = component.loginForm.get('email');
    emailControl?.setValue('');
    emailControl?.markAsTouched();
    expect(emailControl?.hasError('required')).toBe(true);
  });

  it('should validate email format', () => {
    const emailControl = component.loginForm.get('email');
    emailControl?.setValue('invalid-email');
    emailControl?.markAsTouched();
    expect(emailControl?.hasError('email')).toBe(true);
  });

  it('should validate password as required', () => {
    const passwordControl = component.loginForm.get('password');
    passwordControl?.setValue('');
    passwordControl?.markAsTouched();
    expect(passwordControl?.hasError('required')).toBe(true);
  });

  it('should validate password minimum length', () => {
    const passwordControl = component.loginForm.get('password');
    passwordControl?.setValue('short');
    passwordControl?.markAsTouched();
    expect(passwordControl?.hasError('minlength')).toBe(true);
  });

  it('should not submit form if invalid', () => {
    component.loginForm.get('email')?.setValue('');
    component.loginForm.get('password')?.setValue('');
    component.onSubmit();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('should call authService.login on valid form submission', () => {
    const mockResponse = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 3600,
      userId: '123',
      role: UserRole.Dispatcher,
      email: 'test@example.com',
      fullName: 'Test User'
    };

    authService.login.and.returnValue(of(mockResponse));

    component.loginForm.get('email')?.setValue('test@example.com');
    component.loginForm.get('password')?.setValue('password123');
    component.onSubmit();

    expect(authService.login).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123'
    });
  });

  it('should navigate to dashboard on successful login', () => {
    const mockResponse = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 3600,
      userId: '123',
      role: UserRole.Dispatcher,
      email: 'test@example.com',
      fullName: 'Test User'
    };

    authService.login.and.returnValue(of(mockResponse));

    component.loginForm.get('email')?.setValue('test@example.com');
    component.loginForm.get('password')?.setValue('password123');
    component.onSubmit();

    expect(authService.navigateToDashboard).toHaveBeenCalled();
  });

  it('should set isLoading to true when submitting', () => {
    const mockResponse = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 3600,
      userId: '123',
      role: UserRole.Dispatcher,
      email: 'test@example.com',
      fullName: 'Test User'
    };

    authService.login.and.returnValue(of(mockResponse));

    component.loginForm.get('email')?.setValue('test@example.com');
    component.loginForm.get('password')?.setValue('password123');
    
    expect(component.isLoading).toBe(false);
    component.onSubmit();
    expect(component.isLoading).toBe(true);
  });

  it('should toggle password visibility', () => {
    expect(component.hidePassword).toBe(true);
    component.togglePasswordVisibility();
    expect(component.hidePassword).toBe(false);
    component.togglePasswordVisibility();
    expect(component.hidePassword).toBe(true);
  });
});
