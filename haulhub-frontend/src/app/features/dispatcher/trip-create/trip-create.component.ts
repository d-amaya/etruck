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
import { AuthService } from '../../../core/services';
import { AssetCacheService } from '../dashboard/asset-cache.service';
import { DashboardStateService } from '../dashboard/dashboard-state.service';
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
  trucks: any[] = [];
  trailers: any[] = [];
  drivers: any[] = [];
  loading = false;
  loadingBrokers = true;
  loadingAssets = true;
  today = new Date();

  constructor(
    private fb: FormBuilder,
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

  private initializeForm(): void {
    this.tripForm = this.fb.group({
      // Order Information
      orderConfirmation: ['', [Validators.required, Validators.minLength(3)]],
      
      // Schedule Information - Date only
      scheduledTimestamp: ['', Validators.required],
      
      // Broker Information
      brokerId: ['', Validators.required],
      
      // Vehicle Assignment
      truckId: ['', Validators.required],
      trailerId: ['', Validators.required],
      
      // Driver Assignment
      driverId: ['', Validators.required],
      
      // Mileage Tracking (Enhanced)
      mileageOrder: ['', [Validators.required, Validators.min(0)]],
      mileageEmpty: ['', [Validators.required, Validators.min(0)]],
      mileageTotal: [{ value: '', disabled: true }], // Auto-calculated
      
      // Financial Details
      brokerPayment: ['', [Validators.required, Validators.min(0.01)]],
      truckOwnerPayment: ['', [Validators.required, Validators.min(0.01)]],
      driverPayment: ['', [Validators.required, Validators.min(0.01)]],
      
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

  private loadBrokers(): void {
    this.loadingBrokers = true;
    this.dashboardState.brokers$.subscribe(brokers => {
      this.brokers = brokers.filter(b => b.isActive);
      this.loadingBrokers = false;
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
    
    // Get carrierId from auth service
    const carrierId = this.authService.carrierId;
    if (!carrierId) {
      this.snackBar.open('Unable to create trip: Carrier ID not found. Please log in again.', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
      return;
    }
    
    // Convert scheduled date to ISO 8601 (date only, start of day)
    const scheduledDate = new Date(formValue.scheduledTimestamp);
    scheduledDate.setHours(0, 0, 0, 0);
    const scheduledTimestamp = scheduledDate.toISOString().split('.')[0] + 'Z';
    
    // Convert pickup date+time to ISO 8601
    const pickupDate = new Date(formValue.pickupDate);
    const [pickupH, pickupM] = (formValue.pickupTime || '00:00').split(':');
    pickupDate.setHours(parseInt(pickupH), parseInt(pickupM), 0, 0);
    const pickupTimestamp = pickupDate.toISOString().split('.')[0] + 'Z';
    
    // Convert delivery date+time to ISO 8601
    const deliveryDate = new Date(formValue.deliveryDate);
    const [deliveryH, deliveryM] = (formValue.deliveryTime || '00:00').split(':');
    deliveryDate.setHours(parseInt(deliveryH), parseInt(deliveryM), 0, 0);
    const deliveryTimestamp = deliveryDate.toISOString().split('.')[0] + 'Z';
    
    // Get truckOwnerId from selected truck
    const selectedTruck = this.trucks.find(t => t.truckId === formValue.truckId);
    const truckOwnerId = selectedTruck?.truckOwnerId;
    
    if (!truckOwnerId) {
      this.snackBar.open('Selected truck does not have an owner assigned.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    const tripData: CreateTripDto = {
      // Order information
      orderConfirmation: formValue.orderConfirmation.trim(),
      scheduledTimestamp: scheduledTimestamp,
      pickupTimestamp: pickupTimestamp,
      deliveryTimestamp: deliveryTimestamp,
      brokerId: formValue.brokerId,
      
      // Entity relationships
      carrierId: carrierId,
      truckId: formValue.truckId,
      trailerId: formValue.trailerId,
      truckOwnerId: truckOwnerId,
      driverId: formValue.driverId,
      
      // Mileage tracking
      mileageOrder: parseFloat(formValue.mileageOrder),
      mileageEmpty: parseFloat(formValue.mileageEmpty),
      mileageTotal: parseFloat(formValue.mileageTotal),
      
      // Financial details
      brokerPayment: parseFloat(formValue.brokerPayment),
      truckOwnerPayment: parseFloat(formValue.truckOwnerPayment),
      driverPayment: parseFloat(formValue.driverPayment),
      
      // Pickup details
      pickupLocation: `${formValue.pickupCity.trim()}, ${formValue.pickupState.trim()}`,
      pickupCompany: formValue.pickupCompany.trim(),
      pickupAddress: formValue.pickupAddress.trim(),
      pickupCity: formValue.pickupCity.trim(),
      pickupState: formValue.pickupState.trim(),
      pickupZip: formValue.pickupZip.trim(),
      
      // Delivery details
      dropoffLocation: `${formValue.deliveryCity.trim()}, ${formValue.deliveryState.trim()}`,
      deliveryCompany: formValue.deliveryCompany.trim(),
      deliveryAddress: formValue.deliveryAddress.trim(),
      deliveryCity: formValue.deliveryCity.trim(),
      deliveryState: formValue.deliveryState.trim(),
      deliveryZip: formValue.deliveryZip.trim(),

      // Fuel management
      fuelGasAvgCost: parseFloat(formValue.fuelGasAvgCost),
      fuelGasAvgGallxMil: parseFloat(formValue.fuelGasAvgGallxMil),
    };

    // Add optional fields if provided
    if (formValue.pickupPhone?.trim()) tripData.pickupPhone = formValue.pickupPhone.trim();
    if (formValue.pickupNotes?.trim()) tripData.pickupNotes = formValue.pickupNotes.trim();
    if (formValue.deliveryPhone?.trim()) tripData.deliveryPhone = formValue.deliveryPhone.trim();
    if (formValue.deliveryNotes?.trim()) tripData.deliveryNotes = formValue.deliveryNotes.trim();
    if (formValue.notes?.trim()) tripData.notes = formValue.notes.trim();
    if (formValue.lumperValue) tripData.lumperValue = parseFloat(formValue.lumperValue);
    if (formValue.detentionValue) tripData.detentionValue = parseFloat(formValue.detentionValue);
    
    this.loading = true;
    this.tripService.createTrip(tripData).subscribe({
      next: (trip) => {
        this.snackBar.open('Trip created successfully!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
        this.dashboardState.invalidateViewCaches();
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
   * Profit = Broker Payment - (Truck Owner Payment + Driver Payment + Fuel Cost + Lumper Fees + Detention Fees)
   */
  calculateProfit(): number {
    const brokerPayment = parseFloat(this.tripForm.get('brokerPayment')?.value) || 0;
    const truckOwnerPayment = parseFloat(this.tripForm.get('truckOwnerPayment')?.value) || 0;
    const driverPayment = parseFloat(this.tripForm.get('driverPayment')?.value) || 0;
    const lumperValue = parseFloat(this.tripForm.get('lumperValue')?.value) || 0;
    const detentionValue = parseFloat(this.tripForm.get('detentionValue')?.value) || 0;
    
    // Calculate fuel cost if fuel data is provided
    let fuelCost = 0;
    const fuelGasAvgCost = parseFloat(this.tripForm.get('fuelGasAvgCost')?.value) || 0;
    const fuelGasAvgGallxMil = parseFloat(this.tripForm.get('fuelGasAvgGallxMil')?.value) || 0;
    
    if (fuelGasAvgCost > 0 && fuelGasAvgGallxMil > 0) {
      const mileageTotal = parseFloat(this.tripForm.get('mileageTotal')?.value) || 0;
      fuelCost = mileageTotal * fuelGasAvgGallxMil * fuelGasAvgCost;
    }
    
    const totalExpenses = truckOwnerPayment + driverPayment + fuelCost + lumperValue + detentionValue;
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
