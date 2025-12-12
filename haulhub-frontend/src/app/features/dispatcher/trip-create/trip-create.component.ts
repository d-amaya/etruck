import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TripService } from '../../../core/services';
import { Broker, CreateTripDto } from '@haulhub/shared';

@Component({
  selector: 'app-trip-create',
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
    MatProgressSpinnerModule
  ],
  templateUrl: './trip-create.component.html',
  styleUrls: ['./trip-create.component.scss']
})
export class TripCreateComponent implements OnInit {
  tripForm!: FormGroup;
  brokers: Broker[] = [];
  trucks: any[] = []; // TODO: Replace with Truck interface from shared
  trailers: any[] = []; // TODO: Replace with Trailer interface from shared
  loading = false;
  loadingBrokers = true;
  loadingVehicles = true;
  minDate = new Date();

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.loadBrokers();
    this.loadVehicles();
  }
  
  private loadVehicles(): void {
    this.loadingVehicles = true;
    // TODO: Implement actual API calls when truck/trailer endpoints are ready
    // For now, using placeholder data
    this.trucks = [
      { truckId: 'truck-1', name: 'Freigh101', licensePlate: 'F0077X', isActive: true },
      { truckId: 'truck-2', name: 'Freigh102', licensePlate: 'F0076X', isActive: true },
      { truckId: 'truck-3', name: 'Freigh103', licensePlate: 'F9251X', isActive: true }
    ];
    this.trailers = [
      { trailerId: 'trailer-1', name: 'Trailer101', licensePlate: 'T0077X', isActive: true },
      { trailerId: 'trailer-2', name: 'Trailer102', licensePlate: 'T0076X', isActive: true }
    ];
    this.loadingVehicles = false;
  }

  private initializeForm(): void {
    this.tripForm = this.fb.group({
      // Location Information
      pickupLocation: ['', [Validators.required, Validators.minLength(3)]],
      dropoffLocation: ['', [Validators.required, Validators.minLength(3)]],
      
      // Schedule Information
      scheduledPickupDatetime: ['', Validators.required],
      scheduledPickupTime: ['', Validators.required],
      
      // Broker Information
      brokerId: ['', Validators.required],
      orderConfirmation: [''],
      
      // Vehicle Assignment (Enhanced - separate truck and trailer)
      truckId: ['', [Validators.required, Validators.minLength(2)]],
      trailerId: [''],
      
      // Driver Assignment
      driverId: ['', [Validators.required, Validators.minLength(2)]],
      driverName: ['', [Validators.required, Validators.minLength(2)]],
      
      // Mileage Tracking (Enhanced)
      loadedMiles: ['', [Validators.required, Validators.min(0)]],
      emptyMiles: ['', [Validators.required, Validators.min(0)]],
      totalMiles: [{ value: '', disabled: true }], // Auto-calculated
      
      // Financial Details (Enhanced)
      orderRate: ['', [Validators.required, Validators.min(0.01)]],
      brokerPayment: ['', [Validators.required, Validators.min(0.01)]],
      driverPayment: ['', [Validators.required, Validators.min(0.01)]],
      driverRate: ['', Validators.min(0)],
      
      // Enhanced Pickup Details
      pickupCompany: [''],
      pickupPhone: [''],
      pickupAddress: [''],
      pickupCity: [''],
      pickupState: [''],
      pickupZip: [''],
      pickupNotes: [''],
      
      // Enhanced Delivery Details
      deliveryCompany: [''],
      deliveryPhone: [''],
      deliveryAddress: [''],
      deliveryCity: [''],
      deliveryState: [''],
      deliveryZip: [''],
      deliveryDate: [''],
      deliveryTime: [''],
      deliveryNotes: [''],
      
      // Additional Fees
      lumperFees: [0, Validators.min(0)],
      detentionFees: [0, Validators.min(0)],
      
      // Fuel Management
      fuelAvgCost: ['', Validators.min(0)],
      fuelAvgGallonsPerMile: ['', Validators.min(0)],
      
      // Notes
      notes: ['']
    });
    
    // Auto-calculate total miles when loaded or empty miles change
    this.tripForm.get('loadedMiles')?.valueChanges.subscribe(() => this.calculateTotalMiles());
    this.tripForm.get('emptyMiles')?.valueChanges.subscribe(() => this.calculateTotalMiles());
  }
  
  private calculateTotalMiles(): void {
    const loadedMiles = parseFloat(this.tripForm.get('loadedMiles')?.value) || 0;
    const emptyMiles = parseFloat(this.tripForm.get('emptyMiles')?.value) || 0;
    const totalMiles = loadedMiles + emptyMiles;
    this.tripForm.get('totalMiles')?.setValue(totalMiles, { emitEvent: false });
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
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.loadingBrokers = false;
      }
    });
  }

  onSubmit(): void {
    if (this.tripForm.invalid) {
      this.markFormGroupTouched(this.tripForm);
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    const formValue = this.tripForm.getRawValue(); // Get all values including disabled fields
    
    // Combine date and time into ISO string
    const date = new Date(formValue.scheduledPickupDatetime);
    const [hours, minutes] = formValue.scheduledPickupTime.split(':');
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    
    // Validate that the datetime is in the future
    if (date <= new Date()) {
      this.snackBar.open('Scheduled pickup time must be in the future.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }
    
    // Combine delivery date and time if provided
    let deliveryDatetime: string | undefined;
    if (formValue.deliveryDate && formValue.deliveryTime) {
      const deliveryDate = new Date(formValue.deliveryDate);
      const [deliveryHours, deliveryMinutes] = formValue.deliveryTime.split(':');
      deliveryDate.setHours(parseInt(deliveryHours, 10), parseInt(deliveryMinutes, 10), 0, 0);
      deliveryDatetime = deliveryDate.toISOString();
    }

    const tripData: any = { // TODO: Update CreateTripDto interface in shared package
      // Basic trip info
      pickupLocation: formValue.pickupLocation.trim(),
      dropoffLocation: formValue.dropoffLocation.trim(),
      scheduledPickupDatetime: date.toISOString(),
      brokerId: formValue.brokerId,
      orderConfirmation: formValue.orderConfirmation?.trim() || undefined,
      
      // Vehicle assignment (enhanced)
      truckId: formValue.truckId.trim(),
      trailerId: formValue.trailerId?.trim() || undefined,
      
      // Driver assignment
      driverId: formValue.driverId.trim(),
      driverName: formValue.driverName.trim(),
      
      // Mileage tracking (enhanced)
      loadedMiles: parseFloat(formValue.loadedMiles),
      emptyMiles: parseFloat(formValue.emptyMiles),
      totalMiles: parseFloat(formValue.totalMiles),
      
      // Financial details (enhanced)
      orderRate: parseFloat(formValue.orderRate),
      brokerPayment: parseFloat(formValue.brokerPayment),
      driverPayment: parseFloat(formValue.driverPayment),
      driverRate: formValue.driverRate ? parseFloat(formValue.driverRate) : undefined,
      
      // Enhanced pickup details
      pickupCompany: formValue.pickupCompany?.trim() || undefined,
      pickupPhone: formValue.pickupPhone?.trim() || undefined,
      pickupAddress: formValue.pickupAddress?.trim() || undefined,
      pickupCity: formValue.pickupCity?.trim() || undefined,
      pickupState: formValue.pickupState?.trim() || undefined,
      pickupZip: formValue.pickupZip?.trim() || undefined,
      pickupNotes: formValue.pickupNotes?.trim() || undefined,
      
      // Enhanced delivery details
      deliveryCompany: formValue.deliveryCompany?.trim() || undefined,
      deliveryPhone: formValue.deliveryPhone?.trim() || undefined,
      deliveryAddress: formValue.deliveryAddress?.trim() || undefined,
      deliveryCity: formValue.deliveryCity?.trim() || undefined,
      deliveryState: formValue.deliveryState?.trim() || undefined,
      deliveryZip: formValue.deliveryZip?.trim() || undefined,
      deliveryDate: deliveryDatetime,
      deliveryNotes: formValue.deliveryNotes?.trim() || undefined,
      
      // Additional fees
      lumperFees: parseFloat(formValue.lumperFees) || 0,
      detentionFees: parseFloat(formValue.detentionFees) || 0,
      
      // Fuel management
      fuelAvgCost: formValue.fuelAvgCost ? parseFloat(formValue.fuelAvgCost) : undefined,
      fuelAvgGallonsPerMile: formValue.fuelAvgGallonsPerMile ? parseFloat(formValue.fuelAvgGallonsPerMile) : undefined,
      
      // Notes
      notes: formValue.notes?.trim() || undefined
    };

    this.loading = true;
    this.tripService.createTrip(tripData).subscribe({
      next: (trip) => {
        this.snackBar.open('Trip created successfully!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
        this.router.navigate(['/dispatcher/dashboard']);
      },
      error: (error) => {
        console.error('Error creating trip:', error);
        const errorMessage = error.error?.message || 'Failed to create trip. Please try again.';
        this.snackBar.open(errorMessage, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.loading = false;
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
