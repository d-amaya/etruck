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
  minDate!: Date;

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Set minimum date to 1 month ago
    this.minDate = new Date();
    this.minDate.setMonth(this.minDate.getMonth() - 1);
    
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
      
      // Vehicle Assignment (truck license plate - lorryId)
      truckId: ['', [Validators.required, Validators.minLength(2)]],
      
      // Driver Assignment
      driverId: ['', [Validators.required, Validators.minLength(2)]],
      driverName: ['', [Validators.required, Validators.minLength(2)]],
      
      // Mileage Tracking (Enhanced)
      loadedMiles: ['', [Validators.required, Validators.min(0)]],
      emptyMiles: ['', [Validators.required, Validators.min(0)]],
      totalMiles: [{ value: '', disabled: true }], // Auto-calculated
      
      // Financial Details
      brokerPayment: ['', [Validators.required, Validators.min(0.01)]],
      lorryOwnerPayment: ['', [Validators.required, Validators.min(0.01)]],
      driverPayment: ['', [Validators.required, Validators.min(0.01)]],
      
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
      
      // Vehicle assignment - use lorryId (truckId) as required by CreateTripDto
      lorryId: formValue.truckId.trim(),
      
      // Driver assignment
      driverId: formValue.driverId.trim(),
      driverName: formValue.driverName.trim(),
      
      // Mileage tracking (enhanced)
      loadedMiles: parseFloat(formValue.loadedMiles),
      emptyMiles: parseFloat(formValue.emptyMiles),
      totalMiles: parseFloat(formValue.totalMiles),
      
      // Financial details (enhanced) - brokerPayment is required, not orderRate
      brokerPayment: parseFloat(formValue.brokerPayment),
      lorryOwnerPayment: parseFloat(formValue.lorryOwnerPayment),
      driverPayment: parseFloat(formValue.driverPayment),
      
      // Additional fees (optional)
      lumperFees: parseFloat(formValue.lumperFees) || undefined,
      detentionFees: parseFloat(formValue.detentionFees) || undefined,
      
      // Fuel management (optional)
      fuelAvgCost: formValue.fuelAvgCost ? parseFloat(formValue.fuelAvgCost) : undefined,
      fuelAvgGallonsPerMile: formValue.fuelAvgGallonsPerMile ? parseFloat(formValue.fuelAvgGallonsPerMile) : undefined,
    };

    // Note: Enhanced pickup/delivery details are not supported in CreateTripDto
    // They can be added later via the edit/update endpoint

    console.log('Trip data being sent:', JSON.stringify(tripData, null, 2));
    
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

  /**
   * Calculate profit/loss for the trip
   * Profit = Broker Payment - (Lorry Owner Payment + Driver Payment + Fuel Cost + Lumper Fees + Detention Fees)
   */
  calculateProfit(): number {
    const brokerPayment = parseFloat(this.tripForm.get('brokerPayment')?.value) || 0;
    const lorryOwnerPayment = parseFloat(this.tripForm.get('lorryOwnerPayment')?.value) || 0;
    const driverPayment = parseFloat(this.tripForm.get('driverPayment')?.value) || 0;
    const lumperFees = parseFloat(this.tripForm.get('lumperFees')?.value) || 0;
    const detentionFees = parseFloat(this.tripForm.get('detentionFees')?.value) || 0;
    
    // Calculate fuel cost if fuel data is provided
    let fuelCost = 0;
    const fuelAvgCost = parseFloat(this.tripForm.get('fuelAvgCost')?.value) || 0;
    const fuelAvgGallonsPerMile = parseFloat(this.tripForm.get('fuelAvgGallonsPerMile')?.value) || 0;
    
    if (fuelAvgCost > 0 && fuelAvgGallonsPerMile > 0) {
      const totalMiles = parseFloat(this.tripForm.get('totalMiles')?.value) || 0;
      fuelCost = totalMiles * fuelAvgGallonsPerMile * fuelAvgCost;
    }
    
    const totalExpenses = lorryOwnerPayment + driverPayment + fuelCost + lumperFees + detentionFees;
    return brokerPayment - totalExpenses;
  }

  /**
   * Get the label for profit display
   */
  getProfitLabel(): string {
    const profit = this.calculateProfit();
    return profit >= 0 ? 'Estimated Profit:' : 'Estimated Loss:';
  }

  /**
   * Format profit amount for display
   */
  formatProfitAmount(): string {
    const profit = this.calculateProfit();
    const absProfit = Math.abs(profit);
    return `$${absProfit.toFixed(2)}`;
  }
}
