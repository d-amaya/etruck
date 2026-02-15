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
import { TripService } from '../../../core/services';
import { Trip, TripStatus, TripFilters, Broker, calculateTripProfit } from '@haulhub/shared';

@Component({
  selector: 'app-trip-list',
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
    MatMenuModule
  ],
  templateUrl: './trip-list.component.html',
  styleUrls: ['./trip-list.component.scss']
})
export class TripListComponent implements OnInit {
  displayedColumns: string[] = [
    'scheduledTimestamp',
    'pickupLocation',
    'dropoffLocation',
    'brokerName',
    'truckId',
    'driverName',
    'status',
    'brokerPayment',
    'truckOwnerPayment',
    'driverPayment',
    'actions'
  ];

  trips: Trip[] = [];
  brokers: Broker[] = [];
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
    private router: Router,
    private fb: FormBuilder
  ) {
    // Set default date range to current month
    const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    
    this.filterForm = this.fb.group({
      startDate: [startDate],
      endDate: [endDate],
      brokerId: [''],
      lorryId: [''],
      driverId: [''],
      driverName: [''],
      status: ['']
    });
  }

  ngOnInit(): void {
    this.loadBrokers();
    this.loadTrips();
  }

  private loadBrokers(): void {
    this.tripService.getBrokers().subscribe({
      next: (brokers) => {
        this.brokers = brokers.filter(b => b.isActive);
      },
      error: (error) => {
        console.error('Error loading brokers:', error);
      }
    });
  }

  loadTrips(): void {
    this.loading = true;
    const filters = this.buildFilters();
    
    this.tripService.getTrips(filters).subscribe({
      next: (response) => {
        console.log('Received response:', {
          tripCount: response.trips.length,
          hasMorePages: !!response.lastEvaluatedKey,
          lastEvaluatedKey: response.lastEvaluatedKey ? response.lastEvaluatedKey.substring(0, 50) + '...' : 'none'
        });
        
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
          console.warn('totalTrips was less than trips received, adjusting');
          this.totalTrips = response.trips.length;
        }
        
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading orders:', error);
        this.loading = false;
      }
    });
  }

  private buildFilters(): TripFilters {
    const formValue = this.filterForm.value;
    const filters: TripFilters = {
      limit: this.pageSize
    };

    if (formValue.startDate) {
      filters.startDate = new Date(formValue.startDate).toISOString();
    }

    if (formValue.endDate) {
      filters.endDate = new Date(formValue.endDate).toISOString();
    }

    if (formValue.brokerId) {
      filters.brokerId = formValue.brokerId;
    }

    if (formValue.truckId) {
      filters.truckId = formValue.truckId.trim();
    }

    if (formValue.driverId) {
      filters.driverId = formValue.driverId.trim();
    }

    if (formValue.driverName) {
      filters.driverName = formValue.driverName.trim();
    }

    if (formValue.orderStatus) {
      filters.orderStatus = formValue.orderStatus;
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
      brokerId: '',
      lorryId: '',
      driverId: '',
      driverName: '',
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
    this.router.navigate(['/dispatcher/trips', trip.tripId]);
  }

  onEditTrip(trip: Trip): void {
    this.router.navigate(['/dispatcher/trips', trip.tripId, 'edit']);
  }

  onCreateTrip(): void {
    this.router.navigate(['/dispatcher/trips/create']);
  }

  onBackToDashboard(): void {
    this.router.navigate(['/dispatcher/dashboard']);
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
      formValue.brokerId ||
      formValue.lorryId ||
      formValue.driverId ||
      formValue.driverName ||
      formValue.status
    );
  }

  getBrokerName(brokerId: string): string {
    const broker = this.brokers.find(b => b.brokerId === brokerId);
    return broker ? broker.brokerName : brokerId;
  }
}
