import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Observable, startWith, map } from 'rxjs';
import { OrderService } from '../../../core/services/order.service';
import { Order, OrderStatus } from '@haulhub/shared';
import { CarrierAssetCacheService } from '../shared/carrier-asset-cache.service';
import { CarrierDashboardStateService } from '../shared/carrier-dashboard-state.service';
import { CarrierFilterService } from '../shared/carrier-filter.service';

@Component({
  selector: 'app-carrier-trip-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
    MatCardModule, MatSnackBarModule, MatProgressSpinnerModule, MatIconModule,
    MatAutocompleteModule,
  ],
  templateUrl: './carrier-trip-edit.component.html',
  styleUrls: ['./carrier-trip-edit.component.scss']
})
export class CarrierTripEditComponent implements OnInit {
  tripForm!: FormGroup;
  trip?: Order;
  loading = true;
  submitting = false;
  statusOptions = Object.values(OrderStatus);
  drivers: any[] = [];
  trucks: any[] = [];
  trailers: any[] = [];
  filteredDrivers$!: Observable<any[]>;
  filteredTrucks$!: Observable<any[]>;
  filteredTrailers$!: Observable<any[]>;

  // Disabled fields shown for context
  private readonly disabledFields = [
    'scheduledTimestamp', 'brokerName', 'invoiceNumber',
    'driverName', 'truckDisplay', 'trailerDisplay',
    'pickupDate', 'pickupTime', 'pickupCompany', 'pickupPhone',
    'pickupAddress', 'pickupCity', 'pickupState', 'pickupZip',
    'deliveryDate', 'deliveryTime', 'deliveryCompany', 'deliveryPhone',
    'deliveryAddress', 'deliveryCity', 'deliveryState', 'deliveryZip',
    'mileageOrder', 'mileageEmpty', 'carrierPayment',
  ];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private orderService: OrderService,
    private assetCache: CarrierAssetCacheService,
    private dashboardState: CarrierDashboardStateService,
    private filterService: CarrierFilterService,
  ) {}

  ngOnInit(): void {
    const disabled = (v: any = '') => ({ value: v, disabled: true });

    this.tripForm = this.fb.group({
      // Disabled context fields
      scheduledTimestamp: [disabled()],
      brokerName: [disabled()],
      invoiceNumber: [disabled()],
      // Editable assignment fields
      driverId: [''],
      truckId: [''],
      trailerId: [''],
      pickupDate: [disabled()],
      pickupTime: [disabled()],
      pickupCompany: [disabled()],
      pickupPhone: [disabled()],
      pickupAddress: [disabled()],
      pickupCity: [disabled()],
      pickupState: [disabled()],
      pickupZip: [disabled()],
      deliveryDate: [disabled()],
      deliveryTime: [disabled()],
      deliveryCompany: [disabled()],
      deliveryPhone: [disabled()],
      deliveryAddress: [disabled()],
      deliveryCity: [disabled()],
      deliveryState: [disabled()],
      deliveryZip: [disabled()],
      mileageOrder: [disabled()],
      mileageEmpty: [disabled()],
      carrierPayment: [disabled()],

      // Editable fields
      orderStatus: ['', Validators.required],
      driverRate: [0, [Validators.min(0)]],
      driverPayment: [{ value: 0, disabled: true }],
      fuelGasAvgCost: [0, [Validators.min(0)]],
      fuelGasAvgGallxMil: [0, [Validators.min(0)]],
      fuelCost: [{ value: 0, disabled: true }],
      pickupNotes: [''],
      deliveryNotes: [''],
      notes: [''],
    });

    // Auto-calculate driver payment and fuel cost when inputs change
    const recalcFields = ['driverRate', 'fuelGasAvgCost', 'fuelGasAvgGallxMil'];
    recalcFields.forEach(f => this.tripForm.get(f)?.valueChanges.subscribe(() => this.recalcFinances()));

    // Setup autocomplete filters
    this.filteredDrivers$ = this.tripForm.get('driverId')!.valueChanges.pipe(
      startWith(''), map(val => this.filterList(this.drivers, val, 'name', 'userId'))
    );
    this.filteredTrucks$ = this.tripForm.get('truckId')!.valueChanges.pipe(
      startWith(''), map(val => this.filterList(this.trucks, val, 'plate', 'truckId'))
    );
    this.filteredTrailers$ = this.tripForm.get('trailerId')!.valueChanges.pipe(
      startWith(''), map(val => this.filterList(this.trailers, val, 'plate', 'trailerId'))
    );

    const orderId = this.route.snapshot.paramMap.get('orderId');
    if (orderId) this.loadOrder(orderId);
  }

  private loadOrder(orderId: string): void {
    this.orderService.getOrderById(orderId).subscribe({
      next: (order: Order) => {
        this.trip = order;
        this.assetCache.loadAssets().subscribe(cache => {
          this.populateForm(order, cache);
          this.loading = false;
        });
      },
      error: () => {
        this.snackBar.open('Failed to load order', 'Close', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  private populateForm(order: Order, cache: any): void {
    const o = order as any;
    const pickupTs = o.pickupTimestamp ? new Date(o.pickupTimestamp) : null;
    const deliveryTs = o.deliveryTimestamp ? new Date(o.deliveryTimestamp) : null;

    // Populate asset arrays for autocomplete
    this.drivers = Array.from(cache.drivers.values()).filter((d: any) => d.isActive).sort((a: any, b: any) => a.name.localeCompare(b.name));
    this.trucks = Array.from(cache.trucks.values()).filter((t: any) => t.isActive).sort((a: any, b: any) => a.plate.localeCompare(b.plate));
    this.trailers = Array.from(cache.trailers.values()).filter((t: any) => t.isActive).sort((a: any, b: any) => a.plate.localeCompare(b.plate));

    const broker = cache.brokers.get(o.brokerId);

    this.tripForm.patchValue({
      scheduledTimestamp: o.scheduledTimestamp ? new Date(o.scheduledTimestamp).toLocaleDateString() : '',
      brokerName: broker?.brokerName || o.brokerId || '',
      invoiceNumber: o.invoiceNumber || '',
      driverId: o.driverId || '',
      truckId: o.truckId || '',
      trailerId: o.trailerId || '',
      pickupDate: pickupTs ? pickupTs.toLocaleDateString() : '',
      pickupTime: pickupTs ? pickupTs.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      pickupCompany: o.pickupCompany || '',
      pickupPhone: o.pickupPhone || '',
      pickupAddress: o.pickupAddress || '',
      pickupCity: o.pickupCity || '',
      pickupState: o.pickupState || '',
      pickupZip: o.pickupZip || '',
      deliveryDate: deliveryTs ? deliveryTs.toLocaleDateString() : '',
      deliveryTime: deliveryTs ? deliveryTs.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      deliveryCompany: o.deliveryCompany || '',
      deliveryPhone: o.deliveryPhone || '',
      deliveryAddress: o.deliveryAddress || '',
      deliveryCity: o.deliveryCity || '',
      deliveryState: o.deliveryState || '',
      deliveryZip: o.deliveryZip || '',
      mileageOrder: o.mileageOrder || 0,
      mileageEmpty: o.mileageEmpty || 0,
      carrierPayment: o.carrierPayment || 0,
      orderStatus: o.orderStatus || '',
      driverRate: o.driverRate || 0,
      fuelGasAvgCost: o.fuelGasAvgCost || 0,
      fuelGasAvgGallxMil: o.fuelGasAvgGallxMil || 0,
      pickupNotes: o.pickupNotes || '',
      deliveryNotes: o.deliveryNotes || '',
      notes: o.notes || '',
    });
    this.recalcFinances();
    // Re-trigger autocomplete filters with populated arrays
    this.tripForm.get('driverId')?.updateValueAndValidity();
    this.tripForm.get('truckId')?.updateValueAndValidity();
    this.tripForm.get('trailerId')?.updateValueAndValidity();
  }

  profitLoss = 0;

  private recalcFinances(): void {
    const raw = this.tripForm.getRawValue();
    const carrierPayment = parseFloat(raw.carrierPayment) || 0;
    const driverRate = parseFloat(this.tripForm.get('driverRate')?.value) || 0;
    const fuelAvgCost = parseFloat(this.tripForm.get('fuelGasAvgCost')?.value) || 0;
    const fuelAvgGal = parseFloat(this.tripForm.get('fuelGasAvgGallxMil')?.value) || 0;
    const totalMiles = (parseFloat(raw.mileageOrder) || 0) + (parseFloat(raw.mileageEmpty) || 0);

    const driverPayment = Math.round(driverRate * (parseFloat(raw.mileageOrder) || 0) * 100) / 100;
    const fuelCost = Math.round(fuelAvgCost * fuelAvgGal * totalMiles * 100) / 100;

    this.tripForm.get('driverPayment')?.setValue(driverPayment, { emitEvent: false });
    this.tripForm.get('fuelCost')?.setValue(fuelCost, { emitEvent: false });
    this.profitLoss = Math.round((carrierPayment - driverPayment - fuelCost) * 100) / 100;
  }

  private filterList(list: any[], val: string, displayField: string, idField: string): any[] {
    if (!val) return list;
    if (list.some(e => e[idField] === val)) return list;
    const lower = val.toLowerCase();
    return list.filter(e => e[displayField]?.toLowerCase().includes(lower));
  }

  triggerAutocomplete(field: string): void {
    const ctrl = this.tripForm.get(field);
    ctrl?.setValue(ctrl.value || '', { emitEvent: true });
  }

  displayDriver = (id: string): string => this.drivers.find(d => d.userId === id)?.name || '';
  displayTruck = (id: string): string => {
    const t = this.trucks.find(t => t.truckId === id);
    return t ? `${t.brand} ${t.year} — ${t.plate}` : '';
  };
  displayTrailer = (id: string): string => {
    const t = this.trailers.find(t => t.trailerId === id);
    return t ? `${t.brand} ${t.year} — ${t.plate}` : '';
  };

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      Scheduled: 'Scheduled', PickingUp: 'Picking Up', Transit: 'In Transit',
      Delivered: 'Delivered', WaitingRC: 'Waiting RC', ReadyToPay: 'Ready to Pay',
      Canceled: 'Canceled',
    };
    return labels[status] || status;
  }

  onSubmit(): void {
    if (this.tripForm.invalid || !this.trip) return;

    const fv = this.tripForm.value;
    const raw = this.tripForm.getRawValue();
    const driverRate = parseFloat(fv.driverRate) || 0;
    const mileageOrder = parseFloat(raw.mileageOrder) || 0;
    const totalMiles = mileageOrder + (parseFloat(raw.mileageEmpty) || 0);
    const fuelAvgCost = parseFloat(fv.fuelGasAvgCost) || 0;
    const fuelAvgGal = parseFloat(fv.fuelGasAvgGallxMil) || 0;

    const data: any = {
      orderStatus: fv.orderStatus,
      driverId: fv.driverId || undefined,
      truckId: fv.truckId || undefined,
      trailerId: fv.trailerId || undefined,
      driverRate,
      driverPayment: Math.round(driverRate * mileageOrder * 100) / 100,
      fuelGasAvgCost: fuelAvgCost,
      fuelGasAvgGallxMil: fuelAvgGal,
      fuelCost: Math.round(fuelAvgCost * fuelAvgGal * totalMiles * 100) / 100,
      pickupNotes: fv.pickupNotes?.trim() || undefined,
      deliveryNotes: fv.deliveryNotes?.trim() || undefined,
      notes: fv.notes?.trim() || undefined,
    };

    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

    this.submitting = true;
    this.orderService.updateOrder(this.trip.orderId, data).subscribe({
      next: () => {
        this.snackBar.open('Order updated successfully!', 'Close', { duration: 3000 });
        this.filterService.invalidateViewCaches();
        this.dashboardState.invalidateAndReload();
        this.router.navigate(['/carrier/dashboard']);
      },
      error: (err: any) => {
        const msg = err.error?.message || 'Failed to update order';
        this.snackBar.open(msg, 'Close', { duration: 5000 });
        this.submitting = false;
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/carrier/dashboard']);
  }
}
