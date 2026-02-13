import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TripService } from '../../../core/services';
import { CarrierService, User } from '../../../core/services/carrier.service';
import { CarrierFilterService } from '../shared/carrier-filter.service';
import { CarrierUnifiedFilterCardComponent } from '../shared/unified-filter-card/unified-filter-card.component';
import { Trip, TripStatus, TripFilters, Broker, calculateTripProfit } from '@haulhub/shared';

@Component({
  selector: 'app-carrier-trip-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatChipsModule,
    MatMenuModule,
    MatTooltipModule,
    CarrierUnifiedFilterCardComponent
  ],
  templateUrl: './trip-list.component.html',
  styleUrls: ['./trip-list.component.scss']
})
export class CarrierTripListComponent implements OnInit {
  displayedColumns: string[] = [
    'scheduledTimestamp',
    'pickupLocation',
    'dropoffLocation',
    'dispatcherName',
    'driverName',
    'brokerName',
    'truckId',
    'status',
    'revenue',
    'expenses',
    'profitLoss',
    'actions'
  ];

  trips: Trip[] = [];
  brokers: Broker[] = [];
  dispatchers: User[] = [];
  drivers: User[] = [];
  loading = false;
  filterForm: FormGroup;
  
  // Pagination
  pageSize = 10;
  pageIndex = 0;
  totalTrips = 0;
  lastEvaluatedKey?: string;
  paginationKeys: Map<number, string> = new Map(); // Track keys for each page

  // Status options
  statusOptions = Object.values(TripStatus);
  TripStatus = TripStatus;

  constructor(
    private tripService: TripService,
    private carrierService: CarrierService,
    private filterService: CarrierFilterService,
    private router: Router,
    private fb: FormBuilder
  ) {
    // Remove default date range - will use shared filter service
    this.filterForm = this.fb.group({
      startDate: [null],
      endDate: [null],
      dispatcherId: [''],
      driverId: [''],
      brokerId: [''],
      truckId: [''],
      status: ['']
    });
  }

  ngOnInit(): void {
    this.loadFilterOptions();
    
    // Subscribe to shared date filter
    this.filterService.dateFilter$.subscribe(dateFilter => {
      this.filterForm.patchValue({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate
      }, { emitEvent: false });
      this.loadTrips();
    });
  }

  private loadFilterOptions(): void {
    // Load brokers
    this.tripService.getBrokers().subscribe({
      next: (brokers) => {
        this.brokers = brokers.filter(b => b.isActive);
      },
      error: (error) => {
        console.error('Error loading brokers:', error);
      }
    });

    // Load dispatchers
    this.carrierService.getUsers('DISPATCHER').subscribe({
      next: (response) => {
        this.dispatchers = response.users.filter(u => u.isActive);
      },
      error: (error) => {
        console.error('Error loading dispatchers:', error);
      }
    });

    // Load drivers
    this.carrierService.getUsers('DRIVER').subscribe({
      next: (response) => {
        this.drivers = response.users.filter(u => u.isActive);
      },
      error: (error) => {
        console.error('Error loading drivers:', error);
      }
    });
  }

  loadTrips(): void {
    this.loading = true;
    const filters = this.buildFilters();
    
    this.tripService.getTrips(filters).subscribe({
      next: (response) => {
        // Removed debug log
        
        this.trips = response.trips;
        
        // Store the key for navigating to the NEXT page
        if (response.lastEvaluatedKey) {
          this.paginationKeys.set(this.pageIndex + 1, response.lastEvaluatedKey);
        }
        
        // Update lastEvaluatedKey for display purposes
        this.lastEvaluatedKey = response.lastEvaluatedKey;
        
        // Calculate totalTrips to control paginator behavior
        // If there's a lastEvaluatedKey, we know there are more pages
        if (response.lastEvaluatedKey) {
          // Set total to at least one more page than current
          // This ensures the "next" button stays enabled
          this.totalTrips = (this.pageIndex + 2) * this.pageSize;
        } else {
          // No more pages - set exact total
          this.totalTrips = (this.pageIndex * this.pageSize) + response.trips.length;
        }
        
        // Safety check: ensure totalTrips is at least the number of trips we have
        if (this.totalTrips < response.trips.length) {
          // Removed debug warning
          this.totalTrips = response.trips.length;
        }
        
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading trips:', error);
        this.loading = false;
      }
    });
  }

