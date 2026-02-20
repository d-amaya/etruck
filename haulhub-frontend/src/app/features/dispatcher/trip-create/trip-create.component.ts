import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Observable, startWith, map, forkJoin } from 'rxjs';
import { OrderService, Truck, Trailer, Driver } from '../../../core/services/order.service';
import { AuthService } from '../../../core/services';
import { AssetCacheService } from '../dashboard/asset-cache.service';
import { DashboardStateService } from '../dashboard/dashboard-state.service';
import { Broker } from '@haulhub/shared';

@Component({
  selector: 'app-trip-create',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatDatepickerModule, MatNativeDateModule, MatCardModule,
    MatSnackBarModule, MatProgressSpinnerModule, MatIconModule,
    MatAutocompleteModule
  ],
  templateUrl: './trip-create.component.html',
  styleUrls: ['./trip-create.component.scss']
})
export class TripCreateComponent implements OnInit {
  tripForm!: FormGroup;
  loading = false;
  loadingAssets = true;
  today = new Date();

  // Entity lists
  admins: any[] = [];
  carriers: any[] = [];
  brokers: Broker[] = [];
  trucks: Truck[] = [];
  trailers: Trailer[] = [];
  drivers: Driver[] = [];

  // Autocomplete filtered observables
  filteredAdmins$!: Observable<any[]>;
  filteredCarriers$!: Observable<any[]>;
  filteredBrokers$!: Observable<Broker[]>;
  filteredTrucks$!: Observable<Truck[]>;
  filteredTrailers$!: Observable<Trailer[]>;
  filteredDrivers$!: Observable<Driver[]>;

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
    this.initializeForm();
    this.setupAutocompleteFilters();
    this.loadBrokers();

