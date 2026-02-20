import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { CarrierService } from '../../../core/services/carrier.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface User {
  userId: string;
  name: string;
  email: string;
  role: 'DISPATCHER' | 'DRIVER';
  phone: string;
  isActive: boolean;
  // Role-specific fields
  rate?: number;
  company?: string;
  corpName?: string;
  cdlClass?: string;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    LoadingSpinnerComponent,
    ErrorStateComponent
  ],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.scss']
})
export class UserManagementComponent implements OnInit {
  users: User[] = [];
  filteredUsers: User[] = [];
  loading = false;
  error: string | null = null;

  // Filters
  selectedRole: string = '';
  searchTerm: string = '';

  // Dialog state
  showUserDialog = false;
  editMode = false;
  userForm!: FormGroup;
  saving = false;
  currentUserId: string | null = null;

  constructor(
    private carrierService: CarrierService,
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.loadUsers();
  }

  private initializeForm(): void {
    this.userForm = this.fb.group({
      // Common fields
      role: ['', Validators.required],
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^\(\d{3}\) \d{3}-\d{4}$/)]],
      ein: ['', [Validators.required, Validators.pattern(/^\d{2}-\d{7}$/)]],
      ss: ['', [Validators.required, Validators.pattern(/^\d{3}-\d{2}-\d{4}$/)]],
      address: ['', Validators.required],
      city: ['', Validators.required],
      state: ['', [Validators.required, Validators.pattern(/^[A-Z]{2}$/)]],
      zip: ['', [Validators.required, Validators.pattern(/^\d{5}(-\d{4})?$/)]],

