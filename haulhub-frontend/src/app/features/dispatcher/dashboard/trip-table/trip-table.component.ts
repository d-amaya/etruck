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
import { MatMenuModule } from '@angular/material/menu';
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
import { ExcelExportService } from '../../../../core/services/excel-export.service';
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
    MatMenuModule,
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
    'status',
    'scheduledTimestamp',
    'pickupLocation',
    'dropoffLocation',
    'brokerName',
    'truckId',
    'truckOwnerId',
    'driverName',
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
  truckOwners: any[] = [];
  
  // Filtered observables for autocomplete
  filteredTrucks!: Observable<any[]>;
  filteredDrivers!: Observable<any[]>;
  filteredTruckOwners!: Observable<any[]>;
  
  // Asset lookup maps for filter validation and conversion
  private truckPlateToIdMap = new Map<string, string>(); // plate -> truckId
  private trailerPlateToIdMap = new Map<string, string>(); // plate -> trailerId
  private driverLicenseToIdMap = new Map<string, string>(); // license -> driverId
  private truckMap = new Map<string, any>(); // truckId -> truck (for display)
  private trailerMap = new Map<string, any>(); // trailerId -> trailer (for display)
  private driverMap = new Map<string, any>(); // driverId -> driver (for display)
  private brokerMap = new Map<string, any>(); // brokerId -> broker (for display)
  private truckOwnerMap = new Map<string, any>(); // truckOwnerId -> truckOwner (for display)
  
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
    private excelExportService: ExcelExportService,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private accessibilityService: AccessibilityService
  ) {
    this.filterForm = this.fb.group({
      status: [null],
      brokerId: [null],
      truckId: [null],
      driverId: [null],
      truckOwnerId: [null]
    });
  }

  ngOnInit(): void {
    // Sort status options alphabetically by label
    this.statusOptions = this.statusOptions.sort((a, b) => 
      this.getStatusLabel(a).localeCompare(this.getStatusLabel(b))
    );
    
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
      
      // Convert maps to arrays for dropdowns and sort alphabetically
      this.trucks = Array.from(cache.trucks.values()).sort((a, b) => 
        a.plate.localeCompare(b.plate)
      );
      this.drivers = Array.from(cache.drivers.values()).sort((a, b) => 
        a.name.localeCompare(b.name)
      );
      
      this.truckOwnerMap = cache.truckOwners;
      this.truckOwners = Array.from(cache.truckOwners.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      
      this.truckPlates = Array.from(cache.truckPlates.keys());
      this.trailerPlates = Array.from(cache.trailerPlates.keys());
      this.driverLicenses = Array.from(cache.driverLicenses.keys());
      
      // Setup autocomplete filtering for trucks
      this.filteredTrucks = this.filterForm.get('truckId')!.valueChanges.pipe(
        startWith(''),
        map(value => this._filterTrucks(value || ''))
      );
      
      // Setup autocomplete filtering for drivers
      this.filteredDrivers = this.filterForm.get('driverId')!.valueChanges.pipe(
        startWith(''),
        map(value => this._filterDrivers(value || ''))
      );

      // Setup autocomplete filtering for truck owners
      this.filteredTruckOwners = this.filterForm.get('truckOwnerId')!.valueChanges.pipe(
        startWith(''),
        map(value => this._filterTruckOwners(value || ''))
      );

      // Restore filter form from state after assets load
      const currentFilters = this.sharedFilterService.getCurrentFilters();
      this.filterForm.patchValue({
        status: currentFilters.status,
        brokerId: currentFilters.brokerId,
        truckId: currentFilters.truckId || '',
        driverId: currentFilters.driverId || '',
        truckOwnerId: currentFilters.truckOwnerId || ''
      }, { emitEvent: false });
    });
    
    // Load brokers for filter dropdown and sort alphabetically
    this.dashboardState.brokers$
      .pipe(takeUntil(this.destroy$))
      .subscribe(brokers => {
        this.brokers = brokers.sort((a, b) => 
          a.brokerName.localeCompare(b.brokerName)
        );
        this.brokerMap.clear();
        brokers.forEach(broker => {
          this.brokerMap.set(broker.brokerId, broker);
        });
      });

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
      
      // Share dashboard data (including chartAggregates) with other components
      if (result.chartAggregates) {
        this.dashboardState.updateDashboardData(result);
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
   * Get broker name from ID
   */
  getBrokerName(brokerId: string): string {
    return this.brokerMap.get(brokerId)?.brokerName || brokerId.substring(0, 8);
  }

  /**
   * Get driver name from ID
   */
  getDriverName(driverId: string): string {
    return this.driverMap.get(driverId)?.name || driverId.substring(0, 8);
  }

  /**
   * Get truck owner name from ID
   */
  getTruckOwnerName(truckOwnerId: string): string {
    return this.truckOwnerMap.get(truckOwnerId)?.name || truckOwnerId.substring(0, 8);
  }

  /**
   * Get pickup location string
   */
  getPickupLocation(trip: Trip): string {
    return trip.pickupCity && trip.pickupState 
      ? `${trip.pickupCity}, ${trip.pickupState}` 
      : '';
  }

  /**
   * Get delivery location string
   */
  getDeliveryLocation(trip: Trip): string {
    return trip.deliveryCity && trip.deliveryState 
      ? `${trip.deliveryCity}, ${trip.deliveryState}` 
      : '';
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
   * Filter trucks for autocomplete (by plate)
   */
  private _filterTrucks(value: string | any): any[] {
    // If value is an object (selected option), return all trucks
    if (typeof value === 'object') {
      return this.trucks;
    }
    
    const filterValue = (value || '').toString().toLowerCase();
    return this.trucks.filter(truck => 
      truck.plate.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Filter driver licenses for autocomplete
   */
  private _filterDriverLicenses(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.driverLicenses.filter(license => license.toLowerCase().includes(filterValue));
  }

  /**
   * Filter drivers for autocomplete (by name)
   */
  private _filterDrivers(value: string | any): any[] {
    // If value is an object (selected option), return all drivers
    if (typeof value === 'object') {
      return this.drivers;
    }
    
    const filterValue = (value || '').toString().toLowerCase();
    return this.drivers.filter(driver => 
      driver.name.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Filter truck owners for autocomplete (by name)
   */
  private _filterTruckOwners(value: string | any): any[] {
    if (typeof value === 'object') {
      return this.truckOwners;
    }
    
    const filterValue = (value || '').toString().toLowerCase();
    return this.truckOwners.filter(owner =>
      owner.name.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Clear truck filter
   */
  clearTruckFilter(): void {
    this.filterForm.patchValue({ truckId: null }, { emitEvent: false });
    this.applyFilters();
  }

  /**
   * Clear driver filter
   */
  clearDriverFilter(): void {
    this.filterForm.patchValue({ driverId: null }, { emitEvent: false });
    this.applyFilters();
  }

  /**
   * Clear truck owner filter
   */
  clearTruckOwnerFilter(): void {
    this.filterForm.patchValue({ truckOwnerId: null }, { emitEvent: false });
    this.applyFilters();
  }

  /**
   * Display function for truck autocomplete - shows plate instead of UUID
   */
  displayTruck = (truckId: string | null): string => {
    if (!truckId) return '';
    const truck = this.truckMap.get(truckId);
    return truck ? truck.plate : '';
  };

  /**
   * Display function for driver autocomplete - shows name instead of UUID
   */
  displayDriver = (driverId: string | null): string => {
    if (!driverId) return '';
    const driver = this.driverMap.get(driverId);
    return driver ? driver.name : '';
  };

  /**
   * Display function for truck owner autocomplete - shows name instead of UUID
   */
  displayTruckOwner = (truckOwnerId: string | null): string => {
    if (!truckOwnerId) return '';
    const owner = this.truckOwnerMap.get(truckOwnerId);
    return owner ? owner.name : '';
  };

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

  private loadTrips(filters: DashboardFilters, pagination: PaginationState): Observable<{ trips: Trip[], total: number, assets?: any, chartAggregates?: any }> {
    // Check cache first — avoid redundant API calls when switching views
    const cached = this.dashboardState.getCachedTrips(filters, pagination);
    if (cached) {
      this.loading = false;
      return of(cached);
    }

    this.loading = true;
    const apiFilters = this.buildApiFilters(filters, pagination);

    // Always fetch aggregates on first page load (page 0)
    // Table filters don't affect chart aggregates - charts always show all trips in date range
    const isPaginating = pagination.page > 0;
    const needsAggregates = !isPaginating;

    const apiCall$: Observable<any> = needsAggregates 
      ? this.tripService.getDashboard(apiFilters)
      : this.tripService.getTrips(apiFilters);

    return apiCall$.pipe(
      map((response: any) => {
        this.loading = false;
        const trips = response.trips;
        
        // Backend handles all filtering - just sort the results
        const sortedTrips = trips.sort((a: any, b: any) => {
          const dateA = new Date(a.scheduledTimestamp).getTime();
          const dateB = new Date(b.scheduledTimestamp).getTime();
          return dateB - dateA; // Descending order
        });
        
        // Update pagination state with new lastEvaluatedKey (silently, without triggering new query)
        if (response.lastEvaluatedKey) {
          // Store the token for the NEXT page
          // When on page 0, store token at index 0 (for fetching page 1)
          // When on page 1, store token at index 1 (for fetching page 2), etc.
          const pageTokens = [...(pagination.pageTokens || [])];
          pageTokens[pagination.page] = response.lastEvaluatedKey;
          
          this.dashboardState.updatePaginationSilent({ 
            pageTokens 
          });
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
        
        return { trips: sortedTrips, total, chartAggregates: response.chartAggregates };
      }),
      tap(result => {
        this.dashboardState.setCachedTrips(filters, pagination, result);
      }),
      catchError(error => {
        this.loading = false;
        
        // Ignore cancellation errors (they're expected when filters change rapidly)
        if (error.name === 'AbortError' || error.status === 0) {
          return of({ trips: [], total: 0 });
        }
        
        console.error('Error loading orders:', error);
        this.snackBar.open('Error loading orders. Please try again.', 'Close', {
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
      const d = filters.dateRange.startDate;
      apiFilters.startDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00.000Z`;
    }
    if (filters.dateRange.endDate) {
      const d = filters.dateRange.endDate;
      apiFilters.endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59:59.999Z`;
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
    if (filters.truckOwnerId) {
      apiFilters.truckOwnerId = filters.truckOwnerId;
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
        this.snackBar.open('Error navigating to order details', 'Close', { duration: 3000 });
      });
    } catch (error) {
      console.error('Error in viewTrip:', error);
      this.snackBar.open('Error viewing order', 'Close', { duration: 3000 });
    }
  }

  editTrip(trip: Trip): void {
    try {
      this.router.navigate(['/dispatcher/trips', trip.tripId, 'edit']).catch(err => {
        console.error('Navigation error:', err);
        this.snackBar.open('Error navigating to edit order', 'Close', { duration: 3000 });
      });
    } catch (error) {
      console.error('Error in editTrip:', error);
      this.snackBar.open('Error editing order', 'Close', { duration: 3000 });
    }
  }

  deleteTrip(trip: Trip): void {
    try {
      const pickupLoc = this.getPickupLocation(trip);
      const deliveryLoc = this.getDeliveryLocation(trip);
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        width: '400px',
        data: {
          title: 'Delete Order',
          message: `Are you sure you want to delete this trip from ${pickupLoc} to ${deliveryLoc}?`,
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
          'Order deleted successfully',
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
      return 'No orders found matching your filters. Try adjusting your filters or clear them to see all orders.';
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
      truckOwnerId: null
    });
    
    // Also clear the form fields visually
    this.filterForm.patchValue({
      status: null,
      brokerId: null,
      truckId: null,
      driverId: null,
      truckOwnerId: null
    });
    
    // Manually reset the paginator UI to page 0
    if (this.paginator) {
      this.paginator.pageIndex = 0;
    }
  }

  exportPDF(): void {
    this.pdfExportService.exportDashboard();
  }

  exportCSV(): void {
    this.snackBar.open('Exporting all orders...', '', { duration: 2000 });
    const filters = this.dashboardState.getCurrentFilters();
    const apiFilters: any = {};
    if (filters.dateRange.startDate) apiFilters.startDate = filters.dateRange.startDate.toISOString();
    if (filters.dateRange.endDate) apiFilters.endDate = filters.dateRange.endDate.toISOString();
    if (filters.status) apiFilters.orderStatus = filters.status;
    if (filters.brokerId) apiFilters.brokerId = filters.brokerId;
    if (filters.truckId) apiFilters.truckId = filters.truckId;
    if (filters.driverId) apiFilters.driverId = filters.driverId;
    if (filters.truckOwnerId) apiFilters.truckOwnerId = filters.truckOwnerId;

    this.tripService.getDashboardExport(apiFilters).subscribe({
      next: (data) => {
        const allTrips = data.trips || [];
        const brokerMap = new Map((data.assets?.brokers || []).map((b: any) => [b.brokerId, b.brokerName]));
        const driverMap = new Map((data.assets?.drivers || []).map((d: any) => [d.userId, d.name]));
        const truckMap = new Map((data.assets?.trucks || []).map((t: any) => [t.truckId, t.plate]));
        const headers = ['Status', 'Date', 'Pickup', 'Dropoff', 'Broker', 'Truck', 'Truck Owner', 'Driver', 'Revenue', 'Expenses', 'Profit/Loss'];
        const rows = allTrips.map((t: any) => {
          const expenses = (t.driverPayment || 0) + (t.dispatcherPayment || 0) + (t.truckOwnerPayment || 0) + (t.fuelCost || 0) + (t.lumperValue || 0) + (t.detentionValue || 0);
          const profit = (t.brokerPayment || 0) - expenses;
          const ownerName = this.getTruckOwnerName(t.truckOwnerId);
          return [
            t.orderStatus || '',
            t.scheduledTimestamp?.split('T')[0] || '',
            `${t.pickupCity || ''}, ${t.pickupState || ''}`,
            `${t.deliveryCity || ''}, ${t.deliveryState || ''}`,
            brokerMap.get(t.brokerId) || t.brokerId,
            truckMap.get(t.truckId) || t.truckId,
            ownerName,
            driverMap.get(t.driverId) || t.driverId,
            t.brokerPayment || 0,
            expenses,
            profit
          ];
        });
        this.excelExportService.exportToExcel('orders-export', [{ name: 'Orders', headers, rows }], filters.dateRange.startDate, filters.dateRange.endDate);
      },
      error: () => this.snackBar.open('Failed to export Excel', 'Close', { duration: 3000 })
    });
  }

  /**
   * Apply filters to shared filter service
   * Only applies filters if truck and driver selections are valid (from the list)
   */
  private applyFilters(): void {
    const formValue = this.filterForm.value;
    
    // Validate truck selection - only apply if it's a valid UUID or null
    let truckId = formValue.truckId;
    if (truckId && typeof truckId === 'string' && !this.isValidUUID(truckId)) {
      // User typed something but didn't select from list - ignore it
      console.log('Invalid truck selection, ignoring:', truckId);
      truckId = null;
    }
    
    // Validate driver selection - only apply if it's a valid UUID or null
    let driverId = formValue.driverId;
    if (driverId && typeof driverId === 'string' && !this.isValidUUID(driverId)) {
      // User typed something but didn't select from list - ignore it
      console.log('Invalid driver selection, ignoring:', driverId);
      driverId = null;
    }
    
    // Validate truck owner selection - only apply if it's a valid UUID or null
    let truckOwnerId = formValue.truckOwnerId;
    if (truckOwnerId && typeof truckOwnerId === 'string' && !this.isValidUUID(truckOwnerId)) {
      console.log('Invalid truck owner selection, ignoring:', truckOwnerId);
      truckOwnerId = null;
    }
    
    const filtersToApply = {
      status: formValue.status,
      brokerId: formValue.brokerId,
      truckId: truckId,
      driverId: driverId,
      truckOwnerId: truckOwnerId
    };
    
    this.sharedFilterService.updateFilters(filtersToApply);
    
    // Log pagination state after filter update
    setTimeout(() => {
      console.log('Pagination state after filter update:', this.dashboardState['paginationSubject'].value);
    }, 150);
  }

  /**
   * Check if a string is a valid UUID
   */
  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
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
