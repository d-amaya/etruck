import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CarrierService, User } from '../../../../core/services/carrier.service';
import { CarrierFilterService } from '../../shared/carrier-filter.service';
import { CarrierAssetCacheService } from '../../shared/carrier-asset-cache.service';
import { Trip, TripStatus, Broker, calculateTripProfit } from '@haulhub/shared';
import { CarrierChartsWidgetComponent } from '../carrier-charts-widget/carrier-charts-widget.component';

@Component({
  selector: 'app-carrier-trip-table',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatSelectModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    CarrierChartsWidgetComponent
  ],
  templateUrl: './carrier-trip-table.component.html',
  styleUrls: ['./carrier-trip-table.component.scss']
})
export class CarrierTripTableComponent implements OnInit, OnDestroy {
  displayedColumns = [
    'scheduledTimestamp',
    'pickupLocation',
    'dropoffLocation',
    'dispatcherName',
    'brokerName',
    'truckId',
    'driverName',
    'status',
    'revenue',
    'expenses',
    'profitLoss',
    'actions'
  ];

  trips: Trip[] = [];
  totalTrips = 0;
  pageSize = 10;
  pageIndex = 0;
  loading = false;

  filterForm: FormGroup;
  statusOptions = Object.values(TripStatus);
  brokers: Broker[] = [];
  dispatchers: User[] = [];
  drivers: User[] = [];
  trucks: any[] = [];
  trailers: any[] = [];