      // Role-specific fields (conditionally required)
      rate: [''],
      company: [''],
      corpName: [''],
      dob: [''],
      cdlClass: [''],
      cdlState: [''],
      cdlIssued: [''],
      cdlExpires: [''],
      fax: ['']
    });

    // Watch role changes to update validators
    this.userForm.get('role')?.valueChanges.subscribe(role => {
      this.updateRoleSpecificValidators(role);
    });
  }

  private updateRoleSpecificValidators(role: string): void {
    // Clear all role-specific validators first
    this.userForm.get('rate')?.clearValidators();
    this.userForm.get('company')?.clearValidators();
    this.userForm.get('corpName')?.clearValidators();
    this.userForm.get('dob')?.clearValidators();
    this.userForm.get('cdlClass')?.clearValidators();
    this.userForm.get('cdlState')?.clearValidators();
    this.userForm.get('cdlIssued')?.clearValidators();
    this.userForm.get('cdlExpires')?.clearValidators();

    // Add validators based on role
    if (role === 'DISPATCHER') {
      this.userForm.get('rate')?.setValidators([Validators.required, Validators.min(0)]);
    } else if (role === 'DRIVER') {
      this.userForm.get('rate')?.setValidators([Validators.required, Validators.min(0)]);
      this.userForm.get('dob')?.setValidators(Validators.required);
      this.userForm.get('cdlClass')?.setValidators(Validators.required);
      this.userForm.get('cdlState')?.setValidators([Validators.required, Validators.pattern(/^[A-Z]{2}$/)]);
      this.userForm.get('cdlIssued')?.setValidators(Validators.required);
      this.userForm.get('cdlExpires')?.setValidators(Validators.required);
    } else {
      // No extra validators for other roles
    }

    // Update validity
    Object.keys(this.userForm.controls).forEach(key => {
      this.userForm.get(key)?.updateValueAndValidity();
    });
  }

  async loadUsers(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const response = await firstValueFrom(
        this.carrierService.getUsers(
          this.selectedRole || undefined,
          this.searchTerm || undefined
        )
      );
      
      this.users = response.users as any[];
      this.applyFilters();
    } catch (err: any) {
      console.error('Error loading users:', err);
      this.error = err.message || 'Failed to load users';
    } finally {
      this.loading = false;
    }
  }

  applyFilters(): void {
    let filtered = [...this.users];

    // Role filter
    if (this.selectedRole) {
      filtered = filtered.filter(user => user.role === this.selectedRole);
    }

    // Search filter (name or email)
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
      );
    }

    this.filteredUsers = filtered;
  }

  onRoleFilterChange(): void {
    this.applyFilters();
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  openCreateUserDialog(): void {
    this.editMode = false;
    this.currentUserId = null;
    this.userForm.reset();
    this.userForm.enable();
    this.showUserDialog = true;
  }

  editUser(user: User): void {
    this.editMode = true;
    this.currentUserId = user.userId;
    
    // Populate form with user data
    this.userForm.patchValue({
      role: user.role,
      name: user.name,
      email: user.email,
      phone: user.phone,
      rate: user.rate,
      company: user.company,
      corpName: user.corpName,
      cdlClass: user.cdlClass
      // Note: We don't populate ein, ss, address, city, state, zip as they're not in the User interface
      // These would need to be fetched from the backend if needed for editing
    });

    // Disable non-editable fields
    this.userForm.get('role')?.disable();
    this.userForm.get('email')?.disable();
    this.userForm.get('ein')?.disable();
    this.userForm.get('ss')?.disable();

    this.showUserDialog = true;
  }

  closeDialog(): void {
    this.showUserDialog = false;
    this.userForm.reset();
    this.currentUserId = null;
  }

  onOverlayClick(event: MouseEvent): void {
    // Close dialog when clicking on overlay (not on dialog content)
    if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
      this.closeDialog();
    }
  }

  async saveUser(): Promise<void> {
    if (this.userForm.invalid) {
      this.markFormGroupTouched(this.userForm);
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    this.saving = true;

    try {
      const formValue = this.userForm.getRawValue();

      if (this.editMode && this.currentUserId) {
        // Update existing user
        const updateData: any = {
          name: formValue.name,
          phone: formValue.phone,
          address: formValue.address,
          city: formValue.city,
          state: formValue.state,
          zip: formValue.zip
        };

        // Add role-specific fields
        if (formValue.role === 'DISPATCHER' || formValue.role === 'DRIVER') {
          updateData.rate = parseFloat(formValue.rate);
        }
        if (formValue.role === 'DRIVER') {
          if (formValue.corpName) updateData.corpName = formValue.corpName;
          updateData.cdlClass = formValue.cdlClass;
          updateData.cdlState = formValue.cdlState;
          updateData.cdlIssued = formValue.cdlIssued;
          updateData.cdlExpires = formValue.cdlExpires;
          if (formValue.fax) updateData.fax = formValue.fax;
        }

        await firstValueFrom(
          this.carrierService.updateUser(this.currentUserId, updateData)
        );

        this.snackBar.open('User updated successfully!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      } else {
        // Create new user
        const createData: any = {
          role: formValue.role,
          name: formValue.name,
          email: formValue.email,
          phone: formValue.phone,
          ein: formValue.ein,
          ss: formValue.ss,
          address: formValue.address,
          city: formValue.city,
          state: formValue.state,
          zip: formValue.zip
        };

        // Add role-specific fields
        if (formValue.role === 'DISPATCHER') {
          createData.rate = parseFloat(formValue.rate);
        } else if (formValue.role === 'DRIVER') {
          createData.rate = parseFloat(formValue.rate);
          if (formValue.corpName) createData.corpName = formValue.corpName;
          createData.dob = formValue.dob;
          createData.cdlClass = formValue.cdlClass;
          createData.cdlState = formValue.cdlState;
          createData.cdlIssued = formValue.cdlIssued;
          createData.cdlExpires = formValue.cdlExpires;
          if (formValue.fax) createData.fax = formValue.fax;
        }

        const response = await firstValueFrom(
          this.carrierService.createUser(createData)
        );

        this.snackBar.open(
          `User created successfully! Temporary password: ${response.temporaryPassword}`,
          'Close',
          {
            duration: 10000,
            panelClass: ['success-snackbar']
          }
        );
      }

      this.closeDialog();
      await this.loadUsers();
    } catch (err: any) {
      console.error('Error saving user:', err);
      const errorMessage = err.error?.message || 'Failed to save user. Please try again.';
      this.snackBar.open(errorMessage, 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.saving = false;
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.userForm.get(fieldName);
    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.errors['required']) {
      return 'This field is required';
    }
    if (control.errors['email']) {
      return 'Invalid email format';
    }
    if (control.errors['minlength']) {
      return `Minimum length is ${control.errors['minlength'].requiredLength} characters`;
    }
    if (control.errors['pattern']) {
      if (fieldName === 'phone') {
        return 'Format: (555) 123-4567';
      }
      if (fieldName === 'ein') {
        return 'Format: 12-3456789';
      }
      if (fieldName === 'ss') {
        return 'Format: 123-45-6789';
      }
      if (fieldName === 'state' || fieldName === 'cdlState') {
        return 'Two letter state code (e.g., GA)';
      }
      if (fieldName === 'zip') {
        return 'Format: 12345 or 12345-6789';
      }
      return 'Invalid format';
    }
    if (control.errors['min']) {
      return `Value must be at least ${control.errors['min'].min}`;
    }
    return 'Invalid value';
  }

  async toggleUserStatus(user: User): Promise<void> {
    const action = user.isActive ? 'deactivate' : 'reactivate';
    const actionPastTense = user.isActive ? 'deactivated' : 'reactivated';
    
    // Show confirmation dialog
    const dialogData: ConfirmDialogData = {
      title: `${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} User`,
      message: `Are you sure you want to ${action} ${user.name}? ${
        action === 'deactivate' 
          ? 'They will no longer be able to access the system.' 
          : 'They will regain access to the system.'
      }`,
      confirmText: action === 'deactivate' ? 'Deactivate' : 'Reactivate',
      cancelText: 'Cancel'
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: dialogData
    });

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    
    if (!confirmed) {
      return;
    }

    // Perform the action
    try {
      if (user.isActive) {
        await firstValueFrom(this.carrierService.deactivateUser(user.userId));
      } else {
        await firstValueFrom(this.carrierService.reactivateUser(user.userId));
      }

      this.snackBar.open(
        `User ${actionPastTense} successfully!`,
        'Close',
        {
          duration: 3000,
          panelClass: ['success-snackbar']
        }
      );

      // Refresh user list
      await this.loadUsers();
    } catch (err: any) {
      console.error(`Error ${action}ing user:`, err);
      const errorMessage = err.error?.message || `Failed to ${action} user. Please try again.`;
      this.snackBar.open(errorMessage, 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    }
  }

  onRetry(): void {
    this.loadUsers();
  }

  navigateBack(): void {
    this.router.navigate(['/carrier/dashboard']);
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'DISPATCHER': return 'badge-dispatcher';
      case 'DRIVER': return 'badge-driver';
      default: return '';
    }
  }

  getRoleDisplayName(role: string): string {
    switch (role) {
      case 'DISPATCHER': return 'Dispatcher';
      case 'DRIVER': return 'Driver';
      default: return role;
    }
  }
}