    // Force-refresh cache for fresh data on create page
    this.loadingAssets = true;
    this.assetCache.forceRefresh().subscribe(cache => {
      this.admins = Array.from(cache.admins.values()).sort((a: any, b: any) => a.name.localeCompare(b.name));
      this.carriers = Array.from(cache.carriers.values()).sort((a: any, b: any) => a.name.localeCompare(b.name));
      this.loadingAssets = false;
    });
  }

  private initializeForm(): void {
    this.tripForm = this.fb.group({
      // Entity selection
      adminId: ['', Validators.required],
      carrierId: ['', Validators.required],
      brokerId: ['', Validators.required],
      truckId: ['', Validators.required],
      trailerId: ['', Validators.required],
      driverId: ['', Validators.required],

      // Order info
      invoiceNumber: ['', [Validators.required, Validators.minLength(3)]],
      brokerLoad: [''],
      scheduledTimestamp: ['', Validators.required],

      // Mileage
      mileageOrder: ['', [Validators.required, Validators.min(0)]],
      mileageEmpty: ['', [Validators.required, Validators.min(0)]],

      // Financial
      orderRate: ['', [Validators.required, Validators.min(0.01)]],
      adminRate: [{ value: 5, disabled: true }],
      dispatcherRate: [{ value: 5, disabled: true }],

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

      notes: ['']
    });

    // Date ordering
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

  private setupAutocompleteFilters(): void {
    this.filteredAdmins$ = this.tripForm.get('adminId')!.valueChanges.pipe(
      startWith(''),
      map(val => this.filterEntities(this.admins, val, 'name'))
    );
    this.filteredCarriers$ = this.tripForm.get('carrierId')!.valueChanges.pipe(
      startWith(''),
      map(val => this.filterEntities(this.carriers, val, 'name'))
    );
    this.filteredBrokers$ = this.tripForm.get('brokerId')!.valueChanges.pipe(
      startWith(''),
      map(val => this.filterBrokers(val))
    );
    this.filteredTrucks$ = this.tripForm.get('truckId')!.valueChanges.pipe(
      startWith(''),
      map(val => this.filterByField(this.trucks, val, 'plate', 'truckId'))
    );
    this.filteredTrailers$ = this.tripForm.get('trailerId')!.valueChanges.pipe(
      startWith(''),
      map(val => this.filterByField(this.trailers, val, 'plate', 'trailerId'))
    );
    this.filteredDrivers$ = this.tripForm.get('driverId')!.valueChanges.pipe(
      startWith(''),
      map(val => this.filterEntities(this.drivers, val, 'name'))
    );
  }

  private filterEntities(list: any[], val: string, displayField: string): any[] {
    if (!val) return list;
    // If val matches an ID, show all (user selected an option)
    if (list.some(e => e.userId === val)) return list;
    const lower = val.toLowerCase();
    return list.filter(e => e[displayField]?.toLowerCase().includes(lower));
  }

  private filterBrokers(val: string): Broker[] {
    if (!val) return this.brokers;
    if (this.brokers.some(b => b.brokerId === val)) return this.brokers;
    const lower = val.toLowerCase();
    return this.brokers.filter(b => b.brokerName.toLowerCase().includes(lower));
  }

  private filterByField<T extends Record<string, any>>(list: T[], val: string, displayField: string, idField: string): T[] {
    if (!val) return list;
    if (list.some(e => e[idField] === val)) return list;
    const lower = val.toLowerCase();
    return list.filter(e => e[displayField]?.toLowerCase().includes(lower));
  }

  // ── Cascading: Carrier selection → load assets ──

  onCarrierSelected(): void {
    const carrierId = this.tripForm.get('carrierId')?.value;
    if (!carrierId || !this.carriers.some(c => c.userId === carrierId)) return;

    this.tripForm.patchValue({ truckId: '', trailerId: '', driverId: '' });
    this.trucks = [];
    this.trailers = [];
    this.drivers = [];

    forkJoin({
      trucks: this.orderService.getTrucksByCarrier(carrierId),
      trailers: this.orderService.getTrailersByCarrier(carrierId),
      drivers: this.orderService.getDriversByCarrier(carrierId),
    }).subscribe(({ trucks, trailers, drivers }) => {
      this.trucks = (trucks.trucks || []).filter(t => t.isActive).sort((a, b) => a.plate.localeCompare(b.plate));
      this.trailers = (trailers.trailers || []).filter(t => t.isActive).sort((a, b) => a.plate.localeCompare(b.plate));
      this.drivers = (drivers.users || []).filter(d => d.isActive).sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  onDriverSelected(): void {
    const driverId = this.tripForm.get('driverId')?.value;
    const driver = this.drivers.find(d => d.userId === driverId);
    // driverRate auto-populated but hidden from dispatcher — stored for backend
    if (driver) {
      (this as any)._driverRate = (driver as any).rate || 0;
    }
  }

  onTruckSelected(): void {
    const truckId = this.tripForm.get('truckId')?.value;
    const truck = this.trucks.find(t => t.truckId === truckId);
    // Fuel defaults auto-populated but hidden from dispatcher
    if (truck) {
      (this as any)._fuelGasAvgCost = (truck as any).fuelGasAvgCost || 0;
      (this as any)._fuelGasAvgGallxMil = (truck as any).fuelGasAvgGallxMil || 0;
    }
  }

  // ── Display functions for autocomplete ──

  displayAdmin = (id: string): string => {
    return this.admins.find(a => a.userId === id)?.name || '';
  };

  displayCarrier = (id: string): string => {
    return this.carriers.find(c => c.userId === id)?.name || '';
  };

  displayBroker = (id: string): string => {
    return this.brokers.find(b => b.brokerId === id)?.brokerName || '';
  };

  displayTruck = (id: string): string => {
    const t = this.trucks.find(t => t.truckId === id);
    return t ? `${t.brand} ${t.year} — ${t.plate}` : '';
  };

  displayTrailer = (id: string): string => {
    const t = this.trailers.find(t => t.trailerId === id);
    return t ? `${t.brand} ${t.year} — ${t.plate}` : '';
  };

  displayDriver = (id: string): string => {
    return this.drivers.find(d => d.userId === id)?.name || '';
  };

  // ── Calculated fields ──

  get adminPayment(): number {
    const rate = this.tripForm.getRawValue().adminRate || 0;
    const orderRate = parseFloat(this.tripForm.get('orderRate')?.value) || 0;
    return Math.round((rate / 100) * orderRate * 100) / 100;
  }

  get dispatcherPayment(): number {
    const rate = this.tripForm.getRawValue().dispatcherRate || 0;
    const orderRate = parseFloat(this.tripForm.get('orderRate')?.value) || 0;
    return Math.round((rate / 100) * orderRate * 100) / 100;
  }

  get carrierPayment(): number {
    const orderRate = parseFloat(this.tripForm.get('orderRate')?.value) || 0;
    return Math.round(orderRate * 0.9 * 100) / 100;
  }

  // ── Brokers ──

  private loadBrokers(): void {
    this.dashboardState.brokers$.subscribe(brokers => {
      this.brokers = brokers.filter(b => b.isActive).sort((a, b) => a.brokerName.localeCompare(b.brokerName));
    });
  }

  // ── Submit ──

  onSubmit(): void {
    if (this.tripForm.invalid) {
      this.markFormGroupTouched(this.tripForm);
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', {
        duration: 3000, panelClass: ['error-snackbar']
      });
      return;
    }

    const fv = this.tripForm.getRawValue();

    const scheduledTimestamp = this.toISOTimestamp(fv.scheduledTimestamp);
    const pickupTimestamp = this.toISOTimestampWithTime(fv.pickupDate, fv.pickupTime);
    const deliveryTimestamp = this.toISOTimestampWithTime(fv.deliveryDate, fv.deliveryTime);

    const data: any = {
      adminId: fv.adminId,
      carrierId: fv.carrierId,
      driverId: fv.driverId,
      truckId: fv.truckId,
      trailerId: fv.trailerId,
      brokerId: fv.brokerId,
      invoiceNumber: fv.invoiceNumber.trim(),
      brokerLoad: fv.brokerLoad?.trim() || '',
      scheduledTimestamp,
      orderRate: parseFloat(fv.orderRate),
      mileageOrder: parseFloat(fv.mileageOrder) || undefined,
      mileageEmpty: parseFloat(fv.mileageEmpty) || undefined,
      driverRate: (this as any)._driverRate || undefined,
      fuelGasAvgCost: (this as any)._fuelGasAvgCost || undefined,
      fuelGasAvgGallxMil: (this as any)._fuelGasAvgGallxMil || undefined,
      pickupCompany: fv.pickupCompany?.trim() || undefined,
      pickupAddress: fv.pickupAddress?.trim() || undefined,
      pickupCity: fv.pickupCity?.trim() || undefined,
      pickupState: fv.pickupState?.trim() || undefined,
      pickupZip: fv.pickupZip?.trim() || undefined,
      deliveryCompany: fv.deliveryCompany?.trim() || undefined,
      deliveryAddress: fv.deliveryAddress?.trim() || undefined,
      deliveryCity: fv.deliveryCity?.trim() || undefined,
      deliveryState: fv.deliveryState?.trim() || undefined,
      deliveryZip: fv.deliveryZip?.trim() || undefined,
    };

    if (fv.pickupPhone?.trim()) data.pickupPhone = fv.pickupPhone.trim();
    if (fv.pickupNotes?.trim()) data.pickupNotes = fv.pickupNotes.trim();
    if (fv.deliveryPhone?.trim()) data.deliveryPhone = fv.deliveryPhone.trim();
    if (fv.deliveryNotes?.trim()) data.deliveryNotes = fv.deliveryNotes.trim();
    if (fv.notes?.trim()) data.notes = fv.notes.trim();
    if (fv.lumperValue) data.lumperValue = parseFloat(fv.lumperValue);
    if (fv.detentionValue) data.detentionValue = parseFloat(fv.detentionValue);

    this.loading = true;
    this.orderService.createOrder(data).subscribe({
      next: () => {
        this.snackBar.open('Order created successfully!', 'Close', {
          duration: 3000, panelClass: ['success-snackbar']
        });
        this.dashboardState.invalidateViewCaches();
        this.router.navigate(['/dispatcher/dashboard']);
      },
      error: (error: any) => {
        const msg = error.error?.message || 'Failed to create order. Please try again.';
        this.snackBar.open(msg, 'Close', { duration: 5000, panelClass: ['error-snackbar'] });
        this.loading = false;
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/dispatcher/dashboard']);
  }

  getErrorMessage(fieldName: string): string {
    const control = this.tripForm.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';
    if (control.errors['required']) return 'This field is required';
    if (control.errors['minlength']) return `Minimum length is ${control.errors['minlength'].requiredLength} characters`;
    if (control.errors['min']) return `Value must be at least ${control.errors['min'].min}`;
    return 'Invalid value';
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => formGroup.get(key)?.markAsTouched());
  }

  private toISOTimestamp(date: any): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('.')[0] + 'Z';
  }

  private toISOTimestampWithTime(date: any, time: string): string {
    const d = new Date(date);
    const [h, m] = (time || '00:00').split(':');
    d.setHours(parseInt(h), parseInt(m), 0, 0);
    return d.toISOString().split('.')[0] + 'Z';
  }
}
