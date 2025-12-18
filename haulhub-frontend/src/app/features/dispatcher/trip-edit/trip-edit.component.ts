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
import { Broker, CreateTripDto, Trip, TripStatus, calculateTripProfit } from '@haulhub/shared';

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
  statusOptions = Object.values(TripStatus);

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
      // Location Information
      pickupLocation: ['', [Validators.required, Validators.minLength(3)]],
      dropoffLocation: ['', [Validators.required, Validators.minLength(3)]],
      
      // Status
      status: ['', Validators.required],
      
      // Schedule Information
      scheduledPickupDatetime: ['', Validators.required],
      scheduledPickupTime: ['', Validators.required],
      
      // Broker Information
      brokerId: ['', Validators.required],
      orderConfirmation: [''],
      
      // Vehicle Assignment (truck license plate)
      truckId: ['', [Validators.required, Validators.minLength(2)]],
      
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
      lorryOwnerPayment: ['', [Validators.required, Validators.min(0.01)]],
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

  private populateForm(trip: any): void { // TODO: Update Trip interface
    const scheduledDate = new Date(trip.scheduledPickupDatetime);
    const hours = scheduledDate.getHours().toString().padStart(2, '0');
    const minutes = scheduledDate.getMinutes().toString().padStart(2, '0');
    
    // Parse delivery date/time if available
    let deliveryDate, deliveryTime;
    if (trip.deliveryDate) {
      const deliveryDateTime = new Date(trip.deliveryDate);
      deliveryDate = deliveryDateTime;
      const deliveryHours = deliveryDateTime.getHours().toString().padStart(2, '0');
      const deliveryMinutes = deliveryDateTime.getMinutes().toString().padStart(2, '0');
      deliveryTime = `${deliveryHours}:${deliveryMinutes}`;
    }
    
    this.tripForm.patchValue({
      // Basic info
      pickupLocation: trip.pickupLocation,
      dropoffLocation: trip.dropoffLocation,
      status: trip.status,
      scheduledPickupDatetime: scheduledDate,
      scheduledPickupTime: `${hours}:${minutes}`,
      brokerId: trip.brokerId,
      orderConfirmation: trip.orderConfirmation || '',
      
      // Vehicle assignment (truck license plate)
      truckId: trip.truckId || trip.lorryId || '',
      
      // Driver assignment
      driverId: trip.driverId,
      driverName: trip.driverName,
      
      // Mileage
      loadedMiles: trip.loadedMiles || trip.distance || 0,
      emptyMiles: trip.emptyMiles || 0,
      
      // Financial details
      orderRate: trip.orderRate || trip.brokerPayment || 0,
      brokerPayment: trip.brokerPayment,
      lorryOwnerPayment: trip.lorryOwnerPayment || 0,
      driverPayment: trip.driverPayment,
      driverRate: trip.driverRate || '',
      
      // Pickup details
      pickupCompany: trip.pickupCompany || '',
      pickupPhone: trip.pickupPhone || '',
      pickupAddress: trip.pickupAddress || '',
      pickupCity: trip.pickupCity || '',
      pickupState: trip.pickupState || '',
      pickupZip: trip.pickupZip || '',
      pickupNotes: trip.pickupNotes || '',
      
      // Delivery details
      deliveryCompany: trip.deliveryCompany || '',
      deliveryPhone: trip.deliveryPhone || '',
      deliveryAddress: trip.deliveryAddress || '',
      deliveryCity: trip.deliveryCity || '',
      deliveryState: trip.deliveryState || '',
      deliveryZip: trip.deliveryZip || '',
      deliveryDate: deliveryDate || '',
      deliveryTime: deliveryTime || '',
      deliveryNotes: trip.deliveryNotes || '',
      
      // Additional fees
      lumperFees: trip.lumperFees || 0,
      detentionFees: trip.detentionFees || 0,
      
      // Fuel management
      fuelAvgCost: trip.fuelAvgCost || '',
      fuelAvgGallonsPerMile: trip.fuelAvgGallonsPerMile || '',
      
      // Notes
      notes: trip.notes || ''
    });
    
    // Trigger total miles calculation
    this.calculateTotalMiles();
  }

  onSubmit(): void {
    if (this.tripForm.invalid || !this.trip) {
      this.markFormGroupTouched(this.tripForm);
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', {
        duration: 3000
      });
      return;
    }

    const formValue = this.tripForm.getRawValue(); // Get all values including disabled fields
    
    // Combine date and time into ISO string
    const date = new Date(formValue.scheduledPickupDatetime);
    const [hours, minutes] = formValue.scheduledPickupTime.split(':');
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    
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
      status: formValue.status,
      scheduledPickupDatetime: date.toISOString(),
      brokerId: formValue.brokerId,
      orderConfirmation: formValue.orderConfirmation?.trim() || undefined,
      
      // Vehicle assignment (truck license plate)
      truckId: formValue.truckId.trim(),
      
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
      lorryOwnerPayment: parseFloat(formValue.lorryOwnerPayment),
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

  getStatusLabel(status: TripStatus): string {
    switch (status) {
      case TripStatus.Scheduled:
        return 'Scheduled';
      case TripStatus.PickedUp:
        return 'Picked Up';
      case TripStatus.InTransit:
        return 'In Transit';
      case TripStatus.Delivered:
        return 'Delivered';
      case TripStatus.Paid:
        return 'Paid';
      case TripStatus.Canceled:
        return 'Canceled';
      default:
        return status;
    }
  }

  calculateProfit(): number {
    // Create a temporary trip object from form values
    const tempTrip: Partial<Trip> = {
      brokerPayment: parseFloat(this.tripForm.get('brokerPayment')?.value) || 0,
      lorryOwnerPayment: parseFloat(this.tripForm.get('lorryOwnerPayment')?.value) || 0,
      driverPayment: parseFloat(this.tripForm.get('driverPayment')?.value) || 0,
      lumperFees: parseFloat(this.tripForm.get('lumperFees')?.value) || 0,
      detentionFees: parseFloat(this.tripForm.get('detentionFees')?.value) || 0,
      fuelAvgCost: parseFloat(this.tripForm.get('fuelAvgCost')?.value) || 0,
      fuelAvgGallonsPerMile: parseFloat(this.tripForm.get('fuelAvgGallonsPerMile')?.value) || 0,
      loadedMiles: parseFloat(this.tripForm.get('loadedMiles')?.value) || 0,
      emptyMiles: parseFloat(this.tripForm.get('emptyMiles')?.value) || 0
    };
    
    return calculateTripProfit(tempTrip as Trip);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  getProfitLabel(): string {
    return this.calculateProfit() >= 0 ? 'Estimated Profit:' : 'Estimated Loss:';
  }

  formatProfitAmount(): string {
    const profit = this.calculateProfit();
    return this.formatCurrency(Math.abs(profit));
  }

}
