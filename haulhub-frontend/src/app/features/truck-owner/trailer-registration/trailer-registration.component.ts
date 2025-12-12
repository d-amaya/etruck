import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-trailer-registration',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule
  ],
  templateUrl: './trailer-registration.component.html',
  styleUrls: ['./trailer-registration.component.scss']
})
export class TrailerRegistrationComponent implements OnInit {
  registrationForm!: FormGroup;
  saving = false;
  selectedFiles: File[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.registrationForm = this.fb.group({
      name: ['', Validators.required],
      vin: ['', [Validators.required, Validators.pattern(/^[A-HJ-NPR-Z0-9]{17}$/)]],
      year: ['', [Validators.required, Validators.min(1900), Validators.max(new Date().getFullYear() + 1)]],
      brand: ['', Validators.required],
      color: ['', Validators.required],
      licensePlate: ['', Validators.required],
      isActive: [true],
      notes: ['']
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.selectedFiles = Array.from(input.files);
    }
  }

  removeFile(index: number): void {
    this.selectedFiles.splice(index, 1);
  }

  onSubmit(): void {
    if (this.registrationForm.invalid) {
      this.snackBar.open('Please fix form errors', 'Close', { duration: 3000 });
      return;
    }

    if (this.selectedFiles.length === 0) {
      this.snackBar.open('Please upload at least one verification document', 'Close', { duration: 3000 });
      return;
    }

    this.saving = true;
    const formValue = this.registrationForm.value;

    // TODO: Call API to register trailer with documents
    setTimeout(() => {
      this.saving = false;
      this.snackBar.open('Trailer registered successfully', 'Close', { duration: 3000 });
      this.router.navigate(['/truck-owner/trailers']);
    }, 1000);
  }

  onCancel(): void {
    this.router.navigate(['/truck-owner/trailers']);
  }
}
