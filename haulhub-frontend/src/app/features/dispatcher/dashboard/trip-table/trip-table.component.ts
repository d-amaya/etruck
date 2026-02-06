import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, combineLatest, Observable, of } from 'rxjs';
import { switchMap, takeUntil, map, catchError, tap, finalize, startWith } from 'rxjs/operators';
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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { TripService } from '../../../../core/services';
import { AuthService } from '../../../../core/services';
import { Trip, TripStatus, TripFilters, Broker, calculateTripProfit, calculateFuelCost, hasFuelData, calculateTripExpenses } from '@haulhub/shared';
import { DashboardStateService, DashboardFilters, PaginationState } from '../dashboard-state.service';
import { SharedFilterService } from '../shared-filter.service';
import { AssetCacheService } from '../asset-cache.service';
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
    MatAutocompleteModule,
    DashboardChartsWidgetComponent
  ],
  templateUrl: './trip-table.component.html',
  styleUrls: ['./trip-table.component.scss']
})
export class TripTableComponent implements OnInit, OnDestroy {
  @ViewChild(MatPaginator) paginator?: MatPaginator;
  
  displayedColumns = [
    'scheduledTimestamp',
    'scheduledTime',
    'pickupLocation',
    'dropoffLocation',
    'brokerName',
    'truckId',
    'trailerId',
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
  trucks: any[] = [];
  drivers: any[] = [];
  
  // Asset lookup maps for filter validation and conversion
  private truckPlateToIdMap = new Map<string, string>(); // plate -> truckId
  private trailerPlateToIdMap = new Map<string, string>(); // plate -> trailerId
  private driverLicenseToIdMap = new Map<string, string>(); // license -> driverId
  private truckMap = new Map<string, any>(); // truckId -> truck (for display)
  private trailerMap = new Map<string, any>(); // trailerId -> trailer (for display)
  private driverMap = new Map<string, any>(); // driverId -> driver (for display)
  private brokerMap = new Map<string, any>(); // brokerId -> broker (for display)
  
  // Autocomplete suggestions
  truckPlates: string[] = [];
  trailerPlates: string[] = [];
  driverLicenses: string[] = [];
  filteredTruckPlates!: Observable<string[]>;
  filteredDriverLicenses!: Observable<string[]>;
  
  // Validation errors
  truckPlateError: string = '';
  driverLicenseError: string = '';

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
    private authService: AuthService,
    private dashboardState: DashboardStateService,
    private sharedFilterService: SharedFilterService,
    private assetCache: AssetCacheService,
    private pdfExportService: PdfExportService,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private accessibilityService: AccessibilityService
  ) {
    this.filterForm = this.fb.group({
      status: [null],
      brokerId: [null],
      truckId: [null],
      driverId: [null]
    });
  }

