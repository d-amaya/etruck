import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { Trip, TripStatus, TripFilters, Truck, Trailer, VehicleVerificationStatus, Broker } from '@haulhub/shared';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-vehicle-trip-list',
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
    MatChipsModule
  ],
  templateUrl: './vehicle-trip-list.component.html',
  styleUrls: ['./vehicle-trip-list.component.scss']
})
export class VehicleTripListComponent implements OnInit {
  displayedColumns: string[] = [
    'scheduledTimestamp',
    'pickupCity',
    'deliveryCity',
    'truckId',
    'dispatcherId',
    'brokerName',
    'orderStatus',
    'truckOwnerPayment'
  ];

  trips: Trip[] = [];
  trucks: Truck[] = [];
  trailers: Trailer[] = [];
  approvedTrucks: Truck[] = [];
  approvedTrailers: Trailer[] = [];
  brokers: Broker[] = [];
  loading = false;
  filterForm: FormGroup;
  
  pageSize = 10;
  pageIndex = 0;
  totalTrips = 0;
  lastEvaluatedKey?: string;
  paginationKeys: Map<number, string> = new Map();

  statusOptions = ['Scheduled', 'Picked Up', 'In Transit', 'Delivered', 'Paid'];
  TripStatus = TripStatus;

  constructor(
    private fb: FormBuilder,
    private snackBar: MatSnackBar
  ) {
    this.filterForm = this.fb.group({
      vehicleId: [''],
      vehicleType: [''],
      startDate: [null],
      endDate: [null],
      dispatcherId: [''],
      brokerId: [''],
      status: ['']
    });
  }

  ngOnInit(): void {
    this.loadVehicles();
    this.loadBrokers();
  }

  private loadVehicles(): void {
    // TODO: Call API to load trucks and trailers
    setTimeout(() => {
      this.trucks = [];
      this.trailers = [];
      this.approvedTrucks = this.trucks.filter(
        t => t.accountStatus === VehicleVerificationStatus.Approved
      );
      this.approvedTrailers = this.trailers.filter(
        t => t.accountStatus === VehicleVerificationStatus.Approved
      );
      
      if (this.approvedTrucks.length > 0 || this.approvedTrailers.length > 0) {
        this.loadTrips();
      }
    }, 500);
  }

  private loadBrokers(): void {
    // TODO: Call API to load brokers
    setTimeout(() => {
      this.brokers = [];
    }, 500);
  }

  loadTrips(): void {
    if (this.approvedTrucks.length === 0 && this.approvedTrailers.length === 0) {
      this.trips = [];
      return;
    }

    this.loading = true;
    const filters = this.buildFilters();
    
    // TODO: Call API to load trips
    setTimeout(() => {
      this.trips = [];
      this.totalTrips = 0;
      this.loading = false;
    }, 500);
  }

  private buildFilters(): TripFilters {
    const formValue = this.filterForm.value;
    const filters: TripFilters = {
      limit: this.pageSize
    };

    if (formValue.vehicleId) {
      // Filter by specific vehicle (using truckId)
      filters.truckId = formValue.vehicleId;
    }

    if (formValue.startDate) {
      filters.startDate = new Date(formValue.startDate).toISOString();
    }

    if (formValue.endDate) {
      filters.endDate = new Date(formValue.endDate).toISOString();
    }

    if (formValue.dispatcherId) {
      filters.driverId = formValue.dispatcherId.trim();
    }

    if (formValue.brokerId) {
      filters.brokerId = formValue.brokerId;
    }

    if (formValue.status) {
      filters.orderStatus = formValue.status as any;
    }

    if (this.lastEvaluatedKey) {
      filters.lastEvaluatedKey = this.lastEvaluatedKey;
    }

    return filters;
  }

  onApplyFilters(): void {
    this.pageIndex = 0;
    this.lastEvaluatedKey = undefined;
    this.loadTrips();
  }

  onClearFilters(): void {
    this.filterForm.reset({
      vehicleId: '',
      vehicleType: '',
      startDate: null,
      endDate: null,
      dispatcherId: '',
      brokerId: '',
      status: ''
    });
    this.pageIndex = 0;
    this.lastEvaluatedKey = undefined;
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

  getStatusClass(status: string): string {
    switch (status) {
      case 'Scheduled':
        return 'status-scheduled';
      case 'Picked Up':
        return 'status-picked-up';
      case 'In Transit':
        return 'status-in-transit';
      case 'Delivered':
        return 'status-delivered';
      case 'Paid':
        return 'status-paid';
      default:
        return '';
    }
  }

  getStatusLabel(status: string): string {
    // Status is already in the correct format (e.g., "Picked Up", "In Transit")
    return status;
  }

  formatDate(dateString: string | null): string {
    if (!dateString) return 'N/A';
    
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

  hasActiveFilters(): boolean {
    const formValue = this.filterForm.value;
    return !!(
      formValue.vehicleId ||
      formValue.startDate ||
      formValue.endDate ||
      formValue.dispatcherId ||
      formValue.brokerId ||
      formValue.status
    );
  }

  getBrokerName(brokerId: string): string {
    const broker = this.brokers.find(b => b.brokerId === brokerId);
    return broker ? broker.brokerName : brokerId;
  }

  getVehicleDisplay(trip: any): string {
    const truck = this.trucks.find(t => t.truckId === trip.truckId);
    const trailer = this.trailers.find(t => t.trailerId === trip.trailerId);
    
    const truckInfo = truck ? `Truck: ${truck.plate}` : '';
    const trailerInfo = trailer ? `Trailer: ${trailer.plate}` : '';
    
    return [truckInfo, trailerInfo].filter(Boolean).join(' | ');
  }

  hasApprovedVehicles(): boolean {
    return this.approvedTrucks.length > 0 || this.approvedTrailers.length > 0;
  }
}
