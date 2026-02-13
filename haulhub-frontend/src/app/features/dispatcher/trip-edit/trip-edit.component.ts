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
import { AssetCacheService } from '../dashboard/asset-cache.service';
import { DashboardStateService } from '../dashboard/dashboard-state.service';
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
  today = new Date();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private tripService: TripService,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private assetCache: AssetCacheService,
    private dashboardState: DashboardStateService
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
    this.assetCache.loadAssets().subscribe(cache => {
      this.trucks = Array.from(cache.trucks.values()).filter((t: any) => t.isActive);
      this.trailers = Array.from(cache.trailers.values()).filter((t: any) => t.isActive);
      this.drivers = Array.from(cache.drivers.values()).filter((d: any) => d.isActive);
      this.loadingAssets = false;
    });
  }

  private loadBrokers(): void {
    this.loadingBrokers = true;
    this.dashboardState.brokers$.subscribe(brokers => {
      this.brokers = brokers.filter(b => b.isActive);
      this.loadingBrokers = false;
    });
  }

  private initializeForm(): void {
    this.tripForm = this.fb.group({
      // Status
      status: ['', Validators.required],
      
      // Schedule Information - DISABLED: Cannot be changed after creation (affects GSI keys)
      scheduledTimestamp: [{ value: '', disabled: true }, Validators.required],
      
      // Broker Information
      brokerId: [{ value: '', disabled: true }, Validators.required],
      orderConfirmation: [''],
      
      // Vehicle Assignment - DISABLED: Cannot be changed after creation (affects GSI keys)
      truckId: [{ value: '', disabled: true }, Validators.required],
      trailerId: [{ value: '', disabled: true }, Validators.required],
      
      // Driver Assignment - DISABLED: Cannot be changed after creation (affects GSI keys)
      driverId: [{ value: '', disabled: true }, Validators.required],
      
      // Mileage Tracking (Enhanced)
      mileageOrder: ['', [Validators.required, Validators.min(0)]],
      mileageEmpty: ['', [Validators.required, Validators.min(0)]],
      mileageTotal: [{ value: '', disabled: true }], // Auto-calculated
      
      // Financial Details (Enhanced)
      orderRate: ['', [Validators.required, Validators.min(0.01)]],
      brokerPayment: ['', [Validators.required, Validators.min(0.01)]],
      truckOwnerPayment: ['', [Validators.required, Validators.min(0.01)]],
      driverPayment: ['', [Validators.required, Validators.min(0.01)]],
      driverRate: ['', Validators.min(0)],
      
      // Pickup Details (Required)
      pickupCompany: ['', Validators.required],
      pickupPhone: [''],
      pickupAddress: ['', Validators.required],
      pickupCity: ['', Validators.required],
      pickupState: ['', Validators.required],
      pickupZip: ['', Validators.required],
      pickupDate: ['', Validators.required],
      pickupTime: ['', Validators.required],
      pickupNotes: [''],
      
      // Delivery Details (Required)
      deliveryCompany: ['', Validators.required],
      deliveryPhone: [''],
      deliveryAddress: ['', Validators.required],
      deliveryCity: ['', Validators.required],
      deliveryState: ['', Validators.required],
      deliveryZip: ['', Validators.required],
      deliveryDate: ['', Validators.required],
      deliveryTime: ['', Validators.required],
      deliveryNotes: [''],
      
      // Additional Fees
      lumperValue: [0, Validators.min(0)],
      detentionValue: [0, Validators.min(0)],
      
      // Fuel Management
      fuelGasAvgCost: ['', [Validators.required, Validators.min(0)]],
      fuelGasAvgGallxMil: ['', [Validators.required, Validators.min(0)]],
      estimatedFuelCost: [{ value: '', disabled: true }],
      
      // Notes
      notes: ['']
    });
    
    // Auto-calculate total miles when loaded or empty miles change
    this.tripForm.get('mileageOrder')?.valueChanges.subscribe(() => this.calculateTotalMiles());
    this.tripForm.get('mileageEmpty')?.valueChanges.subscribe(() => this.calculateTotalMiles());
    
    // Auto-calculate fuel cost when inputs change
    this.tripForm.get('fuelGasAvgCost')?.valueChanges.subscribe(() => this.updateFuelCost());
    this.tripForm.get('fuelGasAvgGallxMil')?.valueChanges.subscribe(() => this.updateFuelCost());

    // Clear pickup/delivery dates if they violate ordering
    this.tripForm.get('scheduledTimestamp')?.valueChanges.subscribe(val => {
      const pickup = this.tripForm.get('pickupDate')?.value;
      if (val && pickup && new Date(pickup) < new Date(val)) {
        this.tripForm.get('pickupDate')?.reset();
        this.tripForm.get('deliveryDate')?.reset();
      }
    });
    this.tripForm.get('pickupDate')?.valueChanges.subscribe(val => {
      const delivery = this.tripForm.get('deliveryDate')?.value;
      if (val && delivery && new Date(delivery) < new Date(val)) {
        this.tripForm.get('deliveryDate')?.reset();
      }
    });
  }
  
  private calculateTotalMiles(): void {
    const mileageOrder = parseFloat(this.tripForm.get('mileageOrder')?.value) || 0;
    const mileageEmpty = parseFloat(this.tripForm.get('mileageEmpty')?.value) || 0;
    const mileageTotal = mileageOrder + mileageEmpty;
    this.tripForm.get('mileageTotal')?.setValue(mileageTotal, { emitEvent: false });
    this.updateFuelCost();
  }

  private updateFuelCost(): void {
    const mileageTotal = parseFloat(this.tripForm.get('mileageTotal')?.value) || 0;
    const avgCost = parseFloat(this.tripForm.get('fuelGasAvgCost')?.value) || 0;
    const avgGallPerMile = parseFloat(this.tripForm.get('fuelGasAvgGallxMil')?.value) || 0;
    const cost = (avgCost > 0 && avgGallPerMile > 0) ? mileageTotal * avgGallPerMile * avgCost : 0;
    this.tripForm.get('estimatedFuelCost')?.setValue(cost.toFixed(2), { emitEvent: false });
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
    // Convert scheduledTimestamp to date format for mat-datepicker
    const scheduledDate = new Date(trip.scheduledTimestamp);
    
    // Parse pickup date+time if available
    let pickupDateVal: Date | null = null;
    let pickupTimeVal = '';
    if (trip.pickupTimestamp) {
      const d = new Date(trip.pickupTimestamp);
      pickupDateVal = d;
      pickupTimeVal = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    
    // Parse delivery date+time if available
    let deliveryDateVal: Date | null = null;
    let deliveryTimeVal = '';
    if (trip.deliveryTimestamp) {
      const d = new Date(trip.deliveryTimestamp);
      deliveryDateVal = d;
      deliveryTimeVal = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    
    this.tripForm.patchValue({
      status: trip.orderStatus,
      scheduledTimestamp: scheduledDate,
      brokerId: trip.brokerId,
      orderConfirmation: trip.orderConfirmation || '',
      
      // Vehicle assignment
      truckId: trip.truckId,
      trailerId: trip.trailerId,
      
      // Driver assignment
      driverId: trip.driverId,
      
      // Mileage
      mileageOrder: trip.mileageOrder || 0,
      mileageEmpty: trip.mileageEmpty || 0,
      
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
      pickupDate: pickupDateVal,
      pickupTime: pickupTimeVal,
      pickupNotes: trip.pickupNotes || '',
      
      // Delivery details
      deliveryCompany: trip.deliveryCompany || '',
      deliveryPhone: trip.deliveryPhone || '',
      deliveryAddress: trip.deliveryAddress || '',
      deliveryCity: trip.deliveryCity || '',
      deliveryState: trip.deliveryState || '',
      deliveryZip: trip.deliveryZip || '',
      deliveryDate: deliveryDateVal,
      deliveryTime: deliveryTimeVal,
      deliveryNotes: trip.deliveryNotes || '',
      
      // Additional fees
      lumperValue: trip.lumperValue || 0,
      detentionValue: trip.detentionValue || 0,
      
      // Fuel management
      fuelGasAvgCost: trip.fuelGasAvgCost || '',
      fuelGasAvgGallxMil: trip.fuelGasAvgGallxMil || '',
      
      // Notes
      notes: trip.notes || ''
    }, { emitEvent: false });
    
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
    
    // Convert pickup date+time to ISO 8601
    let pickupTimestamp: string | undefined;
    if (formValue.pickupDate && formValue.pickupTime) {
      const d = new Date(formValue.pickupDate);
      const [h, m] = formValue.pickupTime.split(':');
      d.setHours(parseInt(h), parseInt(m), 0, 0);
      pickupTimestamp = d.toISOString().split('.')[0] + 'Z';
    }
    
    // Convert delivery date+time to ISO 8601
    let deliveryTimestamp: string | undefined;
    if (formValue.deliveryDate && formValue.deliveryTime) {
      const d = new Date(formValue.deliveryDate);
      const [h, m] = formValue.deliveryTime.split(':');
      d.setHours(parseInt(h), parseInt(m), 0, 0);
      deliveryTimestamp = d.toISOString().split('.')[0] + 'Z';
    }

    const tripData: any = {
      // Basic trip info
      pickupLocation: `${formValue.pickupCity?.trim()}, ${formValue.pickupState?.trim()}`,
      dropoffLocation: `${formValue.deliveryCity?.trim()}, ${formValue.deliveryState?.trim()}`,
      orderStatus: formValue.status,
      brokerId: formValue.brokerId,
      orderConfirmation: formValue.orderConfirmation?.trim() || undefined,
      
      // Mileage tracking (enhanced)
      mileageOrder: parseFloat(formValue.mileageOrder),
      mileageEmpty: parseFloat(formValue.mileageEmpty),
      mileageTotal: parseFloat(formValue.mileageTotal),
      
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
      pickupTimestamp: pickupTimestamp,
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
      lumperValue: parseFloat(formValue.lumperValue) || 0,
      detentionValue: parseFloat(formValue.detentionValue) || 0,
      
      // Fuel management
      fuelGasAvgCost: formValue.fuelGasAvgCost ? parseFloat(formValue.fuelGasAvgCost) : undefined,
      fuelGasAvgGallxMil: formValue.fuelGasAvgGallxMil ? parseFloat(formValue.fuelGasAvgGallxMil) : undefined,
      
      // Notes
      notes: formValue.notes?.trim() || undefined
    };

    this.submitting = true;
    this.tripService.updateTrip(this.trip.tripId, tripData).subscribe({
      next: () => {
        this.snackBar.open('Trip updated successfully!', 'Close', {
          duration: 3000
        });
        this.dashboardState.invalidateViewCaches();
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
      lumperValue: parseFloat(this.tripForm.get('lumperValue')?.value) || 0,
      detentionValue: parseFloat(this.tripForm.get('detentionValue')?.value) || 0,
      fuelGasAvgCost: parseFloat(this.tripForm.get('fuelGasAvgCost')?.value) || 0,
      fuelGasAvgGallxMil: parseFloat(this.tripForm.get('fuelGasAvgGallxMil')?.value) || 0,
      mileageOrder: parseFloat(this.tripForm.get('mileageOrder')?.value) || 0,
      mileageEmpty: parseFloat(this.tripForm.get('mileageEmpty')?.value) || 0,
      mileageTotal: (parseFloat(this.tripForm.get('mileageOrder')?.value) || 0) + (parseFloat(this.tripForm.get('mileageEmpty')?.value) || 0),
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
