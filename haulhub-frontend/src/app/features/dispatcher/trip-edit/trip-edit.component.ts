import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TripService } from '../../../core/services';
import { Broker, CreateTripDto, Trip } from '@haulhub/shared';

@Component({
  selector: 'app-trip-edit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCardModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatIconModule
  ],
  templateUrl: './trip-edit.component.html',
  styleUrls: ['./trip-edit.component.scss']
})
export class TripEditComponent implements OnInit {
  tripForm!: FormGroup;
  trip?: Trip;
  brokers: Broker[] = [];
  loading = true;
  submitting = false;
  loadingBrokers = true;
  error?: string;
  minDate = new Date();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private tripService: TripService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.loadBrokers();
    
    const tripId = this.route.snapshot.paramMap.get('tripId');
    if (tripId) {
      this.loadTrip(tripId);
    } else {
      this.error = 'No trip ID provided';
      this.loading = false;
    }
  }

  private initializeForm(): void {
    this.tripForm = this.fb.group({
      pickupLocation: ['', [Validators.required, Validators.minLength(3)]],
      dropoffLocation: ['', [Validators.required, Validators.minLength(3)]],
      scheduledPickupDatetime: ['', Validators.required],
      scheduledPickupTime: ['', Validators.required],
      brokerId: ['', Validators.required],
      lorryId: ['', [Validators.required, Validators.minLength(2)]],
      driverId: ['', [Validators.required, Validators.minLength(2)]],
      driverName: ['', [Validators.required, Validators.minLength(2)]],
      brokerPayment: ['', [Validators.required, Validators.min(0.01)]],
      lorryOwnerPayment: ['', [Validators.required, Validators.min(0.01)]],
      driverPayment: ['', [Validators.required, Validators.min(0.01)]],
      distance: ['', Validators.min(0)]
    });
  }

  private loadBrokers(): void {
    this.loadingBrokers = true;
    this.tripService.getBrokers().subscribe({
      next: (brokers) => {
        this.brokers = brokers.filter(b => b.isActive);
        this.loadingBrokers = false;
      },
      error: (error) => {
        console.error('Error loading brokers:', error);
        this.snackBar.open('Failed to load brokers. Please try again.', 'Close', {
          duration: 5000
        });
        this.loadingBrokers = false;
      }
    });
  }

  private loadTrip(tripId: string): void {
    this.loading = true;
    this.tripService.getTripById(tripId).subscribe({
      next: (trip) => {
        this.trip = trip;
        this.populateForm(trip);
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading trip:', error);
        this.error = error.error?.message || 'Failed to load trip details';
        this.loading = false;
      }
    });
  }

  private populateForm(trip: Trip): void {
    const scheduledDate = new Date(trip.scheduledPickupDatetime);
    const hours = scheduledDate.getHours().toString().padStart(2, '0');
    const minutes = scheduledDate.getMinutes().toString().padStart(2, '0');
    
    this.tripForm.patchValue({
      pickupLocation: trip.pickupLocation,
      dropoffLocation: trip.dropoffLocation,
      scheduledPickupDatetime: scheduledDate,
      scheduledPickupTime: `${hours}:${minutes}`,
      brokerId: trip.brokerId,
      lorryId: trip.lorryId,
      driverId: trip.driverId,
      driverName: trip.driverName,
      brokerPayment: trip.brokerPayment,
      lorryOwnerPayment: trip.lorryOwnerPayment,
      driverPayment: trip.driverPayment,
      distance: trip.distance || ''
    });
  }

  onSubmit(): void {
    if (this.tripForm.invalid || !this.trip) {
      this.markFormGroupTouched(this.tripForm);
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', {
        duration: 3000
      });
      return;
    }

    const formValue = this.tripForm.value;
    
    // Combine date and time into ISO string
    const date = new Date(formValue.scheduledPickupDatetime);
    const [hours, minutes] = formValue.scheduledPickupTime.split(':');
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

    const tripData: Partial<CreateTripDto> = {
      pickupLocation: formValue.pickupLocation.trim(),
      dropoffLocation: formValue.dropoffLocation.trim(),
      scheduledPickupDatetime: date.toISOString(),
      brokerId: formValue.brokerId,
      lorryId: formValue.lorryId.trim(),
      driverId: formValue.driverId.trim(),
      driverName: formValue.driverName.trim(),
      brokerPayment: parseFloat(formValue.brokerPayment),
      lorryOwnerPayment: parseFloat(formValue.lorryOwnerPayment),
      driverPayment: parseFloat(formValue.driverPayment),
      distance: formValue.distance ? parseFloat(formValue.distance) : undefined
    };

    this.submitting = true;
    this.tripService.updateTrip(this.trip.tripId, tripData).subscribe({
      next: () => {
        this.snackBar.open('Trip updated successfully!', 'Close', {
          duration: 3000
        });
        this.router.navigate(['/dispatcher/dashboard']);
      },
      error: (error) => {
        console.error('Error updating trip:', error);
        const errorMessage = error.error?.message || 'Failed to update trip. Please try again.';
        this.snackBar.open(errorMessage, 'Close', {
          duration: 5000
        });
        this.submitting = false;
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/dispatcher/dashboard']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.tripForm.get(fieldName);
    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.errors['required']) {
      return 'This field is required';
    }
    if (control.errors['minlength']) {
      return `Minimum length is ${control.errors['minlength'].requiredLength} characters`;
    }
    if (control.errors['min']) {
      return `Value must be at least ${control.errors['min'].min}`;
    }
    return 'Invalid value';
  }
}
