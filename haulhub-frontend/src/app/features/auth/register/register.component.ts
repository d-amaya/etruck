import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../../core/services/auth.service';
import { RegisterDto, UserRole } from '@haulhub/shared';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatIconModule,
    MatSelectModule
  ],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  registerForm!: FormGroup;
  isLoading = false;
  hidePassword = true;
  hideConfirmPassword = true;

  // Available roles for registration (excluding Admin)
  roles = [
    { value: UserRole.Dispatcher, label: 'Dispatcher' },
    { value: UserRole.Carrier, label: 'Carrier' },
    { value: UserRole.Driver, label: 'Driver' }
  ];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // If already authenticated, navigate to dashboard
    if (this.authService.isAuthenticated) {
      this.authService.navigateToDashboard();
      return;
    }

    this.initializeForm();
  }

  private initializeForm(): void {
    this.registerForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      phoneNumber: ['', [Validators.pattern(/^\+?[1-9]\d{1,14}$/)]],
      role: ['', [Validators.required]],
      driverLicenseNumber: [''] // Conditionally required for Driver role
    }, {
      validators: this.passwordMatchValidator
    });

    // Watch for role changes to add/remove driver license validation
    this.registerForm.get('role')?.valueChanges.subscribe(role => {
      const driverLicenseControl = this.registerForm.get('driverLicenseNumber');
      if (role === UserRole.Driver) {
        driverLicenseControl?.setValidators([Validators.required, Validators.minLength(3)]);
      } else {
        driverLicenseControl?.clearValidators();
        driverLicenseControl?.setValue('');
      }
      driverLicenseControl?.updateValueAndValidity();
    });
  }

  // Custom validator to check if passwords match
  private passwordMatchValidator(group: FormGroup): { [key: string]: boolean } | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;

    if (password && confirmPassword && password !== confirmPassword) {
      return { passwordMismatch: true };
    }

    return null;
  }

  get emailControl() {
    return this.registerForm.get('email');
  }

  get passwordControl() {
    return this.registerForm.get('password');
  }

  get confirmPasswordControl() {
    return this.registerForm.get('confirmPassword');
  }

  get fullNameControl() {
    return this.registerForm.get('fullName');
  }

  get phoneNumberControl() {
    return this.registerForm.get('phoneNumber');
  }

  get roleControl() {
    return this.registerForm.get('role');
  }

  get driverLicenseNumberControl() {
    return this.registerForm.get('driverLicenseNumber');
  }

  isDriverRole(): boolean {
    return this.roleControl?.value === UserRole.Driver;
  }

  getEmailErrorMessage(): string {
    if (this.emailControl?.hasError('required')) {
      return 'Email is required';
    }
    if (this.emailControl?.hasError('email')) {
      return 'Please enter a valid email address';
    }
    return '';
  }

  getPasswordErrorMessage(): string {
    if (this.passwordControl?.hasError('required')) {
      return 'Password is required';
    }
    if (this.passwordControl?.hasError('minlength')) {
      return 'Password must be at least 8 characters';
    }
    return '';
  }

  getConfirmPasswordErrorMessage(): string {
    if (this.confirmPasswordControl?.hasError('required')) {
      return 'Please confirm your password';
    }
    if (this.registerForm.hasError('passwordMismatch') && this.confirmPasswordControl?.touched) {
      return 'Passwords do not match';
    }
    return '';
  }

  getFullNameErrorMessage(): string {
    if (this.fullNameControl?.hasError('required')) {
      return 'Full name is required';
    }
    if (this.fullNameControl?.hasError('minlength')) {
      return 'Full name must be at least 2 characters';
    }
    return '';
  }

  getPhoneNumberErrorMessage(): string {
    if (this.phoneNumberControl?.hasError('pattern')) {
      return 'Please enter a valid phone number (e.g., +1234567890)';
    }
    return '';
  }

  getRoleErrorMessage(): string {
    if (this.roleControl?.hasError('required')) {
      return 'Please select a role';
    }
    return '';
  }

  getDriverLicenseNumberErrorMessage(): string {
    if (this.driverLicenseNumberControl?.hasError('required')) {
      return 'Driver license number is required for drivers';
    }
    if (this.driverLicenseNumberControl?.hasError('minlength')) {
      return 'Driver license number must be at least 3 characters';
    }
    return '';
  }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    const { confirmPassword, ...registerData } = this.registerForm.value;
    const registerDto: RegisterDto = registerData;

    this.authService.register(registerDto).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.snackBar.open(
          response.message || 'Registration successful! You can now log in.',
          'Close',
          {
            duration: 5000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
            panelClass: ['success-snackbar']
          }
        );
        // Navigate to login page
        this.router.navigate(['/auth/login']);
      },
      error: (error) => {
        this.isLoading = false;
        let errorMessage = 'Registration failed. Please try again.';

        if (error.status === 400) {
          if (error.error?.message) {
            if (Array.isArray(error.error.message)) {
              errorMessage = error.error.message.join(', ');
            } else {
              errorMessage = error.error.message;
            }
          }
        } else if (error.status === 409) {
          errorMessage = 'An account with this email already exists';
        } else if (error.status === 0) {
          errorMessage = 'Unable to connect to server. Please check your connection.';
        }

        this.snackBar.open(errorMessage, 'Close', {
          duration: 5000,
          horizontalPosition: 'end',
          verticalPosition: 'top',
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  togglePasswordVisibility(): void {
    this.hidePassword = !this.hidePassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword = !this.hideConfirmPassword;
  }
}
