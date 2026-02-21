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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Observable, startWith, map, forkJoin } from 'rxjs';
import { OrderService, Truck, Trailer, Driver } from '../../../core/services/order.service';
import { AuthService } from '../../../core/services';
import { AssetCacheService } from '../dashboard/asset-cache.service';
import { DashboardStateService } from '../dashboard/dashboard-state.service';
import { Broker, Order, OrderStatus } from '@haulhub/shared';

@Component({
  selector: 'app-trip-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
    MatDatepickerModule, MatNativeDateModule, MatCardModule,
    MatSnackBarModule, MatProgressSpinnerModule, MatIconModule,
    MatAutocompleteModule
  ],
  templateUrl: './trip-edit.component.html',
  styleUrls: ['./trip-edit.component.scss']
})
export class TripEditComponent implements OnInit {
  tripForm!: FormGroup;
  trip?: Order;
  loading = true;
  submitting = false;
  loadingAssets = true;
  error?: string;
  statusOptions = Object.values(OrderStatus);
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
    private route: ActivatedRoute,
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

    this.loadingAssets = true;
    this.assetCache.loadAssets().subscribe(cache => {
      this.admins = Array.from(cache.admins.values()).sort((a: any, b: any) => a.name.localeCompare(b.name));
      this.carriers = Array.from(cache.carriers.values()).sort((a: any, b: any) => a.name.localeCompare(b.name));
      this.loadingAssets = false;

      // Load trip after cache is ready so admin/carrier autocompletes display correctly
      const tripId = this.route.snapshot.paramMap.get('orderId') || this.route.snapshot.paramMap.get('tripId');
      if (tripId) {
        this.loadTrip(tripId);
      } else {
        this.error = 'No order ID provided';
        this.loading = false;
      }
    });
  }

  private initializeForm(): void {
    this.tripForm = this.fb.group({
      adminId: ['', Validators.required],
      carrierId: ['', Validators.required],
      brokerId: ['', Validators.required],
      truckId: ['', Validators.required],
      trailerId: ['', Validators.required],
      driverId: ['', Validators.required],
      status: ['', Validators.required],

      invoiceNumber: [''],
      brokerLoad: [''],
      scheduledTimestamp: [{ value: '', disabled: true }, Validators.required],

      mileageOrder: ['', [Validators.required, Validators.min(0)]],
      mileageEmpty: ['', [Validators.required, Validators.min(0)]],

      orderRate: ['', [Validators.required, Validators.min(0.01)]],
      adminRate: [5, [Validators.required, Validators.min(0), Validators.max(100)]],
      adminPayment: [{ value: 0, disabled: true }],
      dispatcherRate: [5, [Validators.required, Validators.min(0), Validators.max(100)]],
      dispatcherPayment: [{ value: 0, disabled: true }],
      carrierPayment: [{ value: 0, disabled: true }],
      carrierRate: [{ value: 0, disabled: true }],

      pickupCompany: ['', Validators.required],
      pickupPhone: [''],
      pickupAddress: ['', Validators.required],
      pickupCity: ['', Validators.required],
      pickupState: ['', Validators.required],
      pickupZip: ['', Validators.required],
      pickupDate: ['', Validators.required],
      pickupTime: ['', Validators.required],
      pickupNotes: [''],

      deliveryCompany: ['', Validators.required],
      deliveryPhone: [''],
      deliveryAddress: ['', Validators.required],
      deliveryCity: ['', Validators.required],
      deliveryState: ['', Validators.required],
      deliveryZip: ['', Validators.required],
      deliveryDate: ['', Validators.required],
      deliveryTime: ['', Validators.required],
      deliveryNotes: [''],

      lumperValue: [0, Validators.min(0)],
      detentionValue: [0, Validators.min(0)],

      notes: ['']
    });

    this.tripForm.get('pickupDate')?.valueChanges.subscribe(val => {
      const delivery = this.tripForm.get('deliveryDate')?.value;
      if (val && delivery && new Date(delivery) < new Date(val)) {
        this.tripForm.get('deliveryDate')?.reset();
      }
    });

    // Recalculate payments when rates or orderRate change
    const recalc = () => {
      const rate = parseFloat(this.tripForm.get('orderRate')?.value) || 0;
      const adminPct = parseFloat(this.tripForm.get('adminRate')?.value) || 0;
      const dispPct = parseFloat(this.tripForm.get('dispatcherRate')?.value) || 0;
      const adminPay = Math.round(rate * adminPct) / 100;
      const dispPay = Math.round(rate * dispPct) / 100;
      const carrierPay = Math.round((rate - adminPay - dispPay) * 100) / 100;
      this.tripForm.get('adminPayment')?.setValue(adminPay, { emitEvent: false });
      this.tripForm.get('dispatcherPayment')?.setValue(dispPay, { emitEvent: false });
      this.tripForm.get('carrierPayment')?.setValue(carrierPay, { emitEvent: false });
      this.tripForm.get('carrierRate')?.setValue(Math.round((100 - adminPct - dispPct) * 100) / 100, { emitEvent: false });
    };
    this.tripForm.get('orderRate')?.valueChanges.subscribe(recalc);
    this.tripForm.get('adminRate')?.valueChanges.subscribe(recalc);
    this.tripForm.get('dispatcherRate')?.valueChanges.subscribe(recalc);
  }

  private setupAutocompleteFilters(): void {
    this.filteredAdmins$ = this.tripForm.get('adminId')!.valueChanges.pipe(
      startWith(''), map(val => this.filterEntities(this.admins, val, 'name'))
    );
    this.filteredCarriers$ = this.tripForm.get('carrierId')!.valueChanges.pipe(
      startWith(''), map(val => this.filterEntities(this.carriers, val, 'name'))
    );
    this.filteredBrokers$ = this.tripForm.get('brokerId')!.valueChanges.pipe(
      startWith(''), map(val => this.filterBrokers(val))
    );
    this.filteredTrucks$ = this.tripForm.get('truckId')!.valueChanges.pipe(
      startWith(''), map(val => this.filterByField(this.trucks, val, 'plate', 'truckId'))
    );
    this.filteredTrailers$ = this.tripForm.get('trailerId')!.valueChanges.pipe(
      startWith(''), map(val => this.filterByField(this.trailers, val, 'plate', 'trailerId'))
    );
    this.filteredDrivers$ = this.tripForm.get('driverId')!.valueChanges.pipe(
      startWith(''), map(val => this.filterEntities(this.drivers, val, 'name'))
    );
  }

  private filterEntities(list: any[], val: string, displayField: string): any[] {
    if (!val) return list;
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

    this.loadCarrierAssets(carrierId, () => {
      // Re-trigger autocomplete filters with new asset lists
      this.tripForm.get('truckId')?.updateValueAndValidity();
      this.tripForm.get('trailerId')?.updateValueAndValidity();
      this.tripForm.get('driverId')?.updateValueAndValidity();
    });
  }

  private loadCarrierAssets(carrierId: string, onComplete?: () => void): void {
    this.orderService.getCarrierAssets(carrierId).subscribe(assets => {
      this.trucks = (assets.trucks || []).filter((t: any) => t.isActive).sort((a: any, b: any) => a.plate.localeCompare(b.plate));
      this.trailers = (assets.trailers || []).filter((t: any) => t.isActive).sort((a: any, b: any) => a.plate.localeCompare(b.plate));
      this.drivers = (assets.drivers || []).filter((d: any) => d.isActive).sort((a: any, b: any) => a.name.localeCompare(b.name));
      if (onComplete) onComplete();
    });
  }

  // ── Display functions ──

  displayAdmin = (id: string): string => this.admins.find(a => a.userId === id)?.name || '';
  displayCarrier = (id: string): string => this.carriers.find(c => c.userId === id)?.name || '';

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
  displayBroker = (id: string): string => this.brokers.find(b => b.brokerId === id)?.brokerName || '';
  displayTruck = (id: string): string => {
    const t = this.trucks.find(t => t.truckId === id);
    return t ? `${t.brand} ${t.year} — ${t.plate}` : '';
  };
  displayTrailer = (id: string): string => {
    const t = this.trailers.find(t => t.trailerId === id);
    return t ? `${t.brand} ${t.year} — ${t.plate}` : '';
  };
  displayDriver = (id: string): string => this.drivers.find(d => d.userId === id)?.name || '';

  // ── Calculated fields ──

  get totalRevenue(): number {
    const orderRate = parseFloat(this.tripForm.get('orderRate')?.value) || 0;
    const lumper = parseFloat(this.tripForm.get('lumperValue')?.value) || 0;
    const detention = parseFloat(this.tripForm.get('detentionValue')?.value) || 0;
    return Math.round((orderRate + lumper + detention) * 100) / 100;
  }

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

  // ── Data loading ──

  private loadBrokers(): void {
    this.dashboardState.brokers$.subscribe(brokers => {
      this.brokers = brokers.filter(b => b.isActive).sort((a, b) => a.brokerName.localeCompare(b.brokerName));
    });
  }

  private loadTrip(tripId: string): void {
    this.loading = true;
    this.orderService.getOrderById(tripId).subscribe({
      next: (trip: any) => {
        this.trip = trip;
        if (trip.carrierId) {
          // Load carrier assets THEN populate form so autocompletes can display
          this.loadCarrierAssets(trip.carrierId, () => {
            this.populateForm(trip);
            this.loading = false;
          });
        } else {
          this.populateForm(trip);
          this.loading = false;
        }
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load order details';
        this.loading = false;
      }
    });
  }

  private populateForm(trip: any): void {
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
      adminId: trip.adminId || '',
      carrierId: trip.carrierId || '',
      brokerId: trip.brokerId,
      truckId: trip.truckId,
      trailerId: trip.trailerId,
      driverId: trip.driverId,
      status: trip.orderStatus,
      invoiceNumber: trip.invoiceNumber || '',
      brokerLoad: trip.brokerLoad || '',
      scheduledTimestamp: new Date(trip.scheduledTimestamp),
      mileageOrder: trip.mileageOrder || 0,
      mileageEmpty: trip.mileageEmpty || 0,
      orderRate: trip.orderRate,
      adminRate: trip.adminRate || 0,
      dispatcherRate: trip.dispatcherRate || 0,
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
      notes: trip.notes || ''
    }, { emitEvent: false });

    // Trigger initial payment calculation
    const rate = trip.orderRate || 0;
    const adminPay = Math.round(rate * (trip.adminRate || 0)) / 100;
    const dispPay = Math.round(rate * (trip.dispatcherRate || 0)) / 100;
    this.tripForm.get('adminPayment')?.setValue(adminPay, { emitEvent: false });
    this.tripForm.get('dispatcherPayment')?.setValue(dispPay, { emitEvent: false });
    this.tripForm.get('carrierPayment')?.setValue(Math.round((rate - adminPay - dispPay) * 100) / 100, { emitEvent: false });
    this.tripForm.get('carrierRate')?.setValue(Math.round((100 - (trip.adminRate || 0) - (trip.dispatcherRate || 0)) * 100) / 100, { emitEvent: false });
  }

  getStatusLabel(status: OrderStatus): string {
    const labels: Record<string, string> = {
      [OrderStatus.Scheduled]: 'Scheduled',
      [OrderStatus.PickingUp]: 'Picked Up',
      [OrderStatus.Transit]: 'In Transit',
      [OrderStatus.Delivered]: 'Delivered',
      [OrderStatus.WaitingRC]: 'Waiting RC',
      [OrderStatus.ReadyToPay]: 'Ready to Pay',
      [OrderStatus.Canceled]: 'Canceled',
    };
    return labels[status] || status;
  }

  // ── Submit ──

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

    const data: any = {
      orderStatus: fv.status,
      adminId: fv.adminId,
      carrierId: fv.carrierId,
      driverId: fv.driverId,
      truckId: fv.truckId,
      trailerId: fv.trailerId,
      brokerId: fv.brokerId,
      invoiceNumber: fv.invoiceNumber?.trim() || undefined,
      brokerLoad: fv.brokerLoad?.trim() || undefined,
      scheduledTimestamp: fv.scheduledTimestamp ? new Date(fv.scheduledTimestamp).toISOString() : undefined,
      mileageOrder: parseFloat(fv.mileageOrder),
      mileageEmpty: parseFloat(fv.mileageEmpty),
      orderRate: parseFloat(fv.orderRate),
      adminRate: parseFloat(fv.adminRate) || 0,
      dispatcherRate: parseFloat(fv.dispatcherRate) || 0,
      adminPayment: parseFloat(fv.adminPayment) || 0,
      dispatcherPayment: parseFloat(fv.dispatcherPayment) || 0,
      carrierPayment: parseFloat(fv.carrierPayment) || 0,
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
      notes: fv.notes?.trim() || undefined
    };

    this.submitting = true;
    this.orderService.updateOrder(this.trip.orderId, data).subscribe({
      next: () => {
        this.snackBar.open('Order updated successfully!', 'Close', { duration: 3000 });
        this.dashboardState.invalidateViewCaches();
        this.router.navigate(['/dispatcher/dashboard']);
      },
      error: (error: any) => {
        const msg = error.error?.message || 'Failed to update order. Please try again.';
        this.snackBar.open(msg, 'Close', { duration: 5000 });
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
}
