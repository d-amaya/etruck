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
import { TripService, LorryService } from '../../../core/services';
import { Trip, TripStatus, TripFilters, Lorry, LorryVerificationStatus, Broker } from '@haulhub/shared';

@Component({
  selector: 'app-lorry-trip-list',
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
  templateUrl: './lorry-trip-list.component.html',
  styleUrls: ['./lorry-trip-list.component.scss']
})
export class LorryTripListComponent implements OnInit {
  displayedColumns: string[] = [
    'scheduledPickupDatetime',
    'pickupLocation',
    'dropoffLocation',
    'lorryId',
    'dispatcherId',
    'brokerName',
    'status',
    'lorryOwnerPayment'
  ];

  trips: Trip[] = [];
  lorries: Lorry[] = [];
  approvedLorries: Lorry[] = [];
  brokers: Broker[] = [];
  loading = false;
  filterForm: FormGroup;
  
  // Pagination
  pageSize = 50;
  pageIndex = 0;
  totalTrips = 0;
  lastEvaluatedKey?: string;

  // Status options
  statusOptions = Object.values(TripStatus);
  TripStatus = TripStatus;

  constructor(
    private tripService: TripService,
    private lorryService: LorryService,
    private fb: FormBuilder
  ) {
    this.filterForm = this.fb.group({
      lorryId: [''],
      startDate: [null],
      endDate: [null],
      dispatcherId: [''],
      brokerId: [''],
      status: ['']
    });
  }

  ngOnInit(): void {
    this.loadLorries();
    this.loadBrokers();
  }

  private loadLorries(): void {
    this.lorryService.getLorries().subscribe({
      next: (lorries) => {
        this.lorries = lorries;
        this.approvedLorries = lorries.filter(
          l => l.verificationStatus === LorryVerificationStatus.Approved
        );
        
        // If there are approved lorries, load trips
        if (this.approvedLorries.length > 0) {
          this.loadTrips();
        }
      },
      error: (error) => {
        console.error('Error loading lorries:', error);
      }
    });
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
    if (this.approvedLorries.length === 0) {
      this.trips = [];
      return;
    }

    this.loading = true;
    const filters = this.buildFilters();
    
    this.tripService.getTrips(filters).subscribe({
      next: (trips) => {
        // Filter trips to only show those for approved lorries
        this.trips = trips.filter(trip => 
          this.approvedLorries.some(lorry => lorry.lorryId === trip.lorryId)
        );
        this.totalTrips = this.trips.length;
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
      limit: this.pageSize
    };

    // If a specific lorry is selected, filter by that lorry
    if (formValue.lorryId) {
      filters.lorryId = formValue.lorryId;
    }

    if (formValue.startDate) {
      filters.startDate = new Date(formValue.startDate).toISOString();
    }

    if (formValue.endDate) {
      filters.endDate = new Date(formValue.endDate).toISOString();
    }

    if (formValue.dispatcherId) {
      filters.driverId = formValue.dispatcherId.trim(); // Using driverId field for dispatcher filter
    }

    if (formValue.brokerId) {
      filters.brokerId = formValue.brokerId;
    }

    if (formValue.status) {
      filters.status = formValue.status;
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
      lorryId: '',
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
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.loadTrips();
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

  hasActiveFilters(): boolean {
    const formValue = this.filterForm.value;
    return !!(
      formValue.lorryId ||
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

  getLorryDisplay(lorryId: string): string {
    const lorry = this.lorries.find(l => l.lorryId === lorryId);
    return lorry ? `${lorry.lorryId} (${lorry.make} ${lorry.model})` : lorryId;
  }

  hasApprovedLorries(): boolean {
    return this.approvedLorries.length > 0;
  }
}
