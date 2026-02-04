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
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TripService } from '../../../../core/services';
import { CarrierService, User } from '../../../../core/services/carrier.service';
import { CarrierFilterService } from '../../shared/carrier-filter.service';
import { Trip, TripStatus, TripFilters, Broker, calculateTripProfit } from '@haulhub/shared';
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
    MatInputModule,
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
  pageSize = 25;
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
    private tripService: TripService,
    private carrierService: CarrierService,
    private filterService: CarrierFilterService,
    private router: Router
  ) {
    this.filterForm = this.fb.group({
      status: [null],
      brokerId: [null],
      dispatcherId: [null],
      driverId: [null],
      truckPlate: ['']
    });
  }

  ngOnInit(): void {
    this.loadFilterOptions();
    this.loadAssets();
    
    // Subscribe to shared date filter
    this.filterService.dateFilter$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadTrips();
      });
    
    // Initial load
    this.loadTrips();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadFilterOptions(): void {
    // Load brokers
    this.tripService.getBrokers().subscribe({
      next: (brokers) => {
        this.brokers = brokers.filter(b => b.isActive);
        this.brokerMap.clear();
        this.brokers.forEach(b => this.brokerMap.set(b.brokerId, b));
      },
      error: (error) => console.error('Error loading brokers:', error)
    });

    // Load dispatchers
    this.carrierService.getUsers('DISPATCHER').subscribe({
      next: (response) => {
        this.dispatchers = response.users.filter(u => u.isActive);
        this.dispatcherMap.clear();
        this.dispatchers.forEach(d => this.dispatcherMap.set(d.userId, d));
      },
      error: (error) => console.error('Error loading dispatchers:', error)
    });

    // Load drivers
    this.carrierService.getUsers('DRIVER').subscribe({
      next: (response) => {
        this.drivers = response.users.filter(u => u.isActive);
        this.driverMap.clear();
        this.drivers.forEach(d => this.driverMap.set(d.userId, d));
      },
      error: (error) => console.error('Error loading drivers:', error)
    });
  }

  private loadAssets(): void {
    // Load trucks
    this.carrierService.getTrucks().subscribe({
      next: (response) => {
        this.trucks = response.trucks.filter(t => t.isActive);
        this.truckMap.clear();
        this.trucks.forEach(t => this.truckMap.set(t.truckId, t));
      },
      error: (error) => console.error('Error loading trucks:', error)
    });

    // Load trailers
    this.carrierService.getTrailers().subscribe({
      next: (response) => {
        this.trailers = response.trailers.filter(t => t.isActive);
        this.trailerMap.clear();
        this.trailers.forEach(t => this.trailerMap.set(t.trailerId, t));
      },
      error: (error) => console.error('Error loading trailers:', error)
    });
  }

  loadTrips(): void {
    this.loading = true;
    const filters = this.buildFilters();
    
    this.tripService.getTrips(filters).subscribe({
      next: (response) => {
        this.trips = response.trips;
        this.totalTrips = response.trips.length;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading trips:', error);
        this.loading = false;
      }
    });
  }

  private buildFilters(): TripFilters {
    const dateFilter = this.filterService.getCurrentFilter();
    const formValue = this.filterForm.value;
    
    console.log('[buildFilters] Form values:', formValue);
    
    const filters: TripFilters = {
      limit: 1000 // Increase limit to ensure all matching trips are fetched
    };

    if (dateFilter.startDate) {
      filters.startDate = dateFilter.startDate.toISOString();
    }
    if (dateFilter.endDate) {
      filters.endDate = dateFilter.endDate.toISOString();
    }
    if (formValue.status) {
      (filters as any).orderStatus = formValue.status;
    }
    if (formValue.brokerId) {
      (filters as any).brokerId = formValue.brokerId;
    }
    if (formValue.dispatcherId) {
      (filters as any).dispatcherId = formValue.dispatcherId;
      console.log('[buildFilters] Including dispatcherId:', formValue.dispatcherId);
    } else {
      console.log('[buildFilters] No dispatcherId selected, value is:', formValue.dispatcherId);
    }
    if (formValue.driverId) {
      (filters as any).driverId = formValue.driverId;
    }
    if (formValue.truckPlate) {
      // truckPlate now contains the truckId directly from the dropdown
      (filters as any).truckId = formValue.truckPlate;
      console.log('[buildFilters] Including truckId:', formValue.truckPlate);
    }

    console.log('[buildFilters] Final filters:', filters);
    return filters;
  }

  onDropdownChange(): void {
    this.pageIndex = 0;
    this.loadTrips();
  }

  onTextInputBlur(): void {
    this.pageIndex = 0;
    this.loadTrips();
  }

  onTextInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.pageIndex = 0;
      this.loadTrips();
    }
  }

  clearField(fieldName: string): void {
    this.filterForm.patchValue({ [fieldName]: '' });
    this.loadTrips();
  }

  clearAllFilters(): void {
    this.filterForm.reset({
      status: null,
      brokerId: null,
      dispatcherId: null,
      driverId: null,
      truckPlate: ''
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

  editTrip(trip: Trip): void {
    this.router.navigate(['/carrier/trips', trip.tripId, 'edit']);
  }

  deleteTrip(trip: Trip): void {
    // TODO: Implement delete with confirmation dialog
    console.log('Delete trip:', trip.tripId);
  }

  createTrip(): void {
    this.router.navigate(['/carrier/trips/create']);
  }

  exportPDF(): void {
    // TODO: Implement PDF export
    console.log('Export PDF');
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
    return !!(formValue.status || formValue.brokerId || formValue.dispatcherId || formValue.driverId || formValue.truckPlate);
  }

  Math = Math;
}
