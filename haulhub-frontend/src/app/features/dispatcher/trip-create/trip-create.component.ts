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
import { MatIconModule } from '@angular/material/icon';
import { OrderService } from '../../../core/services';
import { AuthService } from '../../../core/services';
import { AssetCacheService } from '../dashboard/asset-cache.service';
import { DashboardStateService } from '../dashboard/dashboard-state.service';
import { Broker, CreateOrderDto } from '@haulhub/shared';

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
    MatProgressSpinnerModule,
    MatIconModule
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
  truckOwnerMap = new Map<string, any>();
  loading = false;
  loadingBrokers = true;
  loadingAssets = true;
  today = new Date();

  // Current dispatcher info
  currentDispatcherName = '';
  selectedDriverName = '';
  selectedTruckOwnerName = '';

  constructor(
    private fb: FormBuilder,
    private orderService: OrderService,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private assetCache: AssetCacheService,
    private dashboardState: DashboardStateService
  ) {}

  ngOnInit(): void {
    this.currentDispatcherName = this.authService.currentUserValue?.fullName || '';
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
      this.truckOwnerMap = cache.carriers;
      this.loadingAssets = false;
    });
  }

  private initializeForm(): void {
    this.tripForm = this.fb.group({
      // Order Information
      invoiceNumber: ['', [Validators.required, Validators.minLength(3)]],
      scheduledTimestamp: ['', Validators.required],
      brokerId: ['', Validators.required],
      
      // Vehicle & Driver Assignment
      truckId: ['', Validators.required],
      trailerId: ['', Validators.required],
      driverId: ['', Validators.required],
      
      // Mileage
      mileageOrder: ['', [Validators.required, Validators.min(0)]],
      mileageEmpty: ['', [Validators.required, Validators.min(0)]],
      
      // Broker Payment
      orderRate: ['', [Validators.required, Validators.min(0.01)]],
      
      // Rate fields (editable, pre-filled from user records)
      dispatcherRate: ['', [Validators.required, Validators.min(0)]],
      driverRate: ['', [Validators.required, Validators.min(0)]],
      carrierRate: ['', [Validators.required, Validators.min(0)]],
      
      // Calculated payment fields (disabled, auto-calculated)
      dispatcherPayment: [{ value: '', disabled: true }],
      driverPayment: [{ value: '', disabled: true }],
      carrierPayment: [{ value: '', disabled: true }],
      
      // Pickup Details
      pickupCompany: ['', Validators.required],
      pickupPhone: [''],
      pickupAddress: ['', Validators.required],
      pickupCity: ['', Validators.required],
      pickupState: ['', Validators.required],
      pickupZip: ['', Validators.required],
      pickupDate: ['', Validators.required],
      pickupTime: ['', Validators.required],
      pickupNotes: [''],
      
      // Delivery Details
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
      
      // Fuel
      fuelGasAvgCost: ['', [Validators.required, Validators.min(0)]],
      fuelGasAvgGallxMil: ['', [Validators.required, Validators.min(0)]],
      estimatedFuelCost: [{ value: '', disabled: true }],
      
      notes: ['']
    });
    
    // Auto-calculate total miles
    this.tripForm.get('mileageOrder')?.valueChanges.subscribe(() => this.calculateTotalMiles());
    this.tripForm.get('mileageEmpty')?.valueChanges.subscribe(() => this.calculateTotalMiles());
    
    // Auto-calculate fuel cost
    this.tripForm.get('fuelGasAvgCost')?.valueChanges.subscribe(() => this.updateFuelCost());
    this.tripForm.get('fuelGasAvgGallxMil')?.valueChanges.subscribe(() => this.updateFuelCost());

    // Recalculate payments when broker payment changes
    this.tripForm.get('orderRate')?.valueChanges.subscribe(() => this.recalculatePayments());

    // Recalculate payments when rates change
    this.tripForm.get('dispatcherRate')?.valueChanges.subscribe(() => this.recalculatePayments());
    this.tripForm.get('driverRate')?.valueChanges.subscribe(() => this.recalculatePayments());
    this.tripForm.get('carrierRate')?.valueChanges.subscribe(() => this.recalculatePayments());

    // When truck is selected → set truck owner rate
    this.tripForm.get('truckId')?.valueChanges.subscribe(truckId => {
      if (!truckId) return;
      const truck = this.trucks.find(t => t.truckId === truckId);
      if (truck?.carrierId) {
        const owner = this.truckOwnerMap.get(truck.carrierId);
        this.selectedTruckOwnerName = owner?.name || '';
        if (owner?.rate != null) {
          this.tripForm.get('carrierRate')?.setValue(owner.rate);
        }
      }
    });

    // When driver is selected → set driver rate
    this.tripForm.get('driverId')?.valueChanges.subscribe(driverId => {
      if (!driverId) return;
      const driver = this.drivers.find(d => d.userId === driverId);
      this.selectedDriverName = driver?.name || '';
      if (driver?.rate != null) {
        this.tripForm.get('driverRate')?.setValue(driver.rate);
      }
    });

    // Date ordering validation
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

  private recalculatePayments(): void {
    const brokerPayment = parseFloat(this.tripForm.get('orderRate')?.value) || 0;
    const mileageTotal = parseFloat(this.tripForm.get('mileageTotal')?.value) || 0;

    const dispatcherRate = parseFloat(this.tripForm.get('dispatcherRate')?.value) || 0;
    const driverRate = parseFloat(this.tripForm.get('driverRate')?.value) || 0;
    const truckOwnerRate = parseFloat(this.tripForm.get('carrierRate')?.value) || 0;

    const dp = Math.round((dispatcherRate / 100) * brokerPayment * 100) / 100;
    const drp = Math.round(driverRate * mileageTotal * 100) / 100;
    const top = Math.round((truckOwnerRate / 100) * brokerPayment * 100) / 100;

    this.tripForm.get('dispatcherPayment')?.setValue(dp.toFixed(2), { emitEvent: false });
    this.tripForm.get('driverPayment')?.setValue(drp.toFixed(2), { emitEvent: false });
    this.tripForm.get('carrierPayment')?.setValue(top.toFixed(2), { emitEvent: false });
  }
  
  private calculateTotalMiles(): void {
    const mileageOrder = parseFloat(this.tripForm.get('mileageOrder')?.value) || 0;
    const mileageEmpty = parseFloat(this.tripForm.get('mileageEmpty')?.value) || 0;
    const mileageTotal = mileageOrder + mileageEmpty;
    this.tripForm.get('mileageTotal')?.setValue(mileageTotal, { emitEvent: false });
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

    const formValue = this.tripForm.getRawValue();
    
    const carrierId = this.authService.carrierId;
    if (!carrierId) {
      this.snackBar.open('Unable to create order: Carrier ID not found. Please log in again.', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
      return;
    }
    
    const scheduledDate = new Date(formValue.scheduledTimestamp);
    scheduledDate.setHours(0, 0, 0, 0);
    const scheduledTimestamp = scheduledDate.toISOString().split('.')[0] + 'Z';
    
    const pickupDate = new Date(formValue.pickupDate);
    const [pickupH, pickupM] = (formValue.pickupTime || '00:00').split(':');
    pickupDate.setHours(parseInt(pickupH), parseInt(pickupM), 0, 0);
    const pickupTimestamp = pickupDate.toISOString().split('.')[0] + 'Z';
    
    const deliveryDate = new Date(formValue.deliveryDate);
    const [deliveryH, deliveryM] = (formValue.deliveryTime || '00:00').split(':');
    deliveryDate.setHours(parseInt(deliveryH), parseInt(deliveryM), 0, 0);
    const deliveryTimestamp = deliveryDate.toISOString().split('.')[0] + 'Z';
    
    const selectedTruck = this.trucks.find(t => t.truckId === formValue.truckId);
    const truckCarrierId = selectedTruck?.carrierId;
    
    if (!truckCarrierId) {
      this.snackBar.open('Selected truck does not have an owner assigned.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    const tripData: any = {
      adminId: formValue.adminId || carrierId,
      carrierId,
      driverId: formValue.driverId,
      truckId: formValue.truckId,
      trailerId: formValue.trailerId,
      brokerId: formValue.brokerId,
      invoiceNumber: formValue.invoiceNumber.trim(),
      brokerLoad: formValue.brokerLoad?.trim() || '',
      scheduledTimestamp,
      orderRate: parseFloat(formValue.orderRate),
      mileageOrder: parseFloat(formValue.mileageOrder) || undefined,
      mileageEmpty: parseFloat(formValue.mileageEmpty) || undefined,
      driverRate: parseFloat(formValue.driverRate) || undefined,
      fuelGasAvgCost: parseFloat(formValue.fuelGasAvgCost) || undefined,
      fuelGasAvgGallxMil: parseFloat(formValue.fuelGasAvgGallxMil) || undefined,
      // Locations
      pickupCompany: formValue.pickupCompany?.trim() || undefined,
      pickupAddress: formValue.pickupAddress?.trim() || undefined,
      pickupCity: formValue.pickupCity?.trim() || undefined,
      pickupState: formValue.pickupState?.trim() || undefined,
      pickupZip: formValue.pickupZip?.trim() || undefined,
      deliveryCompany: formValue.deliveryCompany?.trim() || undefined,
      deliveryAddress: formValue.deliveryAddress?.trim() || undefined,
      deliveryCity: formValue.deliveryCity?.trim() || undefined,
      deliveryState: formValue.deliveryState?.trim() || undefined,
      deliveryZip: formValue.deliveryZip?.trim() || undefined,
    };

    if (formValue.pickupPhone?.trim()) tripData.pickupPhone = formValue.pickupPhone.trim();
    if (formValue.pickupNotes?.trim()) tripData.pickupNotes = formValue.pickupNotes.trim();
    if (formValue.deliveryPhone?.trim()) tripData.deliveryPhone = formValue.deliveryPhone.trim();
    if (formValue.deliveryNotes?.trim()) tripData.deliveryNotes = formValue.deliveryNotes.trim();
    if (formValue.notes?.trim()) tripData.notes = formValue.notes.trim();
    if (formValue.lumperValue) tripData.lumperValue = parseFloat(formValue.lumperValue);
    if (formValue.detentionValue) tripData.detentionValue = parseFloat(formValue.detentionValue);
    
    this.loading = true;
    this.orderService.createOrder(tripData).subscribe({
      next: () => {
        this.snackBar.open('Order created successfully!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
        this.dashboardState.invalidateViewCaches();
        this.router.navigate(['/dispatcher/dashboard']);
      },
      error: (error: any) => {
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
      formGroup.get(key)?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.tripForm.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';
    if (control.errors['required']) return 'This field is required';
    if (control.errors['minlength']) return `Minimum length is ${control.errors['minlength'].requiredLength} characters`;
    if (control.errors['min']) return `Value must be at least ${control.errors['min'].min}`;
    return 'Invalid value';
  }

  calculateProfit(): number {
    const brokerPayment = parseFloat(this.tripForm.get('orderRate')?.value) || 0;
    const dispatcherPayment = parseFloat(this.tripForm.getRawValue().dispatcherPayment) || 0;
    const driverPayment = parseFloat(this.tripForm.getRawValue().driverPayment) || 0;
    const truckOwnerPayment = parseFloat(this.tripForm.getRawValue().carrierPayment) || 0;
    const lumperValue = parseFloat(this.tripForm.get('lumperValue')?.value) || 0;
    const detentionValue = parseFloat(this.tripForm.get('detentionValue')?.value) || 0;
    
    let fuelCost = 0;
    const fuelGasAvgCost = parseFloat(this.tripForm.get('fuelGasAvgCost')?.value) || 0;
    const fuelGasAvgGallxMil = parseFloat(this.tripForm.get('fuelGasAvgGallxMil')?.value) || 0;
    if (fuelGasAvgCost > 0 && fuelGasAvgGallxMil > 0) {
      const mileageTotal = parseFloat(this.tripForm.get('mileageTotal')?.value) || 0;
      fuelCost = mileageTotal * fuelGasAvgGallxMil * fuelGasAvgCost;
    }
    
    return brokerPayment - dispatcherPayment - driverPayment - truckOwnerPayment - fuelCost - lumperValue - detentionValue;
  }

  getProfitLabel(): string {
    return this.calculateProfit() >= 0 ? 'Estimated Profit:' : 'Estimated Loss:';
  }

  formatProfitAmount(): string {
    return `$${Math.abs(this.calculateProfit()).toFixed(2)}`;
  }
}
