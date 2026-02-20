import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, provideRouter } from '@angular/router';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { RegisterComponent } from './register.component';
import { AuthService } from '../../../core/services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserRole } from '@haulhub/shared';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let router: Router;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', [
      'register',
      'navigateToDashboard'
    ], {
      isAuthenticated: false
    });
    const snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        RegisterComponent,
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

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with empty values', () => {
    expect(component.registerForm.get('email')?.value).toBe('');
    expect(component.registerForm.get('password')?.value).toBe('');
    expect(component.registerForm.get('fullName')?.value).toBe('');
    expect(component.registerForm.get('phoneNumber')?.value).toBe('');
    expect(component.registerForm.get('role')?.value).toBe('');
  });

  it('should validate all required fields', () => {
    component.registerForm.markAllAsTouched();
    expect(component.registerForm.get('email')?.hasError('required')).toBe(true);
    expect(component.registerForm.get('password')?.hasError('required')).toBe(true);
    expect(component.registerForm.get('fullName')?.hasError('required')).toBe(true);
    expect(component.registerForm.get('role')?.hasError('required')).toBe(true);
  });

  it('should validate email format', () => {
    const emailControl = component.registerForm.get('email');
    emailControl?.setValue('invalid-email');
    emailControl?.markAsTouched();
    expect(emailControl?.hasError('email')).toBe(true);
  });

  it('should validate password minimum length', () => {
    const passwordControl = component.registerForm.get('password');
    passwordControl?.setValue('short');
    passwordControl?.markAsTouched();
    expect(passwordControl?.hasError('minlength')).toBe(true);
  });

  it('should validate phone number format', () => {
    const phoneControl = component.registerForm.get('phoneNumber');
    phoneControl?.setValue('invalid');
    phoneControl?.markAsTouched();
    expect(phoneControl?.hasError('pattern')).toBe(true);
  });

  it('should validate password match', () => {
    component.registerForm.get('password')?.setValue('password123');
    component.registerForm.get('confirmPassword')?.setValue('different');
    component.registerForm.get('confirmPassword')?.markAsTouched();
    expect(component.registerForm.hasError('passwordMismatch')).toBe(true);
  });

  it('should not submit form if invalid', () => {
    component.registerForm.get('email')?.setValue('');
    component.onSubmit();
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('should call authService.register on valid form submission', () => {
    const mockResponse = {
      message: 'User registered successfully. You can now log in.',
      userId: '123'
    };

    authService.register.and.returnValue(of(mockResponse));

    component.registerForm.patchValue({
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'password123',
      fullName: 'Test User',
      phoneNumber: '+1234567890',
      role: UserRole.Dispatcher
    });

    component.onSubmit();

    expect(authService.register).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
      fullName: 'Test User',
      phoneNumber: '+1234567890',
      role: UserRole.Dispatcher,
      driverLicenseNumber: '' // Empty for non-Driver roles
    });
  });

  it('should navigate to login page on successful registration', () => {
    const mockResponse = {
      message: 'User registered successfully. You can now log in.',
      userId: '123'
    };

    authService.register.and.returnValue(of(mockResponse));

    component.registerForm.patchValue({
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'password123',
      fullName: 'Test User',
      phoneNumber: '+1234567890',
      role: UserRole.Dispatcher
    });

    component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it('should navigate to login page on successful registration', () => {
    const mockResponse = {
      message: 'User registered successfully. You can now log in.',
      userId: '123'
    };

    authService.register.and.returnValue(of(mockResponse));

    component.registerForm.patchValue({
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'password123',
      fullName: 'Test User',
      phoneNumber: '+1234567890',
      role: UserRole.Dispatcher
    });

    component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it('should toggle password visibility', () => {
    expect(component.hidePassword).toBe(true);
    component.togglePasswordVisibility();
    expect(component.hidePassword).toBe(false);
  });

  it('should toggle confirm password visibility', () => {
    expect(component.hideConfirmPassword).toBe(true);
    component.toggleConfirmPasswordVisibility();
    expect(component.hideConfirmPassword).toBe(false);
  });

  it('should have three role options', () => {
    expect(component.roles.length).toBe(3);
    expect(component.roles.map(r => r.value)).toContain(UserRole.Dispatcher);
    expect(component.roles.map(r => r.value)).toContain(UserRole.Carrier);
    expect(component.roles.map(r => r.value)).toContain(UserRole.Driver);
    expect(component.roles.map(r => r.value)).not.toContain(UserRole.Admin);
  });

  it('should show driver license field when Driver role is selected', () => {
    component.registerForm.get('role')?.setValue(UserRole.Driver);
    fixture.detectChanges();
    expect(component.isDriverRole()).toBe(true);
  });

  it('should hide driver license field when non-Driver role is selected', () => {
    component.registerForm.get('role')?.setValue(UserRole.Dispatcher);
    fixture.detectChanges();
    expect(component.isDriverRole()).toBe(false);
  });

  it('should require driver license number for Driver role', () => {
    component.registerForm.get('role')?.setValue(UserRole.Driver);
    const driverLicenseControl = component.registerForm.get('driverLicenseNumber');
    driverLicenseControl?.markAsTouched();
    expect(driverLicenseControl?.hasError('required')).toBe(true);
  });

  it('should not require driver license number for non-Driver roles', () => {
    component.registerForm.get('role')?.setValue(UserRole.Dispatcher);
    const driverLicenseControl = component.registerForm.get('driverLicenseNumber');
    expect(driverLicenseControl?.hasError('required')).toBe(false);
  });

  it('should include driver license number when registering as Driver', () => {
    const mockResponse = {
      message: 'User registered successfully. You can now log in.',
      userId: '123'
    };

    authService.register.and.returnValue(of(mockResponse));

    component.registerForm.patchValue({
      email: 'driver@example.com',
      password: 'password123',
      confirmPassword: 'password123',
      fullName: 'Test Driver',
      phoneNumber: '+1234567890',
      role: UserRole.Driver,
      driverLicenseNumber: 'CA-DL-123456'
    });

    component.onSubmit();

    expect(authService.register).toHaveBeenCalledWith({
      email: 'driver@example.com',
      password: 'password123',
      fullName: 'Test Driver',
      phoneNumber: '+1234567890',
      role: UserRole.Driver,
      driverLicenseNumber: 'CA-DL-123456'
    });
  });
});