  // Lookup maps for display
  private brokerMap = new Map<string, Broker>();
  private dispatcherMap = new Map<string, User>();
  private driverMap = new Map<string, User>();
  private truckMap = new Map<string, any>();
  private trailerMap = new Map<string, any>();

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private carrierService: CarrierService,
    private filterService: CarrierFilterService,
    private assetCache: CarrierAssetCacheService,
    private router: Router
  ) {
    this.filterForm = this.fb.group({
      status: [null],
      brokerId: [null],
      dispatcherId: [null],
      driverId: [null],
      truckId: [null]
    });
  }

  ngOnInit(): void {
    // Load assets from cache
    this.assetCache.loadAssets().pipe(
      takeUntil(this.destroy$)
    ).subscribe(cache => {
      this.trucks = Array.from(cache.trucks.values());
      this.trailers = Array.from(cache.trailers.values());
      this.drivers = Array.from(cache.drivers.values());
      this.dispatchers = Array.from(cache.dispatchers.values());
      this.brokers = Array.from(cache.brokers.values());
      
      this.truckMap = cache.trucks;
      this.trailerMap = cache.trailers;
      this.driverMap = cache.drivers;
      this.dispatcherMap = cache.dispatchers;
      this.brokerMap = cache.brokers;
    });
    
    // Subscribe to shared date filter
    this.filterService.dateFilter$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.pageIndex = 0; // Reset to first page on date filter change
        this.loadTrips();
      });
    
    // Initial load
    this.loadTrips();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }


  loadTrips(): void {
    this.loading = true;
    const dateFilter = this.filterService.getCurrentFilter();
    const formValue = this.filterForm.value;
    
    console.log('[CarrierTripTable] Loading trips with pagination:', {
      page: this.pageIndex,
      pageSize: this.pageSize,
      startDate: dateFilter.startDate,
      endDate: dateFilter.endDate,
      filters: formValue
    });
    
    this.carrierService.getDashboardMetrics(
      dateFilter.startDate,
      dateFilter.endDate,
      this.pageIndex,
      this.pageSize,
      formValue.status,
      formValue.brokerId,
      formValue.dispatcherId,
      formValue.driverId,
      formValue.truckId
    ).subscribe({
      next: (response) => {
        console.log('[CarrierTripTable] Received response:', {
          tripsReceived: response.trips.length,
          pagination: response.pagination,
          totalTrips: response.pagination?.totalTrips
        });
        this.trips = response.trips;
        this.totalTrips = response.pagination?.totalTrips || response.trips.length;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading trips:', error);
        this.loading = false;
      }
    });
  }

  onFilterChange(): void {
    this.pageIndex = 0; // Reset to first page when filters change
    this.loadTrips();
  }

  clearAllFilters(): void {
    this.filterForm.reset({
      status: null,
      brokerId: null,
      dispatcherId: null,
      driverId: null,
      truckId: null
    });
    this.pageIndex = 0;
    this.loadTrips();
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.loadTrips();
  }

  viewTrip(trip: Trip): void {
    this.router.navigate(['/carrier/trips', trip.tripId]);
  }

  createTrip(): void {
    this.router.navigate(['/carrier/trips/create']);
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }

  formatTime(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  }

  calculateProfit(trip: Trip): number {
    return calculateTripProfit(trip);
  }

  calculateExpenses(trip: Trip): number {
    return (trip.driverPayment || 0) + (trip.truckOwnerPayment || 0) + (trip.fuelCost || 0);
  }

  getTruckDisplay(truckId: string): string {
    if (!truckId) return 'N/A';
    const truck = this.truckMap.get(truckId);
    return truck ? truck.plate : truckId.substring(0, 8);
  }

  getTrailerDisplay(trailerId: string): string {
    if (!trailerId) return 'N/A';
    const trailer = this.trailerMap.get(trailerId);
    return trailer ? trailer.plate : trailerId.substring(0, 8);
  }

  getDriverDisplay(driverId: string): string {
    if (!driverId) return 'N/A';
    const driver = this.driverMap.get(driverId);
    return driver ? driver.name : driverId.substring(0, 8);
  }

  getBrokerDisplay(brokerId: string): string {
    if (!brokerId) return 'N/A';
    const broker = this.brokerMap.get(brokerId);
    return broker ? broker.brokerName : brokerId;
  }

  getDispatcherDisplay(dispatcherId: string): string {
    if (!dispatcherId) return 'N/A';
    const dispatcher = this.dispatcherMap.get(dispatcherId);
    return dispatcher ? dispatcher.name : dispatcherId.substring(0, 8);
  }

  getStatusClass(status: TripStatus | string): string {
    const statusStr = typeof status === 'string' ? status : status;
    
    switch (statusStr) {
      case TripStatus.Scheduled:
      case 'Scheduled':
        return 'status-scheduled';
      case TripStatus.PickedUp:
      case 'Picked Up':
        return 'status-picked-up';
      case TripStatus.InTransit:
      case 'In Transit':
        return 'status-in-transit';
      case TripStatus.Delivered:
      case 'Delivered':
        return 'status-delivered';
      case TripStatus.Paid:
      case 'Paid':
        return 'status-paid';
      default:
        return '';
    }
  }

  getStatusLabel(status: TripStatus | string): string {
    const statusStr = typeof status === 'string' ? status : status;
    
    switch (statusStr) {
      case TripStatus.Scheduled:
      case 'Scheduled':
        return 'Scheduled';
      case TripStatus.PickedUp:
      case 'Picked Up':
        return 'Picked Up';
      case TripStatus.InTransit:
      case 'In Transit':
        return 'In Transit';
      case TripStatus.Delivered:
      case 'Delivered':
        return 'Delivered';
      case TripStatus.Paid:
      case 'Paid':
        return 'Paid';
      default:
        return String(status);
    }
  }

  getStatusAriaLabel(status: TripStatus): string {
    return `Trip status: ${this.getStatusLabel(status)}`;
  }

  getActionAriaLabel(action: string, tripId: string, destination?: string): string {
    const dest = destination ? ` to ${destination}` : '';
    return `${action} trip${dest}`;
  }

  getProfitAriaLabel(trip: Trip): string {
    const profit = this.calculateProfit(trip);
    const profitText = this.formatCurrency(profit);
    const profitType = profit >= 0 ? 'profit' : 'loss';
    return `${profitType}: ${profitText}`;
  }

  getEmptyStateMessage(): string {
    return 'No trips found matching your filters.';
  }

  get hasActiveFilters(): boolean {
    const formValue = this.filterForm.value;
    return !!(formValue.status || formValue.brokerId || formValue.dispatcherId || formValue.driverId || formValue.truckId);
  }

  Math = Math;
}