  ngOnInit(): void {
    // Load assets from cache
    this.assetCache.loadAssets().pipe(
      takeUntil(this.destroy$)
    ).subscribe(cache => {
      this.truckPlateToIdMap = cache.truckPlates;
      this.trailerPlateToIdMap = cache.trailerPlates;
      this.driverLicenseToIdMap = cache.driverLicenses;
      this.truckMap = cache.trucks;
      this.trailerMap = cache.trailers;
      this.driverMap = cache.drivers;
      
      // Convert maps to arrays for dropdowns
      this.trucks = Array.from(cache.trucks.values());
      this.drivers = Array.from(cache.drivers.values());
      
      this.truckPlates = Array.from(cache.truckPlates.keys());
      this.trailerPlates = Array.from(cache.trailerPlates.keys());
      this.driverLicenses = Array.from(cache.driverLicenses.keys());
    });
    
    // Load brokers for filter dropdown
    this.dashboardState.brokers$
      .pipe(takeUntil(this.destroy$))
      .subscribe(brokers => {
        this.brokers = brokers;
        this.brokerMap.clear();
        brokers.forEach(broker => {
          this.brokerMap.set(broker.brokerId, broker);
        });
      });

    // Initialize filter form with current filter values
    const currentFilters = this.sharedFilterService.getCurrentFilters();
    this.filterForm.patchValue({
      status: currentFilters.status,
      brokerId: currentFilters.brokerId,
      truckPlate: '',
      driverLicense: ''
    }, { emitEvent: false });

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
      
      // Build lookup maps from backend-enriched trip data for table display
      if (result.assets) {
        result.assets.trucks.forEach((truck: any) => this.truckMap.set(truck.truckId, truck));
        result.assets.trailers.forEach((trailer: any) => this.trailerMap.set(trailer.trailerId, trailer));
        result.assets.drivers.forEach((driver: any) => {
          this.driverMap.set(driver.userId, driver);
        });
      }
      
      // Update the dashboard state with the filtered trips for payment summary calculation
      this.dashboardState.updateFilteredTrips(this.trips);
    });
  }

  /**
   * Load all carrier assets for filter validation and autocomplete
   * Builds lookup maps: plate -> truckId, plate -> trailerId, license -> driverId
   */

  /**
   * Enrich trips with human-readable names from lookup maps
   */
  private enrichTripsWithNames(trips: Trip[]): Trip[] {
    return trips.map(trip => {
      const enrichedTrip = { ...trip };
      
      // Enrich broker name
      if (trip.brokerId && this.brokerMap.has(trip.brokerId)) {
        enrichedTrip.brokerName = this.brokerMap.get(trip.brokerId)!.brokerName;
      }
      
      // Enrich driver name
      if (trip.driverId && this.driverMap.has(trip.driverId)) {
        enrichedTrip.driverName = this.driverMap.get(trip.driverId)!.name;
      }
      
      // Ensure pickupLocation and dropoffLocation are set
      if (!enrichedTrip.pickupLocation && trip.pickupCity && trip.pickupState) {
        enrichedTrip.pickupLocation = `${trip.pickupCity}, ${trip.pickupState}`;
      }
      if (!enrichedTrip.dropoffLocation && trip.deliveryCity && trip.deliveryState) {
        enrichedTrip.dropoffLocation = `${trip.deliveryCity}, ${trip.deliveryState}`;
      }
      
      // Ensure status is set
      if (!enrichedTrip.status && trip.orderStatus) {
        enrichedTrip.status = trip.orderStatus as any;
      }
      
      return enrichedTrip;
    });
  }

  /**
   * Get truck display name (plate)
   */
  getTruckDisplay(truckId: string): string {
    if (!truckId) return 'N/A';
    const truck = this.truckMap.get(truckId);
    return truck ? truck.plate : truckId.substring(0, 8);
  }

  /**
   * Get trailer display name (plate)
   */
  getTrailerDisplay(trailerId: string): string {
    if (!trailerId) return 'N/A';
    const trailer = this.trailerMap.get(trailerId);
    return trailer ? trailer.plate : trailerId.substring(0, 8);
  }

  /**
   * Get driver display name
   */
  getDriverDisplay(driverId: string): string {
    if (!driverId) return 'N/A';
    const driver = this.driverMap.get(driverId);
    return driver ? driver.name : driverId.substring(0, 8);
  }

  /**
   * Filter truck plates for autocomplete
   */
  private _filterTruckPlates(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.truckPlates.filter(plate => plate.toLowerCase().includes(filterValue));
  }

  /**
   * Filter driver licenses for autocomplete
   */
  private _filterDriverLicenses(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.driverLicenses.filter(license => license.toLowerCase().includes(filterValue));
  }

  /**
   * Validate truck plate on blur
   */
  validateTruckPlate(): void {
    const plate = this.filterForm.get('truckPlate')?.value?.trim();
    if (!plate) {
      this.truckPlateError = '';
      return;
    }
    
    const plateUpper = plate.toUpperCase();
    if (!this.truckPlateToIdMap.has(plateUpper)) {
      this.truckPlateError = `Truck plate "${plate}" not found in your fleet`;
    } else {
      this.truckPlateError = '';
    }
  }

  /**
   * Validate driver license on blur
   */
  validateDriverLicense(): void {
    const license = this.filterForm.get('driverLicense')?.value?.trim();
    if (!license) {
      this.driverLicenseError = '';
      return;
    }
    
    const licenseUpper = license.toUpperCase();
    if (!this.driverLicenseToIdMap.has(licenseUpper)) {
      this.driverLicenseError = `Driver license "${license}" not found in your team`;
    } else {
      this.driverLicenseError = '';
    }
  }

  private loadTrips(filters: DashboardFilters, pagination: PaginationState): Observable<{ trips: Trip[], total: number, assets?: any }> {
    this.loading = true;
    const apiFilters = this.buildApiFilters(filters, pagination);

    return this.tripService.getTrips(apiFilters).pipe(
      map(response => {
        this.loading = false;
        const trips = response.trips;
        
        // Backend handles all filtering - just sort the results
        const sortedTrips = trips.sort((a, b) => {
          const dateA = new Date(a.scheduledTimestamp).getTime();
          const dateB = new Date(b.scheduledTimestamp).getTime();
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
        
        return { trips: sortedTrips, total, assets: response.assets };
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
      apiFilters.orderStatus = filters.status;
    }
    if (filters.brokerId) {
      apiFilters.brokerId = filters.brokerId;
    }
    if (filters.truckId) {
      apiFilters.truckId = filters.truckId;
    }
    if (filters.driverId) {
      apiFilters.driverId = filters.driverId;
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

  formatDateTime(isoTimestamp: string | null): string {
    if (!isoTimestamp) return 'N/A';
    
    const date = new Date(isoTimestamp);
    
    // Display date: "01/15/2025"
    const dateStr = date.toLocaleDateString('en-US');
    
    // Display time: "2:30 PM"
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    
    return `${dateStr} at ${timeStr}`;
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

  getStatusClass(status: TripStatus | string): string {
    if (!status) return '';
    // Handle both TripStatus enum and string literals
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
    if (!status) return '';
    // Handle both TripStatus enum and string literals
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

  clearField(fieldName: string): void {
    this.filterForm.patchValue({ [fieldName]: '' });
    // Clear validation errors
    if (fieldName === 'truckPlate') {
      this.truckPlateError = '';
    } else if (fieldName === 'driverLicense') {
      this.driverLicenseError = '';
    }
  }

  clearAllFilters(): void {
    // Get current date range to preserve it
    const currentFilters = this.sharedFilterService.getCurrentFilters();
    
    // Update filters to clear only non-date filters
    this.sharedFilterService.updateFilters({
      dateRange: currentFilters.dateRange, // Preserve date range
      status: null,
      brokerId: null,
      truckId: null,
      driverId: null,
      driverName: null
    });
    
    // Also clear the form fields visually
    this.filterForm.patchValue({
      status: null,
      brokerId: null,
      truckPlate: '',
      driverLicense: ''
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
   * Converts human-readable inputs (plate, license) to UUIDs before sending to backend
   */
  private applyFilters(): void {
    const formValue = this.filterForm.value;
    
    const filtersToApply = {
      status: formValue.status,
      brokerId: formValue.brokerId,
      truckId: formValue.truckId,
      driverId: formValue.driverId,
      driverName: null
    };
    
    this.sharedFilterService.updateFilters(filtersToApply);
    
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
