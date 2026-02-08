import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CarrierService } from '../../../../core/services/carrier.service';
import { firstValueFrom } from 'rxjs';

export interface UserDialogData {
  user?: any;
  role: 'DISPATCHER' | 'DRIVER' | 'TRUCK_OWNER';
  mode: 'create' | 'edit' | 'view';
}

@Component({
  selector: 'app-user-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './user-dialog.component.html',
  styleUrls: ['./user-dialog.component.scss']
})
export class UserDialogComponent {
  userForm: FormGroup;
  saving = false;

  constructor(
    private fb: FormBuilder,
    private carrierService: CarrierService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<UserDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UserDialogData
  ) {
    this.userForm = this.createForm();
    
    if (data.user && (data.mode === 'edit' || data.mode === 'view')) {
      const userData = { ...data.user };
      // Remove company field for non-truck-owners
      if (data.role !== 'TRUCK_OWNER') {
        delete userData.company;
      }
      this.userForm.patchValue(userData);
      
      // Disable email in edit mode (can't change username)
      if (data.mode === 'edit') {
        this.userForm.get('email')?.disable();
      }
    }

    if (data.mode === 'view') {
      this.userForm.disable();
    }
  }

  private createForm(): FormGroup {
    const baseFields = {
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      address: ['', Validators.required],
      city: ['', Validators.required],
      state: ['', Validators.required],
      zip: ['', Validators.required],
      ein: ['', Validators.required],
      ss: ['', Validators.required]
    };

    if (this.data.role === 'DRIVER') {
      return this.fb.group({
        ...baseFields,
        corpName: ['', Validators.required],
        dob: ['', Validators.required],
        cdlClass: ['', Validators.required],
        cdlState: ['', Validators.required],
        cdlIssued: ['', Validators.required],
        cdlExpires: ['', Validators.required],
        fax: ['']
      });
    } else if (this.data.role === 'TRUCK_OWNER') {
      return this.fb.group({
        ...baseFields,
        company: ['', Validators.required]
      });
    } else {
      return this.fb.group({
        ...baseFields,
        rate: ['']
      });
    }
  }

  get title(): string {
    const roleLabel = this.getRoleLabel();
    if (this.data.mode === 'view') return `View ${roleLabel}`;
    if (this.data.mode === 'edit') return `Edit ${roleLabel}`;
    return `Add ${roleLabel}`;
  }

  getRoleLabel(): string {
    switch (this.data.role) {
      case 'DISPATCHER': return 'Dispatcher';
      case 'DRIVER': return 'Driver';
      case 'TRUCK_OWNER': return 'Truck Owner';
      default: return 'User';
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  async onSave(): Promise<void> {
    if (this.userForm.invalid) {
      this.markFormGroupTouched(this.userForm);
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', {
        duration: 3000
      });
      return;
    }

    this.saving = true;

    try {
      const formData = this.userForm.getRawValue();
      
      if (this.data.mode === 'create') {
        const createDto = {
          ...formData,
          role: this.data.role
        };
        await firstValueFrom(this.carrierService.createUser(createDto));
        this.snackBar.open('User created successfully!', 'Close', { duration: 3000 });
        this.dialogRef.close({ success: true });
      } else if (this.data.mode === 'edit') {
        await firstValueFrom(this.carrierService.updateUser(this.data.user.userId, formData));
        this.snackBar.open('User updated successfully!', 'Close', { duration: 3000 });
        this.dialogRef.close({ success: true });
      }
    } catch (err: any) {
      console.error('Error saving user:', err);
      const errorMessage = err.error?.message || err.message || 'Failed to save user. Please try again.';
      this.snackBar.open(errorMessage, 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
      this.saving = false;
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      formGroup.get(key)?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.userForm.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';

    if (control.errors['required']) return 'This field is required';
    if (control.errors['email']) return 'Invalid email address';
    if (control.errors['minlength']) return `Minimum length is ${control.errors['minlength'].requiredLength}`;
    if (control.errors['pattern']) return 'Invalid format';
    return 'Invalid value';
  }
}
