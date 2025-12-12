import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EnhancedDriver, CDLClass, UpdateEnhancedDriverDto } from '@haulhub/shared';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-driver-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule,
    MatDividerModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './driver-profile.component.html',
  styleUrls: ['./driver-profile.component.scss']
})
export class DriverProfileComponent implements OnInit {
  profileForm!: FormGroup;
  loading = false;
  saving = false;
  driver: EnhancedDriver | null = null;
  
  cdlClasses = Object.values(CDLClass);
  
  // US States for CDL
  usStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.loadDriverProfile();
  }

  private initializeForm(): void {
    this.profileForm = this.fb.group({
      // Basic Information
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required],
      address: [''],
      city: [''],
      state: [''],
      zip: [''],
      
      // CDL Information
      cdlClass: [''],
      cdlIssued: [''],
      cdlExpires: [''],
      cdlState: [''],
      
      // Corporate Information
      corpName: [''],
      ein: ['', Validators.pattern(/^\d{2}-\d{7}$/)],
      
      // Personal Information
      dob: [''],
      ssn: ['', Validators.pattern(/^\d{3}-\d{2}-\d{4}$/)],
      
      // Banking Information
      bankName: [''],
      bankAccountNumber: ['', Validators.pattern(/^\d{8,17}$/)],
      
      // Rate Information
      perMileRate: ['', [Validators.min(0)]],
      
      // Notes
      notes: ['']
    });
  }

  public loadDriverProfile(): void {
    this.loading = true;
    
    // Get current user from auth service
    this.authService.currentUser$.subscribe({
      next: (user) => {
        if (user) {
          this.driver = user as EnhancedDriver;
          this.populateForm(this.driver);
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading driver profile:', error);
        this.snackBar.open('Failed to load profile', 'Close', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  private populateForm(driver: EnhancedDriver): void {
    this.profileForm.patchValue({
      name: driver.fullName,
      email: driver.email,
      phone: driver.phoneNumber,
      address: '', // Not in User interface
      city: '', // Not in User interface
      state: '', // Not in User interface
      zip: '', // Not in User interface
      cdlClass: driver.cdlClass,
      cdlIssued: driver.cdlIssued ? new Date(driver.cdlIssued) : null,
      cdlExpires: driver.cdlExpires ? new Date(driver.cdlExpires) : null,
      cdlState: driver.cdlState,
      corpName: driver.corpName,
      ein: driver.ein,
      dob: driver.dob ? new Date(driver.dob) : null,
      ssn: driver.ssn,
      bankName: driver.bankName,
      bankAccountNumber: driver.bankAccountNumber,
      perMileRate: driver.perMileRate,
      notes: driver.notes
    });
  }

  onSubmit(): void {
    if (this.profileForm.invalid) {
      this.snackBar.open('Please fix form errors', 'Close', { duration: 3000 });
      return;
    }

    this.saving = true;
    const formValue = this.profileForm.value;
    
    const updateDto: UpdateEnhancedDriverDto = {
      cdlClass: formValue.cdlClass,
      cdlIssued: formValue.cdlIssued ? formValue.cdlIssued.toISOString() : undefined,
      cdlExpires: formValue.cdlExpires ? formValue.cdlExpires.toISOString() : undefined,
      cdlState: formValue.cdlState,
      corpName: formValue.corpName,
      ein: formValue.ein,
      dob: formValue.dob ? formValue.dob.toISOString() : undefined,
      ssn: formValue.ssn,
      bankName: formValue.bankName,
      bankAccountNumber: formValue.bankAccountNumber,
      perMileRate: formValue.perMileRate,
      notes: formValue.notes
    };

    // TODO: Call API to update driver profile
    // For now, just show success message
    setTimeout(() => {
      this.saving = false;
      this.snackBar.open('Profile updated successfully', 'Close', { duration: 3000 });
    }, 1000);
  }

  isCDLExpired(): boolean {
    const expiresDate = this.profileForm.get('cdlExpires')?.value;
    if (!expiresDate) return false;
    return new Date(expiresDate) < new Date();
  }

  isCDLExpiringSoon(): boolean {
    const expiresDate = this.profileForm.get('cdlExpires')?.value;
    if (!expiresDate) return false;
    
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const expires = new Date(expiresDate);
    return expires > new Date() && expires < thirtyDaysFromNow;
  }
}
