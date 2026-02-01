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
  minDate!: Date;

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Set minimum date to 1 month ago
    this.minDate = new Date();
    this.minDate.setMonth(this.minDate.getMonth() - 1);
    
    this.initializeForm();
    this.loadBrokers();
    this.loadAssets();
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
          duration: 5000,
          panelClass: ['error-snackbar']
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
          duration: 5000,
          panelClass: ['error-snackbar']
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
          duration: 5000,
          panelClass: ['error-snackbar']
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
      // Order Information
      orderConfirmation: ['', [Validators.required, Validators.minLength(3)]],
      
      // Location Information
      pickupLocation: ['', [Validators.required, Validators.minLength(3)]],
      dropoffLocation: ['', [Validators.required, Validators.minLength(3)]],
      
      // Schedule Information - Single datetime picker
      scheduledTimestamp: ['', Validators.required],
      
      // Broker Information
      brokerId: ['', Validators.required],
      
      // Vehicle Assignment
      truckId: ['', Validators.required],
      trailerId: ['', Validators.required],
      
      // Driver Assignment
      driverId: ['', Validators.required],
      
      // Mileage Tracking (Enhanced)
      loadedMiles: ['', [Validators.required, Validators.min(0)]],
      emptyMiles: ['', [Validators.required, Validators.min(0)]],
      totalMiles: [{ value: '', disabled: true }], // Auto-calculated
      
      // Financial Details
      brokerPayment: ['', [Validators.required, Validators.min(0.01)]],
      truckOwnerPayment: ['', [Validators.required, Validators.min(0.01)]],
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
    
    // Get carrierId from auth service
    const carrierId = this.authService.carrierId;
    if (!carrierId) {
      this.snackBar.open('Unable to create trip: Carrier ID not found. Please log in again.', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
      return;
    }
    
    // Convert datetime to ISO 8601 format (without milliseconds)
    const scheduledDate = new Date(formValue.scheduledTimestamp);
    const scheduledTimestamp = scheduledDate.toISOString().split('.')[0] + 'Z';
    
    // Validate that the datetime is in the future
    if (scheduledDate <= new Date()) {
      this.snackBar.open('Scheduled pickup time must be in the future.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }
    
    // Convert delivery datetime if provided
    let deliveryTimestamp: string | undefined;
    if (formValue.deliveryDatetime) {
      const deliveryDate = new Date(formValue.deliveryDatetime);
      deliveryTimestamp = deliveryDate.toISOString().split('.')[0] + 'Z';
    }
    
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
      brokerId: formValue.brokerId,
      
      // Entity relationships
      carrierId: carrierId,
      truckId: formValue.truckId,
      trailerId: formValue.trailerId,
      truckOwnerId: truckOwnerId,
      driverId: formValue.driverId,
      
      // Mileage tracking
      mileageOrder: parseFloat(formValue.loadedMiles),
      mileageEmpty: parseFloat(formValue.emptyMiles),
      mileageTotal: parseFloat(formValue.totalMiles),
      
      // Financial details
      brokerPayment: parseFloat(formValue.brokerPayment),
      truckOwnerPayment: parseFloat(formValue.truckOwnerPayment),
      driverPayment: parseFloat(formValue.driverPayment),
      
      // Legacy fields for backward compatibility
      pickupLocation: formValue.pickupLocation.trim(),
      dropoffLocation: formValue.dropoffLocation.trim(),
      loadedMiles: parseFloat(formValue.loadedMiles),
      emptyMiles: parseFloat(formValue.emptyMiles),
      totalMiles: parseFloat(formValue.totalMiles),
    };

    // Add optional fields if provided
    if (formValue.pickupCompany?.trim()) tripData.pickupCompany = formValue.pickupCompany.trim();
    if (formValue.pickupPhone?.trim()) tripData.pickupPhone = formValue.pickupPhone.trim();
    if (formValue.pickupAddress?.trim()) tripData.pickupAddress = formValue.pickupAddress.trim();
    if (formValue.pickupCity?.trim()) tripData.pickupCity = formValue.pickupCity.trim();
    if (formValue.pickupState?.trim()) tripData.pickupState = formValue.pickupState.trim();
    if (formValue.pickupZip?.trim()) tripData.pickupZip = formValue.pickupZip.trim();
    if (formValue.pickupNotes?.trim()) tripData.pickupNotes = formValue.pickupNotes.trim();
    
    if (formValue.deliveryCompany?.trim()) tripData.deliveryCompany = formValue.deliveryCompany.trim();
    if (formValue.deliveryPhone?.trim()) tripData.deliveryPhone = formValue.deliveryPhone.trim();
    if (formValue.deliveryAddress?.trim()) tripData.deliveryAddress = formValue.deliveryAddress.trim();
    if (formValue.deliveryCity?.trim()) tripData.deliveryCity = formValue.deliveryCity.trim();
    if (formValue.deliveryState?.trim()) tripData.deliveryState = formValue.deliveryState.trim();
    if (formValue.deliveryZip?.trim()) tripData.deliveryZip = formValue.deliveryZip.trim();
    if (deliveryTimestamp) tripData.deliveryTimestamp = deliveryTimestamp;
    if (formValue.deliveryNotes?.trim()) tripData.deliveryNotes = formValue.deliveryNotes.trim();
    
    if (formValue.notes?.trim()) tripData.notes = formValue.notes.trim();
    if (formValue.lumperFees) tripData.lumperFees = parseFloat(formValue.lumperFees);
    if (formValue.detentionFees) tripData.detentionFees = parseFloat(formValue.detentionFees);
    if (formValue.fuelAvgCost) tripData.fuelAvgCost = parseFloat(formValue.fuelAvgCost);
    if (formValue.fuelAvgGallonsPerMile) tripData.fuelAvgGallonsPerMile = parseFloat(formValue.fuelAvgGallonsPerMile);
    
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
   * Profit = Broker Payment - (Truck Owner Payment + Driver Payment + Fuel Cost + Lumper Fees + Detention Fees)
   */
  calculateProfit(): number {
    const brokerPayment = parseFloat(this.tripForm.get('brokerPayment')?.value) || 0;
    const truckOwnerPayment = parseFloat(this.tripForm.get('truckOwnerPayment')?.value) || 0;
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
    
    const totalExpenses = truckOwnerPayment + driverPayment + fuelCost + lumperFees + detentionFees;
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
