import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, combineLatest, Observable, of } from 'rxjs';
import { switchMap, takeUntil, map, catchError, tap, finalize } from 'rxjs/operators';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent, MatPaginator } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { TripService } from '../../../../core/services';
import { Trip, TripStatus, TripFilters, Broker, calculateTripProfit, calculateFuelCost, hasFuelData, calculateTripExpenses } from '@haulhub/shared';
import { DashboardStateService, DashboardFilters, PaginationState } from '../dashboard-state.service';
import { SharedFilterService } from '../shared-filter.service';
import { PdfExportService } from '../../../../core/services/pdf-export.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AccessibilityService } from '../../../../core/services/accessibility.service';
import { DashboardChartsWidgetComponent } from '../dashboard-charts-widget/dashboard-charts-widget.component';

@Component({
  selector: 'app-trip-table',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
    MatChipsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    DashboardChartsWidgetComponent
  ],
  templateUrl: './trip-table.component.html',
  styleUrls: ['./trip-table.component.scss']
})
export class TripTableComponent implements OnInit, OnDestroy {
  @ViewChild(MatPaginator) paginator?: MatPaginator;
  
  displayedColumns = [
    'scheduledPickupDatetime',
    'pickupLocation',
    'dropoffLocation',
    'brokerName',
    'lorryId',
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
  hasActiveFilters = false;

  // Filter form
  filterForm: FormGroup;
  statusOptions = Object.values(TripStatus);
  brokers: Broker[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
    private dashboardState: DashboardStateService,
    private sharedFilterService: SharedFilterService,
    private pdfExportService: PdfExportService,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private accessibilityService: AccessibilityService
  ) {
    this.filterForm = this.fb.group({
      status: [null],
      brokerId: [null],
      lorryId: [''],
      driverName: ['']
    });
  }

  ngOnInit(): void {
    // Load brokers
    this.dashboardState.brokers$
      .pipe(takeUntil(this.destroy$))
      .subscribe(brokers => {
        this.brokers = brokers;
      });

    // Initialize filter form with current filter values
    const currentFilters = this.sharedFilterService.getCurrentFilters();
    console.log('Initializing form with filters:', currentFilters);
    this.filterForm.patchValue({
      status: currentFilters.status,
      brokerId: currentFilters.brokerId,
      lorryId: currentFilters.lorryId || '',
      driverName: currentFilters.driverName || ''
    }, { emitEvent: false });
    console.log('Form initialized with values:', this.filterForm.value);

    // Note: Dropdown changes are handled by (selectionChange) events in the template
    // Text inputs (lorryId, driverName) are handled by blur/Enter events

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
    
    console.log('[TRIP-TABLE] Loading trips with:', {
      filters,
      pagination,
      apiFilters
    });

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
        this.trips = this.trips.filter(t => t.tripId !== trip.tripId);
        this.totalTrips--;

        // Trigger payment summary refresh after deletion
        this.dashboardState.triggerPaymentSummaryRefresh();

        this.snackBar.open(
          'Trip deleted successfully',
          'Close',
          { duration: 3000 }
        );
      },
      error: (error) => {
        console.error('Error deleting trip:', error);
        this.snackBar.open('Error deleting trip. Please try again.', 'Close', {
          duration: 5000
        });
      }
    });
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
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
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
    return calculateTripExpenses(trip);
  }

  calculateFuelCost(trip: Trip): number {
    return calculateFuelCost(trip);
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
    if (!status) return '';
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

  clearField(fieldName: string): void {
    this.filterForm.patchValue({ [fieldName]: '' });
  }

  clearAllFilters(): void {
    // Get current date range to preserve it
    const currentFilters = this.sharedFilterService.getCurrentFilters();
    
    // Update filters to clear only non-date filters
    this.sharedFilterService.updateFilters({
      dateRange: currentFilters.dateRange, // Preserve date range
      status: null,
      brokerId: null,
      lorryId: null,
      driverName: null,
      driverId: null
    });
    
    // Also clear the form fields visually
    this.filterForm.patchValue({
      status: null,
      brokerId: null,
      lorryId: '',
      driverName: ''
    });
    
    // Manually reset the paginator UI to page 0
    if (this.paginator) {
      this.paginator.pageIndex = 0;
    }
  }

  exportPDF(): void {
    this.pdfExportService.exportDashboard();
  }

  /**
   * Apply filters to shared filter service
   */
  private applyFilters(): void {
    console.log('=== Trip-table applyFilters called ===');
    const formValue = this.filterForm.value;
    console.log('Current form value:', formValue);
    
    const filtersToApply = {
      status: formValue.status,
      brokerId: formValue.brokerId,
      lorryId: formValue.lorryId?.trim() || null,
      driverName: formValue.driverName?.trim() || null
    };
    console.log('Filters to apply:', filtersToApply);
    console.log('Current pagination state:', this.dashboardState['paginationSubject'].value);
    
    this.sharedFilterService.updateFilters(filtersToApply);
    console.log('=== Filters sent to shared service ===');
    
    // Log pagination state after filter update
    setTimeout(() => {
      console.log('Pagination state after filter update:', this.dashboardState['paginationSubject'].value);
    }, 150);
  }

  /**
   * Handle dropdown selection change
   * Called from template when user selects a value from status or broker dropdown
   */
  onDropdownChange(): void {
    console.log('Dropdown changed, applying filters');
    this.applyFilters();
  }

  /**
   * Handle blur event on text input fields
   * Called from template when user leaves the input field
   */
  onTextInputBlur(): void {
    this.applyFilters();
  }

  /**
   * Handle keydown event on text input fields
   * Triggers filter refresh when Enter key is pressed
   */
  onTextInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent form submission
      this.applyFilters();
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
