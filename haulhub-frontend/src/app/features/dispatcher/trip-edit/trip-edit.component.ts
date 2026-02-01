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
import { TripService, AuthService } from '../../../core/services';
import { Broker, CreateTripDto, Trip, TripStatus, calculateTripProfit, calculateFuelCost } from '@haulhub/shared';

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
  trucks: any[] = [];
  trailers: any[] = [];
  drivers: any[] = [];
  loading = true;
  submitting = false;
  loadingBrokers = true;
  loadingAssets = true;
  error?: string;
  statusOptions = Object.values(TripStatus);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private tripService: TripService,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.loadBrokers();
    this.loadAssets();
    
    const tripId = this.route.snapshot.paramMap.get('tripId');
    if (tripId) {
      this.loadTrip(tripId);
    } else {
      this.error = 'No trip ID provided';
      this.loading = false;
    }
  }
  
  private loadAssets(): void {
    this.loadingAssets = true;
    
    // Load trucks, trailers, and drivers from API
    // Backend uses carrierId from JWT token
    this.tripService.getTrucksByCarrier().subscribe({
      next: (trucks) => {
        this.trucks = trucks.filter((t: any) => t.isActive);
        this.checkAssetsLoaded();
      },
      error: (error) => {
        console.error('Error loading trucks:', error);
        this.snackBar.open('Failed to load trucks. Please try again.', 'Close', {
          duration: 5000
        });
        this.checkAssetsLoaded();
      }
    });
    
    this.tripService.getTrailersByCarrier().subscribe({
      next: (trailers) => {
        this.trailers = trailers.filter((t: any) => t.isActive);
        this.checkAssetsLoaded();
      },
      error: (error) => {
        console.error('Error loading trailers:', error);
        this.snackBar.open('Failed to load trailers. Please try again.', 'Close', {
          duration: 5000
        });
        this.checkAssetsLoaded();
      }
    });
    
    this.tripService.getDriversByCarrier().subscribe({
      next: (drivers) => {
        this.drivers = drivers.filter((d: any) => d.isActive);
        this.checkAssetsLoaded();
      },
      error: (error) => {
        console.error('Error loading drivers:', error);
        this.snackBar.open('Failed to load drivers. Please try again.', 'Close', {
          duration: 5000
        });
        this.checkAssetsLoaded();
      }
    });
  }
  
  private assetsLoadedCount = 0;
  private checkAssetsLoaded(): void {
    this.assetsLoadedCount++;
    if (this.assetsLoadedCount >= 3) {
      this.loadingAssets = false;
    }
  }

  private initializeForm(): void {
    this.tripForm = this.fb.group({
      // Location Information
      pickupLocation: ['', [Validators.required, Validators.minLength(3)]],
      dropoffLocation: ['', [Validators.required, Validators.minLength(3)]],
      
      // Status
      status: ['', Validators.required],
      
      // Schedule Information - DISABLED: Cannot be changed after creation (affects GSI keys)
      scheduledTimestamp: [{ value: '', disabled: true }, Validators.required],
      
      // Broker Information
      brokerId: ['', Validators.required],
      orderConfirmation: [''],
      
      // Vehicle Assignment - DISABLED: Cannot be changed after creation (affects GSI keys)
      truckId: [{ value: '', disabled: true }, Validators.required],
      trailerId: [{ value: '', disabled: true }, Validators.required],
      
      // Driver Assignment - DISABLED: Cannot be changed after creation (affects GSI keys)
      driverId: [{ value: '', disabled: true }, Validators.required],
      
      // Mileage Tracking (Enhanced)
      loadedMiles: ['', [Validators.required, Validators.min(0)]],
      emptyMiles: ['', [Validators.required, Validators.min(0)]],
      totalMiles: [{ value: '', disabled: true }], // Auto-calculated
      
      // Financial Details (Enhanced)
      orderRate: ['', [Validators.required, Validators.min(0.01)]],
      brokerPayment: ['', [Validators.required, Validators.min(0.01)]],
      truckOwnerPayment: ['', [Validators.required, Validators.min(0.01)]],
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
      deliveryDatetime: [''],
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

  private populateForm(trip: any): void {
    // Convert scheduledTimestamp to datetime-local format
    const scheduledDate = new Date(trip.scheduledTimestamp);
    const scheduledDatetimeLocal = this.formatDatetimeLocal(scheduledDate);
    
    // Parse delivery datetime if available
    let deliveryDatetimeLocal;
    if (trip.deliveryTimestamp) {
      const deliveryDate = new Date(trip.deliveryTimestamp);
      deliveryDatetimeLocal = this.formatDatetimeLocal(deliveryDate);
    }
    
    // Debug: Log the trip data once
    console.log('Trip data for edit:', {
      fuelGasAvgCost: trip.fuelGasAvgCost,
      fuelGasAvgGallxMil: trip.fuelGasAvgGallxMil,
      mileageTotal: trip.mileageTotal,
      fuelCost: trip.fuelCost,
      calculatedFuel: trip.mileageTotal * trip.fuelGasAvgGallxMil * trip.fuelGasAvgCost
    });
    
    this.tripForm.patchValue({
      // Basic info
      pickupLocation: trip.pickupLocation,
      dropoffLocation: trip.dropoffLocation,
      status: trip.orderStatus,
      scheduledTimestamp: scheduledDatetimeLocal,
      brokerId: trip.brokerId,
      orderConfirmation: trip.orderConfirmation || '',
      
      // Vehicle assignment
      truckId: trip.truckId,
      trailerId: trip.trailerId,
      
      // Driver assignment
      driverId: trip.driverId,
      
      // Mileage
      loadedMiles: trip.mileageOrder || 0,
      emptyMiles: trip.mileageEmpty || 0,
      
      // Financial details
      orderRate: trip.orderRate || trip.brokerPayment || 0,
      brokerPayment: trip.brokerPayment,
      truckOwnerPayment: trip.truckOwnerPayment || 0,
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
      deliveryDatetime: deliveryDatetimeLocal || '',
      deliveryNotes: trip.deliveryNotes || '',
      
      // Additional fees
      lumperFees: trip.lumperValue || 0,
      detentionFees: trip.detentionValue || 0,
      
      // Fuel management
      fuelAvgCost: trip.fuelGasAvgCost || '',
      fuelAvgGallonsPerMile: trip.fuelGasAvgGallxMil || '',
      
      // Notes
      notes: trip.notes || ''
    });
    
    // Trigger total miles calculation
    this.calculateTotalMiles();
  }
  
  private formatDatetimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
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
    
    // Convert delivery datetime if provided
    let deliveryTimestamp: string | undefined;
    if (formValue.deliveryDatetime) {
      deliveryTimestamp = new Date(formValue.deliveryDatetime).toISOString();
    }

    const tripData: any = {
      // Basic trip info
      pickupLocation: formValue.pickupLocation.trim(),
      dropoffLocation: formValue.dropoffLocation.trim(),
      orderStatus: formValue.status,
      brokerId: formValue.brokerId,
      orderConfirmation: formValue.orderConfirmation?.trim() || undefined,
      
      // Mileage tracking (enhanced)
      mileageOrder: parseFloat(formValue.loadedMiles),
      mileageEmpty: parseFloat(formValue.emptyMiles),
      mileageTotal: parseFloat(formValue.totalMiles),
      
      // Financial details (enhanced)
      orderRate: parseFloat(formValue.orderRate),
      brokerPayment: parseFloat(formValue.brokerPayment),
      truckOwnerPayment: parseFloat(formValue.truckOwnerPayment),
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
      deliveryTimestamp: deliveryTimestamp,
      deliveryNotes: formValue.deliveryNotes?.trim() || undefined,
      
      // Additional fees
      lumperValue: parseFloat(formValue.lumperFees) || 0,
      detentionValue: parseFloat(formValue.detentionFees) || 0,
      
      // Fuel management
      fuelGasAvgCost: formValue.fuelAvgCost ? parseFloat(formValue.fuelAvgCost) : undefined,
      fuelGasAvgGallxMil: formValue.fuelAvgGallonsPerMile ? parseFloat(formValue.fuelAvgGallonsPerMile) : undefined,
      
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
    // Create a temporary trip object from form values using new schema field names
    const tempTrip: Partial<Trip> = {
      brokerPayment: parseFloat(this.tripForm.get('brokerPayment')?.value) || 0,
      truckOwnerPayment: parseFloat(this.tripForm.get('truckOwnerPayment')?.value) || 0,
      driverPayment: parseFloat(this.tripForm.get('driverPayment')?.value) || 0,
      lumperValue: parseFloat(this.tripForm.get('lumperFees')?.value) || 0,
      detentionValue: parseFloat(this.tripForm.get('detentionFees')?.value) || 0,
      fuelGasAvgCost: parseFloat(this.tripForm.get('fuelAvgCost')?.value) || 0,
      fuelGasAvgGallxMil: parseFloat(this.tripForm.get('fuelAvgGallonsPerMile')?.value) || 0,
      mileageOrder: parseFloat(this.tripForm.get('loadedMiles')?.value) || 0,
      mileageEmpty: parseFloat(this.tripForm.get('emptyMiles')?.value) || 0,
      mileageTotal: (parseFloat(this.tripForm.get('loadedMiles')?.value) || 0) + (parseFloat(this.tripForm.get('emptyMiles')?.value) || 0),
      fuelCost: 0 // Will be calculated by calculateFuelCost
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
