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
import { Broker, Trip, TripStatus } from '@haulhub/shared';

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

  // Names for rate labels
  dispatcherName = '';
  driverName = '';
  truckOwnerName = '';

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

      // Resolve names if trip is already loaded
      if (this.trip) {
        const currentUser = this.authService.currentUserValue;
        this.dispatcherName = (currentUser && this.trip.dispatcherId === currentUser.userId)
          ? currentUser.fullName : 'Unknown';
        this.resolveNames(this.trip, cache);
      }
    });
  }

  private resolveNames(trip: any, cache: any): void {
    const driver = cache.drivers?.get(trip.driverId);
    this.driverName = driver?.name || '';
    const truckOwner = cache.truckOwners?.get(trip.truckOwnerId);
    this.truckOwnerName = truckOwner?.name || '';
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
      status: ['', Validators.required],
      scheduledTimestamp: [{ value: '', disabled: true }, Validators.required],
      brokerId: [{ value: '', disabled: true }, Validators.required],
      orderConfirmation: [''],
      truckId: [{ value: '', disabled: true }, Validators.required],
      trailerId: [{ value: '', disabled: true }, Validators.required],
      driverId: [{ value: '', disabled: true }, Validators.required],

      // Mileage
      mileageOrder: ['', [Validators.required, Validators.min(0)]],
      mileageEmpty: ['', [Validators.required, Validators.min(0)]],
      mileageTotal: [{ value: '', disabled: true }],

      // Broker Payment
      brokerPayment: ['', [Validators.required, Validators.min(0.01)]],

      // Rate fields (editable — snapshotted from trip record)
      dispatcherRate: ['', [Validators.min(0)]],
      driverRate: ['', [Validators.min(0)]],
      truckOwnerRate: ['', [Validators.min(0)]],

      // Calculated payment fields (disabled)
      dispatcherPayment: [{ value: '', disabled: true }],
      driverPayment: [{ value: '', disabled: true }],
      truckOwnerPayment: [{ value: '', disabled: true }],

      // Pickup
      pickupCompany: ['', Validators.required],
      pickupPhone: [''],
      pickupAddress: ['', Validators.required],
      pickupCity: ['', Validators.required],
      pickupState: ['', Validators.required],
      pickupZip: ['', Validators.required],
      pickupDate: ['', Validators.required],
      pickupTime: ['', Validators.required],
      pickupNotes: [''],

      // Delivery
      deliveryCompany: ['', Validators.required],
      deliveryPhone: [''],
      deliveryAddress: ['', Validators.required],
      deliveryCity: ['', Validators.required],
      deliveryState: ['', Validators.required],
      deliveryZip: ['', Validators.required],
      deliveryDate: ['', Validators.required],
      deliveryTime: ['', Validators.required],
      deliveryNotes: [''],

      // Fees
      lumperValue: [0, Validators.min(0)],
      detentionValue: [0, Validators.min(0)],

      // Fuel
      fuelGasAvgCost: ['', [Validators.required, Validators.min(0)]],
      fuelGasAvgGallxMil: ['', [Validators.required, Validators.min(0)]],
      estimatedFuelCost: [{ value: '', disabled: true }],

      notes: ['']
    });
    
    this.tripForm.get('mileageOrder')?.valueChanges.subscribe(() => this.calculateTotalMiles());
    this.tripForm.get('mileageEmpty')?.valueChanges.subscribe(() => this.calculateTotalMiles());
    this.tripForm.get('fuelGasAvgCost')?.valueChanges.subscribe(() => this.updateFuelCost());
    this.tripForm.get('fuelGasAvgGallxMil')?.valueChanges.subscribe(() => this.updateFuelCost());

    // Recalculate payments when broker payment or rates change
    this.tripForm.get('brokerPayment')?.valueChanges.subscribe(() => this.recalculatePayments());
    this.tripForm.get('dispatcherRate')?.valueChanges.subscribe(() => this.recalculatePayments());
    this.tripForm.get('driverRate')?.valueChanges.subscribe(() => this.recalculatePayments());
    this.tripForm.get('truckOwnerRate')?.valueChanges.subscribe(() => this.recalculatePayments());

    // Date ordering
    this.tripForm.get('pickupDate')?.valueChanges.subscribe(val => {
      const delivery = this.tripForm.get('deliveryDate')?.value;
      if (val && delivery && new Date(delivery) < new Date(val)) {
        this.tripForm.get('deliveryDate')?.reset();
      }
    });
  }

  private recalculatePayments(): void {
    const brokerPayment = parseFloat(this.tripForm.get('brokerPayment')?.value) || 0;
    const mileageTotal = parseFloat(this.tripForm.get('mileageTotal')?.value) || 0;
    const dispatcherRate = parseFloat(this.tripForm.get('dispatcherRate')?.value) || 0;
    const driverRate = parseFloat(this.tripForm.get('driverRate')?.value) || 0;
    const truckOwnerRate = parseFloat(this.tripForm.get('truckOwnerRate')?.value) || 0;

    const dp = Math.round((dispatcherRate / 100) * brokerPayment * 100) / 100;
    const drp = Math.round(driverRate * mileageTotal * 100) / 100;
    const top = Math.round((truckOwnerRate / 100) * brokerPayment * 100) / 100;

    this.tripForm.get('dispatcherPayment')?.setValue(dp.toFixed(2), { emitEvent: false });
    this.tripForm.get('driverPayment')?.setValue(drp.toFixed(2), { emitEvent: false });
    this.tripForm.get('truckOwnerPayment')?.setValue(top.toFixed(2), { emitEvent: false });
  }
  
  private calculateTotalMiles(): void {
    const mileageOrder = parseFloat(this.tripForm.get('mileageOrder')?.value) || 0;
    const mileageEmpty = parseFloat(this.tripForm.get('mileageEmpty')?.value) || 0;
    this.tripForm.get('mileageTotal')?.setValue(mileageOrder + mileageEmpty, { emitEvent: false });
    this.updateFuelCost();
    this.recalculatePayments();
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

        // Show dispatcher name only if it matches the current user
        const currentUser = this.authService.currentUserValue;
        this.dispatcherName = (currentUser && trip.dispatcherId === currentUser.userId)
          ? currentUser.fullName : 'Unknown';

        // Resolve driver/truck owner names from cache
        const cache = this.assetCache.currentCache;
        if (cache) this.resolveNames(trip, cache);
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to load trip details';
        this.loading = false;
      }
    });
  }

  private populateForm(trip: any): void {
    const scheduledDate = new Date(trip.scheduledTimestamp);
    
    let pickupDateVal: Date | null = null;
    let pickupTimeVal = '';
    if (trip.pickupTimestamp) {
      const d = new Date(trip.pickupTimestamp);
      pickupDateVal = d;
      pickupTimeVal = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    
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
      truckId: trip.truckId,
      trailerId: trip.trailerId,
      driverId: trip.driverId,
      mileageOrder: trip.mileageOrder || 0,
      mileageEmpty: trip.mileageEmpty || 0,
      brokerPayment: trip.brokerPayment,

      // Rate snapshots from trip record
      dispatcherRate: trip.dispatcherRate || '',
      driverRate: trip.driverRate || '',
      truckOwnerRate: trip.truckOwnerRate || '',

      pickupCompany: trip.pickupCompany || '',
      pickupPhone: trip.pickupPhone || '',
      pickupAddress: trip.pickupAddress || '',
      pickupCity: trip.pickupCity || '',
      pickupState: trip.pickupState || '',
      pickupZip: trip.pickupZip || '',
      pickupDate: pickupDateVal,
      pickupTime: pickupTimeVal,
      pickupNotes: trip.pickupNotes || '',
      deliveryCompany: trip.deliveryCompany || '',
      deliveryPhone: trip.deliveryPhone || '',
      deliveryAddress: trip.deliveryAddress || '',
      deliveryCity: trip.deliveryCity || '',
      deliveryState: trip.deliveryState || '',
      deliveryZip: trip.deliveryZip || '',
      deliveryDate: deliveryDateVal,
      deliveryTime: deliveryTimeVal,
      deliveryNotes: trip.deliveryNotes || '',
      lumperValue: trip.lumperValue || 0,
      detentionValue: trip.detentionValue || 0,
      fuelGasAvgCost: trip.fuelGasAvgCost || '',
      fuelGasAvgGallxMil: trip.fuelGasAvgGallxMil || '',
      notes: trip.notes || ''
    }, { emitEvent: false });
    
    this.calculateTotalMiles();
    this.recalculatePayments();
  }

  onSubmit(): void {
    if (this.tripForm.invalid || !this.trip) {
      this.markFormGroupTouched(this.tripForm);
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', { duration: 3000 });
      return;
    }

    const fv = this.tripForm.getRawValue();
    
    let pickupTimestamp: string | undefined;
    if (fv.pickupDate && fv.pickupTime) {
      const d = new Date(fv.pickupDate);
      const [h, m] = fv.pickupTime.split(':');
      d.setHours(parseInt(h), parseInt(m), 0, 0);
      pickupTimestamp = d.toISOString().split('.')[0] + 'Z';
    }
    
    let deliveryTimestamp: string | undefined;
    if (fv.deliveryDate && fv.deliveryTime) {
      const d = new Date(fv.deliveryDate);
      const [h, m] = fv.deliveryTime.split(':');
      d.setHours(parseInt(h), parseInt(m), 0, 0);
      deliveryTimestamp = d.toISOString().split('.')[0] + 'Z';
    }

    const tripData: any = {
      orderStatus: fv.status,
      brokerId: fv.brokerId,
      orderConfirmation: fv.orderConfirmation?.trim() || undefined,
      mileageOrder: parseFloat(fv.mileageOrder),
      mileageEmpty: parseFloat(fv.mileageEmpty),
      mileageTotal: parseFloat(fv.mileageTotal),
      brokerPayment: parseFloat(fv.brokerPayment),
      // Rate snapshots
      dispatcherRate: parseFloat(fv.dispatcherRate) || 0,
      driverRate: parseFloat(fv.driverRate) || 0,
      truckOwnerRate: parseFloat(fv.truckOwnerRate) || 0,
      // Calculated payments
      dispatcherPayment: parseFloat(fv.dispatcherPayment) || 0,
      driverPayment: parseFloat(fv.driverPayment) || 0,
      truckOwnerPayment: parseFloat(fv.truckOwnerPayment) || 0,
      // Locations
      pickupLocation: `${fv.pickupCity?.trim()}, ${fv.pickupState?.trim()}`,
      dropoffLocation: `${fv.deliveryCity?.trim()}, ${fv.deliveryState?.trim()}`,
      pickupCompany: fv.pickupCompany?.trim(),
      pickupPhone: fv.pickupPhone?.trim() || undefined,
      pickupAddress: fv.pickupAddress?.trim(),
      pickupCity: fv.pickupCity?.trim(),
      pickupState: fv.pickupState?.trim(),
      pickupZip: fv.pickupZip?.trim(),
      pickupTimestamp,
      pickupNotes: fv.pickupNotes?.trim() || undefined,
      deliveryCompany: fv.deliveryCompany?.trim(),
      deliveryPhone: fv.deliveryPhone?.trim() || undefined,
      deliveryAddress: fv.deliveryAddress?.trim(),
      deliveryCity: fv.deliveryCity?.trim(),
      deliveryState: fv.deliveryState?.trim(),
      deliveryZip: fv.deliveryZip?.trim(),
      deliveryTimestamp,
      deliveryNotes: fv.deliveryNotes?.trim() || undefined,
      lumperValue: parseFloat(fv.lumperValue) || 0,
      detentionValue: parseFloat(fv.detentionValue) || 0,
      fuelGasAvgCost: fv.fuelGasAvgCost ? parseFloat(fv.fuelGasAvgCost) : undefined,
      fuelGasAvgGallxMil: fv.fuelGasAvgGallxMil ? parseFloat(fv.fuelGasAvgGallxMil) : undefined,
      notes: fv.notes?.trim() || undefined
    };

    this.submitting = true;
    this.tripService.updateTrip(this.trip.tripId, tripData).subscribe({
      next: () => {
        this.snackBar.open('Trip updated successfully!', 'Close', { duration: 3000 });
        this.dashboardState.invalidateViewCaches();
        this.router.navigate(['/dispatcher/dashboard']);
      },
      error: (error) => {
        const errorMessage = error.error?.message || 'Failed to update trip. Please try again.';
        this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
        this.submitting = false;
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/dispatcher/dashboard']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => formGroup.get(key)?.markAsTouched());
  }

  getErrorMessage(fieldName: string): string {
    const control = this.tripForm.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';
    if (control.errors['required']) return 'This field is required';
    if (control.errors['minlength']) return `Minimum length is ${control.errors['minlength'].requiredLength} characters`;
    if (control.errors['min']) return `Value must be at least ${control.errors['min'].min}`;
    return 'Invalid value';
  }

  getStatusLabel(status: TripStatus): string {
    const labels: Record<string, string> = {
      [TripStatus.Scheduled]: 'Scheduled',
      [TripStatus.PickedUp]: 'Picked Up',
      [TripStatus.InTransit]: 'In Transit',
      [TripStatus.Delivered]: 'Delivered',
      [TripStatus.Paid]: 'Paid',
      [TripStatus.Canceled]: 'Canceled',
    };
    return labels[status] || status;
  }

  calculateProfit(): number {
    const brokerPayment = parseFloat(this.tripForm.get('brokerPayment')?.value) || 0;
    const dp = parseFloat(this.tripForm.getRawValue().dispatcherPayment) || 0;
    const drp = parseFloat(this.tripForm.getRawValue().driverPayment) || 0;
    const top = parseFloat(this.tripForm.getRawValue().truckOwnerPayment) || 0;
    const lumper = parseFloat(this.tripForm.get('lumperValue')?.value) || 0;
    const detention = parseFloat(this.tripForm.get('detentionValue')?.value) || 0;
    let fuelCost = 0;
    const avgCost = parseFloat(this.tripForm.get('fuelGasAvgCost')?.value) || 0;
    const avgGall = parseFloat(this.tripForm.get('fuelGasAvgGallxMil')?.value) || 0;
    if (avgCost > 0 && avgGall > 0) {
      fuelCost = (parseFloat(this.tripForm.get('mileageTotal')?.value) || 0) * avgGall * avgCost;
    }
    return brokerPayment - dp - drp - top - fuelCost - lumper - detention;
  }

  getProfitLabel(): string {
    return this.calculateProfit() >= 0 ? 'Estimated Profit:' : 'Estimated Loss:';
  }

  formatProfitAmount(): string {
    return `$${Math.abs(this.calculateProfit()).toFixed(2)}`;
  }
}
