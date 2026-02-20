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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TripService } from '../../../core/services';
import { Trip, TripStatus, TripFilters } from '../../../core/services/trip.service';
import { UpdateOrderStatusDto as UpdateTripStatusDto } from '@haulhub/shared';
import { StatusUpdateDialogComponent, StatusUpdateDialogResult } from './status-update-dialog.component';

@Component({
  selector: 'app-driver-trip-list',
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
    MatDialogModule,
    MatSnackBarModule
  ],
  templateUrl: './trip-list.component.html',
  styleUrls: ['./trip-list.component.scss']
})
export class TripListComponent implements OnInit {
  displayedColumns: string[] = [
    'scheduledTimestamp',
    'pickupCity',
    'deliveryCity',
    'truckId',
    'dispatcherName',
    'brokerName',
    'status',
    'driverPayment',
    'mileageOrder',
    'actions'
  ];

  trips: Trip[] = [];
  loading = false;
  filterForm: FormGroup;
  
  // Pagination
  pageSize = 10;
  pageIndex = 0;
  totalTrips = 0;
  lastEvaluatedKey?: string;
  paginationKeys: Map<number, string> = new Map();

  // Status options
  statusOptions = Object.values(TripStatus);
  TripStatus = TripStatus;

  constructor(
    private tripService: TripService,
    private router: Router,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.filterForm = this.fb.group({
      startDate: [null],
      endDate: [null],
      truckId: [''],
      dispatcherId: [''],
      status: ['']
    });
  }

  ngOnInit(): void {
    this.loadTrips();
  }

  loadTrips(): void {
    this.loading = true;
    const filters = this.buildFilters();
    
    this.tripService.getTrips(filters).subscribe({
      next: (response) => {
        this.trips = response.trips;
        this.lastEvaluatedKey = response.lastEvaluatedKey;
        
        // Store the key for navigating to the NEXT page
        if (response.lastEvaluatedKey) {
          this.paginationKeys.set(this.pageIndex + 1, response.lastEvaluatedKey);
        }
        
        // Calculate totalTrips to control paginator behavior
        if (response.lastEvaluatedKey) {
          this.totalTrips = (this.pageIndex + 2) * this.pageSize;
        } else {
          this.totalTrips = (this.pageIndex * this.pageSize) + response.trips.length;
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

    if (formValue.truckId) {
      filters.truckId = formValue.truckId.trim();
    }

    if (formValue.dispatcherId) {
      filters.driverId = formValue.dispatcherId.trim();
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
    this.paginationKeys.clear();
    this.loadTrips();
  }

  onClearFilters(): void {
    this.filterForm.reset({
      startDate: null,
      endDate: null,
      truckId: '',
      dispatcherId: '',
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
    this.router.navigate(['/driver/trips', trip.tripId]);
  }

  onUpdateStatus(trip: Trip): void {
    const dialogRef = this.dialog.open(StatusUpdateDialogComponent, {
      width: '500px',
      data: { trip }
    });

    dialogRef.afterClosed().subscribe((result: StatusUpdateDialogResult | undefined) => {
      if (result) {
        this.updateTripStatus(trip.tripId || trip.orderId || "", result.status, result.deliveryTimestamp);
      }
    });
  }

  private updateTripStatus(tripId: string, status: TripStatus, deliveryTimestamp?: string): void {
    const statusDto: UpdateTripStatusDto = { orderStatus: status };
    if (deliveryTimestamp) {
      statusDto.deliveryTimestamp = deliveryTimestamp;
    }
    
    this.tripService.updateTripStatus(tripId, statusDto).subscribe({
      next: (updatedTrip) => {
        // Update the trip in the local array
        const index = this.trips.findIndex(t => t.tripId === tripId);
        if (index !== -1) {
          this.trips[index] = updatedTrip;
        }
        
        this.snackBar.open('Order status updated successfully', 'Close', {
          duration: 3000,
          horizontalPosition: 'end',
          verticalPosition: 'top'
        });
      },
      error: (error) => {
        console.error('Error updating trip status:', error);
        const errorMessage = error.error?.message || 'Failed to update trip status';
        this.snackBar.open(errorMessage, 'Close', {
          duration: 5000,
          horizontalPosition: 'end',
          verticalPosition: 'top',
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  canUpdateStatus(trip: Trip): boolean {
    // Driver can only update status for trips that are not yet delivered or paid
    return trip.orderStatus !== TripStatus.Delivered && 
           trip.orderStatus !== TripStatus.Paid;
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

  formatDistance(distance?: number): string {
    if (!distance) {
      return 'N/A';
    }
    return `${distance.toFixed(1)} mi`;
  }

  hasActiveFilters(): boolean {
    const formValue = this.filterForm.value;
    return !!(
      formValue.startDate ||
      formValue.endDate ||
      formValue.truckId ||
      formValue.dispatcherId ||
      formValue.status
    );
  }

  getTotalDistance(): number {
    return this.trips.reduce((sum, trip) => sum + (trip.mileageOrder || 0), 0);
  }

  getTotalEarnings(): number {
    return this.trips.reduce((sum, trip) => sum + trip.driverPayment, 0);
  }
}
