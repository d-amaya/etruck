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
import { Observable, of } from 'rxjs';
import { OrderService } from '../../../core/services/order.service';
import { Order, OrderStatus } from '@haulhub/shared';
import { AdminAssetCacheService } from '../dashboard/admin-asset-cache.service';
import { AdminDashboardStateService } from '../dashboard/admin-state.service';

@Component({
  selector: 'app-admin-order-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
    MatDatepickerModule, MatNativeDateModule, MatCardModule,
    MatSnackBarModule, MatProgressSpinnerModule, MatIconModule,
    MatAutocompleteModule
  ],
  templateUrl: './admin-order-edit.component.html',
  styleUrls: ['./admin-order-edit.component.scss']
})
export class AdminOrderEditComponent implements OnInit {
  tripForm!: FormGroup;
  trip?: Order;
  loading = true;
  submitting = false;
  loadingAssets = false;
  error?: string;
  statusOptions = Object.values(OrderStatus);
  today = new Date();

  // Empty lists — Admin doesn't need autocomplete
  admins: any[] = [];
  carriers: any[] = [];
  brokers: any[] = [];
  trucks: any[] = [];
  trailers: any[] = [];
  drivers: any[] = [];

  filteredAdmins$: Observable<any[]> = of([]);
  filteredCarriers$: Observable<any[]> = of([]);
  filteredBrokers$: Observable<any[]> = of([]);
  filteredTrucks$: Observable<any[]> = of([]);
  filteredTrailers$: Observable<any[]> = of([]);
  filteredDrivers$: Observable<any[]> = of([]);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private orderService: OrderService,
    private router: Router,
    private snackBar: MatSnackBar,
    private assetCache: AdminAssetCacheService,
    private dashboardState: AdminDashboardStateService
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    const orderId = this.route.snapshot.paramMap.get('orderId');
    if (orderId) this.loadTrip(orderId);
    else { this.error = 'No order ID provided'; this.loading = false; }
  }

  private initializeForm(): void {
    this.tripForm = this.fb.group({
      adminId: [{ value: '', disabled: true }],
      dispatcherId: [{ value: '', disabled: true }],
      carrierId: [{ value: '', disabled: true }],
      brokerId: [{ value: '', disabled: true }],
      truckId: [{ value: '', disabled: true }],
      trailerId: [{ value: '', disabled: true }],
      driverId: [{ value: '', disabled: true }],
      status: [{ value: '', disabled: true }],
      invoiceNumber: [{ value: '', disabled: true }],
      brokerLoad: [{ value: '', disabled: true }],
      scheduledTimestamp: [{ value: '', disabled: true }],
      mileageOrder: [{ value: '', disabled: true }],
      mileageEmpty: [{ value: '', disabled: true }],
      orderRate: [{ value: '', disabled: true }],
      adminRate: [5, [Validators.required, Validators.min(0), Validators.max(100)]],
      adminPayment: [{ value: 0, disabled: true }],
      dispatcherRate: [5, [Validators.required, Validators.min(0), Validators.max(100)]],
      dispatcherPayment: [{ value: 0, disabled: true }],
      carrierPayment: [{ value: 0, disabled: true }],
      carrierRate: [{ value: 0, disabled: true }],
      pickupCompany: [{ value: '', disabled: true }],
      pickupPhone: [{ value: '', disabled: true }],
      pickupAddress: [{ value: '', disabled: true }],
      pickupCity: [{ value: '', disabled: true }],
      pickupState: [{ value: '', disabled: true }],
      pickupZip: [{ value: '', disabled: true }],
      pickupDate: [{ value: '', disabled: true }],
      pickupTime: [{ value: '', disabled: true }],
      pickupNotes: [{ value: '', disabled: true }],
      deliveryCompany: [{ value: '', disabled: true }],
      deliveryPhone: [{ value: '', disabled: true }],
      deliveryAddress: [{ value: '', disabled: true }],
      deliveryCity: [{ value: '', disabled: true }],
      deliveryState: [{ value: '', disabled: true }],
      deliveryZip: [{ value: '', disabled: true }],
      deliveryDate: [{ value: '', disabled: true }],
      deliveryTime: [{ value: '', disabled: true }],
      deliveryNotes: [{ value: '', disabled: true }],
      lumperValue: [{ value: 0, disabled: true }],
      detentionValue: [{ value: 0, disabled: true }],
      notes: [{ value: '', disabled: true }]
    });

    const recalc = () => {
      const rate = parseFloat(this.tripForm.getRawValue().orderRate) || 0;
      const adminPct = parseFloat(this.tripForm.get('adminRate')?.value) || 0;
      const dispPct = parseFloat(this.tripForm.get('dispatcherRate')?.value) || 0;
      const adminPay = Math.round(rate * adminPct) / 100;
      const dispPay = Math.round(rate * dispPct) / 100;
      this.tripForm.get('adminPayment')?.setValue(adminPay, { emitEvent: false });
      this.tripForm.get('dispatcherPayment')?.setValue(dispPay, { emitEvent: false });
      this.tripForm.get('carrierPayment')?.setValue(Math.round((rate - adminPay - dispPay) * 100) / 100, { emitEvent: false });
      this.tripForm.get('carrierRate')?.setValue(Math.round((100 - adminPct - dispPct) * 100) / 100, { emitEvent: false });
    };
    this.tripForm.get('adminRate')?.valueChanges.subscribe(recalc);
    this.tripForm.get('dispatcherRate')?.valueChanges.subscribe(recalc);
  }

  private loadTrip(tripId: string): void {
    this.orderService.getOrderById(tripId).subscribe({
      next: (trip: any) => {
        this.trip = trip;
        this.populateForm(trip);
        this.loading = false;
      },
      error: () => {
        this.snackBar.open('Failed to load order', 'Close', { duration: 5000 });
        this.router.navigate(['/admin/dashboard']);
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
      dispatcherId: trip.dispatcherId || '',
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

  // Display functions — resolve names via AdminAssetCacheService
  displayAdmin = (id: string): string => this.assetCache.getResolvedName(id) || id.substring(0, 8);
  displayDispatcher = (id: string): string => this.assetCache.getResolvedName(id) || id.substring(0, 8);
  displayCarrier = (id: string): string => this.assetCache.getResolvedName(id) || id.substring(0, 8);
  displayBroker = (id: string): string => this.assetCache.getBrokerName(id) || id.substring(0, 8);
  displayTruck = (id: string): string => this.assetCache.getResolvedName(id) || id.substring(0, 8);
  displayTrailer = (id: string): string => this.assetCache.getResolvedName(id) || id.substring(0, 8);
  displayDriver = (id: string): string => this.assetCache.getResolvedName(id) || id.substring(0, 8);

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  get totalRevenue(): number {
    const fv = this.tripForm.getRawValue();
    return Math.round(((parseFloat(fv.orderRate) || 0) + (parseFloat(fv.lumperValue) || 0) + (parseFloat(fv.detentionValue) || 0)) * 100) / 100;
  }

  get adminPayment(): number { return this.tripForm.getRawValue().adminPayment || 0; }
  get dispatcherPayment(): number { return this.tripForm.getRawValue().dispatcherPayment || 0; }
  get carrierPayment(): number { return this.tripForm.getRawValue().carrierPayment || 0; }

  getStatusLabel(status: OrderStatus): string {
    const labels: Record<string, string> = {
      [OrderStatus.Scheduled]: 'Scheduled',
      [OrderStatus.PickingUp]: 'Picked Up',
      [OrderStatus.Transit]: 'In Transit',
      [OrderStatus.Delivered]: 'Delivered',
      [OrderStatus.WaitingRC]: 'Waiting RC',
      [OrderStatus.ReadyToPay]: 'Ready To Pay',
      [OrderStatus.Canceled]: 'Canceled',
    };
    return labels[status] || status;
  }

  onSubmit(): void {
    if (!this.tripForm.get('adminRate')?.valid || !this.tripForm.get('dispatcherRate')?.valid || !this.trip) return;
    this.submitting = true;
    const fv = this.tripForm.getRawValue();
    const dto = {
      adminRate: parseFloat(fv.adminRate) || 0,
      dispatcherRate: parseFloat(fv.dispatcherRate) || 0
    };
    this.orderService.updateOrder(this.trip.orderId, dto as any).subscribe({
      next: () => {
        this.snackBar.open('Rates updated successfully!', 'Close', { duration: 3000 });
        this.dashboardState.invalidateViewCaches();
        this.router.navigate(['/admin/dashboard']);
      },
      error: () => {
        this.submitting = false;
        this.snackBar.open('Failed to update rates', 'Close', { duration: 5000 });
      }
    });
  }

  onCancel(): void { this.router.navigate(['/admin/dashboard']); }
  onCarrierSelected(): void {}
  getErrorMessage(fieldName: string): string { return ''; }
}
