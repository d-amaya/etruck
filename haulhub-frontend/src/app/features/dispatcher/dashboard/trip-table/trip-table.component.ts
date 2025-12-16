import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, combineLatest, Observable, of } from 'rxjs';
import { switchMap, takeUntil, map, catchError, debounceTime, tap, finalize } from 'rxjs/operators';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { TripService } from '../../../../core/services';
import { Trip, TripStatus, TripFilters } from '@haulhub/shared';
import { DashboardStateService, DashboardFilters, PaginationState } from '../dashboard-state.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AccessibilityService } from '../../../../core/services/accessibility.service';

@Component({
  selector: 'app-trip-table',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
    MatChipsModule
  ],
  templateUrl: './trip-table.component.html',
  styleUrls: ['./trip-table.component.scss']
})
export class TripTableComponent implements OnInit, OnDestroy {
  displayedColumns = [
    'scheduledPickupDatetime',
    'pickupLocation',
    'dropoffLocation',
    'brokerName',
    'lorryId',
    'driverName',
    'status',
    'brokerPayment',
    'profit',
    'actions'
  ];

  trips: Trip[] = [];
  totalTrips = 0;
  pageSize = 25;
  pageIndex = 0;
  loading = false;
  hasActiveFilters = false;

  private destroy$ = new Subject<void>();
  private deletedTrip: Trip | null = null;

  constructor(
    private tripService: TripService,
    private dashboardState: DashboardStateService,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private accessibilityService: AccessibilityService
  ) {}

