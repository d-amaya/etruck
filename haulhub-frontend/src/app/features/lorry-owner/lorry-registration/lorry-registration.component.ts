import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { LorryService } from '../../../core/services';
import { RegisterLorryDto, UploadDocumentDto } from '@haulhub/shared';

@Component({
  selector: 'app-lorry-registration',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCardModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatIconModule
  ],
  templateUrl: './lorry-registration.component.html',
  styleUrls: ['./lorry-registration.component.scss']
})
export class LorryRegistrationComponent implements OnInit {
  lorryForm!: FormGroup;
  loading = false;
  selectedFile: File | null = null;
  fileError: string | null = null;
  currentYear = new Date().getFullYear();
  maxFileSize = 10 * 1024 * 1024; // 10MB in bytes

  constructor(
    private fb: FormBuilder,
    private lorryService: LorryService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.lorryForm = this.fb.group({
      lorryId: ['', [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(20),
        Validators.pattern(/^[A-Z0-9\-\s]+$/i)
      ]],
      make: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      model: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(50)]],
      year: ['', [
        Validators.required,
        Validators.min(1900),
        Validators.max(this.currentYear + 1)
      ]]
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      
      // Validate file size
      if (file.size > this.maxFileSize) {
        this.fileError = 'File size must not exceed 10MB';
        this.selectedFile = null;
        input.value = '';
        return;
      }

      // Validate file type (accept common document formats)
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        this.fileError = 'Please upload a PDF, Word document, or image file (JPG, PNG)';
        this.selectedFile = null;
        input.value = '';
        return;
      }

      this.selectedFile = file;
      this.fileError = null;
    }
  }

  removeFile(): void {
    this.selectedFile = null;
    this.fileError = null;
    // Reset file input
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  onSubmit(): void {
    if (this.lorryForm.invalid) {
      this.markFormGroupTouched(this.lorryForm);
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    if (!this.selectedFile) {
      this.fileError = 'Please upload a verification document';
      this.snackBar.open('Please upload a verification document.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    const formValue = this.lorryForm.value;
    const lorryData: RegisterLorryDto = {
      lorryId: formValue.lorryId.trim().toUpperCase(),
      make: formValue.make.trim(),
      model: formValue.model.trim(),
      year: parseInt(formValue.year, 10)
    };

    this.loading = true;

    // Step 1: Register the lorry
    this.lorryService.registerLorry(lorryData).subscribe({
      next: (lorry) => {
        // Step 2: Upload the document
        this.uploadDocument(lorry.lorryId);
      },
      error: (error) => {
        console.error('Error registering lorry:', error);
        const errorMessage = error.error?.message || 'Failed to register lorry. Please try again.';
        this.snackBar.open(errorMessage, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.loading = false;
      }
    });
  }

  private uploadDocument(lorryId: string): void {
    if (!this.selectedFile) {
      this.loading = false;
      return;
    }

    const uploadDto: UploadDocumentDto = {
      fileName: this.selectedFile.name,
      fileSize: this.selectedFile.size,
      contentType: this.selectedFile.type
    };

    // Request presigned URL
    this.lorryService.requestDocumentUploadUrl(lorryId, uploadDto).subscribe({
      next: (response) => {
        // Upload file to S3 using presigned URL
        this.lorryService.uploadDocumentToS3(response.uploadUrl, this.selectedFile!).subscribe({
          next: () => {
            this.loading = false;
            this.snackBar.open('Lorry registered successfully! Your registration is pending verification.', 'Close', {
              duration: 5000,
              panelClass: ['success-snackbar']
            });
            this.router.navigate(['/lorry-owner/dashboard']);
          },
          error: (error) => {
            console.error('Error uploading document to S3:', error);
            this.snackBar.open('Lorry registered but document upload failed. Please try uploading again from the dashboard.', 'Close', {
              duration: 7000,
              panelClass: ['warning-snackbar']
            });
            this.loading = false;
            this.router.navigate(['/lorry-owner/dashboard']);
          }
        });
      },
      error: (error) => {
        console.error('Error requesting upload URL:', error);
        this.snackBar.open('Lorry registered but document upload failed. Please try uploading again from the dashboard.', 'Close', {
          duration: 7000,
          panelClass: ['warning-snackbar']
        });
        this.loading = false;
        this.router.navigate(['/lorry-owner/dashboard']);
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/lorry-owner/dashboard']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.lorryForm.get(fieldName);
    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.errors['required']) {
      return 'This field is required';
    }
    if (control.errors['minlength']) {
      return `Minimum length is ${control.errors['minlength'].requiredLength} characters`;
    }
    if (control.errors['maxlength']) {
      return `Maximum length is ${control.errors['maxlength'].requiredLength} characters`;
    }
    if (control.errors['min']) {
      return `Value must be at least ${control.errors['min'].min}`;
    }
    if (control.errors['max']) {
      return `Value must not exceed ${control.errors['max'].max}`;
    }
    if (control.errors['pattern']) {
      return 'Invalid format. Use letters, numbers, hyphens, and spaces only';
    }
    return 'Invalid value';
  }

  get fileSizeDisplay(): string {
    if (!this.selectedFile) return '';
    const sizeInMB = this.selectedFile.size / (1024 * 1024);
    return `${sizeInMB.toFixed(2)} MB`;
  }
}