  private buildFilters(): TripFilters {
    const formValue = this.filterForm.value;
    const filters: TripFilters = {
      limit: 1000 // Increase limit to ensure all matching trips are fetched
    };

    if (formValue.startDate) {
      const d = new Date(formValue.startDate);
      filters.startDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00.000Z`;
    }

    if (formValue.endDate) {
      const d = new Date(formValue.endDate);
      filters.endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59:59.999Z`;
    }

    // Note: TripFilters interface doesn't have these properties yet
    // The backend will need to handle these filters via query params
    // For now, we'll pass them as part of the filters object
    if (formValue.dispatcherId) {
      (filters as any).dispatcherId = formValue.dispatcherId;
    }

    if (formValue.driverId) {
      (filters as any).driverId = formValue.driverId;
    }

    if (formValue.brokerId) {
      (filters as any).brokerId = formValue.brokerId;
    }

    if (formValue.truckId) {
      (filters as any).truckId = formValue.truckId.trim();
    }

    if (formValue.status) {
      (filters as any).orderStatus = formValue.status;
    }

    // Include lastEvaluatedKey if available (for pagination)
    if (this.lastEvaluatedKey) {
      filters.lastEvaluatedKey = this.lastEvaluatedKey;
    }

    return filters;
  }

  onApplyFilters(): void {
    this.pageIndex = 0;
    this.lastEvaluatedKey = undefined;
    this.paginationKeys.clear();
    this.loadTrips();
  }

  onClearFilters(): void {
    this.filterForm.reset({
      startDate: null,
      endDate: null,
      dispatcherId: '',
      driverId: '',
      brokerId: '',
      truckId: '',
      status: ''
    });
    this.pageIndex = 0;
    this.lastEvaluatedKey = undefined;
    this.paginationKeys.clear();
    this.loadTrips();
  }

  onPageChange(event: PageEvent): void {
    const oldPageSize = this.pageSize;
    this.pageSize = event.pageSize;
    
    // If page size changed, reset pagination
    if (oldPageSize !== event.pageSize) {
      this.pageIndex = 0;
      this.lastEvaluatedKey = undefined;
      this.paginationKeys.clear();
      this.loadTrips();
      return;
    }
    
    // Update page index
    this.pageIndex = event.pageIndex;
    
    // Get the pagination key for this page (undefined for page 0)
    this.lastEvaluatedKey = this.paginationKeys.get(event.pageIndex);
    
    this.loadTrips();
  }

  onViewDetails(trip: Trip): void {
    this.router.navigate(['/carrier/trips', trip.tripId]);
  }

  onBackToDashboard(): void {
    this.router.navigate(['/carrier/dashboard']);
  }

  getStatusClass(status: TripStatus): string {
    switch (status) {
      case TripStatus.Scheduled:
        return 'status-scheduled';
      case TripStatus.PickedUp:
        return 'status-picked-up';
      case TripStatus.InTransit:
        return 'status-in-transit';
      case TripStatus.Delivered:
        return 'status-delivered';
      case TripStatus.Paid:
        return 'status-paid';
      default:
        return '';
    }
  }

  getStatusLabel(status: TripStatus): string {
    switch (status) {
      case TripStatus.Scheduled:
        return 'Scheduled';
      case TripStatus.PickedUp:
        return 'Picked Up';
      case TripStatus.InTransit:
        return 'In Transit';
      case TripStatus.Delivered:
        return 'Delivered';
      case TripStatus.Paid:
        return 'Paid';
      default:
        return status;
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  calculateProfit(trip: Trip): number {
    return calculateTripProfit(trip);
  }

  hasActiveFilters(): boolean {
    const formValue = this.filterForm.value;
    return !!(
      formValue.startDate ||
      formValue.endDate ||
      formValue.dispatcherId ||
      formValue.driverId ||
      formValue.brokerId ||
      formValue.truckId ||
      formValue.status
    );
  }

  getBrokerName(brokerId: string): string {
    const broker = this.brokers.find(b => b.brokerId === brokerId);
    return broker ? broker.brokerName : brokerId;
  }

  getDispatcherName(dispatcherId: string): string {
    const dispatcher = this.dispatchers.find(d => d.userId === dispatcherId);
    return dispatcher ? dispatcher.name : dispatcherId;
  }

  getDriverName(driverId: string): string {
    const driver = this.drivers.find(d => d.userId === driverId);
    return driver ? driver.name : driverId;
  }

  clearField(fieldName: string): void {
    this.filterForm.patchValue({ [fieldName]: '' });
    this.onApplyFilters();
  }

  calculateExpenses(trip: Trip): number {
    return (trip.driverPayment || 0) + (trip.truckOwnerPayment || 0) + (trip.fuelCost || 0);
  }
}