  ngOnInit(): void {
    // Subscribe to the combined filters and pagination observable
    this.dashboardState.filtersAndPagination$.pipe(
      switchMap(([filters, pagination]) => {
        this.pageSize = pagination.pageSize;
        this.pageIndex = pagination.page;
        this.hasActiveFilters = this.dashboardState.getActiveFilterCount() > 0;
        return this.loadTrips(filters, pagination);
      }),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      this.trips = result.trips;
      this.totalTrips = result.total;
      // Update the dashboard state with the filtered trips for payment summary calculation
      this.dashboardState.updateFilteredTrips(result.trips);
    });
  }

  private loadTrips(filters: DashboardFilters, pagination: PaginationState): Observable<{ trips: Trip[], total: number }> {
    this.loading = true;
    const apiFilters = this.buildApiFilters(filters, pagination);

    return this.tripService.getTrips(apiFilters).pipe(
      map(response => {
        this.loading = false;
        const trips = response.trips;
        
        // Backend handles all filtering - just sort the results
        const sortedTrips = trips.sort((a, b) => {
          const dateA = new Date(a.scheduledPickupDatetime).getTime();
          const dateB = new Date(b.scheduledPickupDatetime).getTime();
          return dateB - dateA; // Descending order
        });
        
        // Update pagination state with new lastEvaluatedKey
        if (response.lastEvaluatedKey) {
          // Store the token for the next page
          const pageTokens = pagination.pageTokens || [];
          if (!pageTokens[pagination.page]) {
            pageTokens[pagination.page] = response.lastEvaluatedKey;
            this.dashboardState.updatePagination({ 
              lastEvaluatedKey: response.lastEvaluatedKey,
              pageTokens 
            });
          }
        }
        
        // Calculate total for pagination
        // DynamoDB doesn't give us exact totals, so we estimate based on what we know
        let total: number;
        const currentPageItems = sortedTrips.length;
        const itemsBeforeCurrentPage = pagination.page * pagination.pageSize;
        
        if (response.lastEvaluatedKey) {
          // There are more items - show at least current items + 1 more to enable next button
          total = itemsBeforeCurrentPage + currentPageItems + 1;
        } else {
          // This is the last page - we now know the exact total
          total = itemsBeforeCurrentPage + currentPageItems;
        }
        
        return { trips: sortedTrips, total };
      }),
      catchError(error => {
        this.loading = false;
        
        // Ignore cancellation errors (they're expected when filters change rapidly)
        if (error.name === 'AbortError' || error.status === 0) {
          return of({ trips: [], total: 0 });
        }
        
        console.error('Error loading trips:', error);
        this.snackBar.open('Error loading trips. Please try again.', 'Close', {
          duration: 5000
        });
        return of({ trips: [], total: 0 });
      }),
      finalize(() => {
        this.dashboardState.completeLoad();
      })
    );
  }

  private buildApiFilters(filters: DashboardFilters, pagination: PaginationState): TripFilters {
    const apiFilters: TripFilters = {
      limit: pagination.pageSize
    };

    // Add pagination token for pages after the first
    if (pagination.page > 0 && pagination.pageTokens && pagination.pageTokens[pagination.page - 1]) {
      apiFilters.lastEvaluatedKey = pagination.pageTokens[pagination.page - 1];
    }

    if (filters.dateRange.startDate) {
      apiFilters.startDate = filters.dateRange.startDate.toISOString();
    }
    if (filters.dateRange.endDate) {
      apiFilters.endDate = filters.dateRange.endDate.toISOString();
    }
    if (filters.status) {
      apiFilters.status = filters.status;
    }
    if (filters.brokerId) {
      apiFilters.brokerId = filters.brokerId;
    }
    if (filters.lorryId) {
      apiFilters.lorryId = filters.lorryId;
    }
    if (filters.driverName) {
      apiFilters.driverName = filters.driverName;
    }

    return apiFilters;
  }

  onPageChange(event: PageEvent): void {
    this.dashboardState.updatePagination({
      page: event.pageIndex,
      pageSize: event.pageSize
    });
  }

  viewTrip(trip: Trip): void {
    console.log('View trip clicked:', trip.tripId);
    try {
      this.router.navigate(['/dispatcher/trips', trip.tripId]).catch(err => {
        console.error('Navigation error:', err);
        this.snackBar.open('Error navigating to trip details', 'Close', { duration: 3000 });
      });
    } catch (error) {
      console.error('Error in viewTrip:', error);
      this.snackBar.open('Error viewing trip', 'Close', { duration: 3000 });
    }
  }

  editTrip(trip: Trip): void {
    console.log('Edit trip clicked:', trip.tripId);
    try {
      this.router.navigate(['/dispatcher/trips', trip.tripId, 'edit']).catch(err => {
        console.error('Navigation error:', err);
        this.snackBar.open('Error navigating to edit trip', 'Close', { duration: 3000 });
      });
    } catch (error) {
      console.error('Error in editTrip:', error);
      this.snackBar.open('Error editing trip', 'Close', { duration: 3000 });
    }
  }

  deleteTrip(trip: Trip): void {
    console.log('Delete trip clicked:', trip.tripId);
    try {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '400px',
        data: {
          title: 'Delete Trip',
          message: `Are you sure you want to delete this trip from ${trip.pickupLocation} to ${trip.dropoffLocation}?`,
          confirmText: 'Delete',
          cancelText: 'Cancel'
        }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.performDelete(trip);
        }
      });
    } catch (error) {
      console.error('Error in deleteTrip:', error);
      this.snackBar.open('Error opening delete dialog', 'Close', { duration: 3000 });
    }
  }

  private performDelete(trip: Trip): void {
    this.tripService.deleteTrip(trip.tripId).subscribe({
      next: () => {
        this.deletedTrip = trip;
        this.trips = this.trips.filter(t => t.tripId !== trip.tripId);
        this.totalTrips--;

        const snackBarRef = this.snackBar.open(
          'Trip deleted successfully',
          'Undo',
          { duration: 5000 }
        );

        snackBarRef.onAction().subscribe(() => {
          this.undoDelete();
        });

        // Clear deleted trip after snackbar duration
        setTimeout(() => {
          this.deletedTrip = null;
        }, 5000);
      },
      error: (error) => {
        console.error('Error deleting trip:', error);
        this.snackBar.open('Error deleting trip. Please try again.', 'Close', {
          duration: 5000
        });
      }
    });
  }

  private undoDelete(): void {
    if (this.deletedTrip) {
      this.tripService.createTrip(this.deletedTrip).subscribe({
        next: () => {
          this.snackBar.open('Trip restored successfully', 'Close', {
            duration: 3000
          });
          // Reload trips to show the restored trip
          this.dashboardState.updateFilters({});
        },
        error: (error) => {
          console.error('Error restoring trip:', error);
          this.snackBar.open('Error restoring trip. Please try again.', 'Close', {
            duration: 5000
          });
        }
      });
      this.deletedTrip = null;
    }
  }

  createTrip(): void {
    this.router.navigate(['/dispatcher/trips/create']);
  }

  getEmptyStateMessage(): string {
    if (this.hasActiveFilters) {
      return 'No trips found matching your filters. Try adjusting your filters or clear them to see all trips.';
    }
    return 'You haven\'t created any trips yet.';
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
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  }

  calculateProfit(trip: Trip): number {
    let totalExpenses = trip.lorryOwnerPayment + trip.driverPayment;
    
    // Add fuel costs if available
    if (trip.fuelAvgCost && trip.fuelAvgGallonsPerMile) {
      const totalMiles = (trip.loadedMiles || trip.distance || 0) + (trip.emptyMiles || 0);
      const fuelCost = totalMiles * trip.fuelAvgGallonsPerMile * trip.fuelAvgCost;
      totalExpenses += fuelCost;
    }
    
    // Add additional fees
    if (trip.lumperFees) {
      totalExpenses += trip.lumperFees;
    }
    if (trip.detentionFees) {
      totalExpenses += trip.detentionFees;
    }
    
    return trip.brokerPayment - totalExpenses;
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

  /**
   * Get ARIA label for trip status
   */
  getStatusAriaLabel(status: TripStatus): string {
    return this.accessibilityService.getStatusAriaLabel(status);
  }

  /**
   * Get ARIA label for action buttons
   */
  getActionAriaLabel(action: string, tripId: string, destination?: string): string {
    return this.accessibilityService.getActionAriaLabel(action, tripId, destination);
  }

  /**
   * Get ARIA label for profit column
   */
  getProfitAriaLabel(trip: Trip): string {
    const profit = this.calculateProfit(trip);
    const profitText = this.formatCurrency(profit);
    const profitType = profit >= 0 ? 'profit' : 'loss';
    return `${profitType}: ${profitText}`;
  }

  /**
   * Math utility for template
   */
  Math = Math;

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
