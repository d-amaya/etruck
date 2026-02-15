import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, FormBuilder } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';
import { Subject, Observable } from 'rxjs';
import { takeUntil, switchMap, startWith, map } from 'rxjs/operators';
import { TripService } from '../../../../core/services/trip.service';
import { DriverAssetCacheService } from '../driver-asset-cache.service';
import { DriverDashboardStateService } from '../driver-dashboard-state.service';
import { DriverSharedFilterService } from '../driver-shared-filter.service';
import { DriverPdfExportService } from '../driver-pdf-export.service';
import { ExcelExportService } from '../../../../core/services/excel-export.service';

@Component({
  selector: 'app-driver-trip-table',
  templateUrl: './driver-trip-table.component.html',
  styleUrls: ['./driver-trip-table.component.scss']
})
export class DriverTripTableComponent implements OnInit, OnDestroy {
  trips: any[] = [];
  trucks: any[] = [];
  trailers: any[] = [];
  dispatchers: any[] = [];
  truckMap: Map<string, any> = new Map();
  trailerMap: Map<string, any> = new Map();
  dispatcherMap: Map<string, any> = new Map();

  displayedColumns = ['status', 'date', 'pickupLocation', 'deliveryLocation', 'dispatcher', 'truck', 'trailer', 'driverPayment', 'actions'];
  
  statusOptions = ['Delivered', 'In Transit', 'Paid', 'Picked Up', 'Scheduled'];
  filterForm: FormGroup;

  filteredTrucks: Observable<any[]>;
  filteredDispatchers: Observable<any[]>;

  pageSize = 10;
  pageIndex = 0;
  totalTrips = 0;
  loading = false;

  private destroy$ = new Subject<void>();

  constructor(
    private tripService: TripService,
    private assetCache: DriverAssetCacheService,
    private dashboardState: DriverDashboardStateService,
    private filterService: DriverSharedFilterService,
    private dialog: MatDialog,
    private pdfExportService: DriverPdfExportService,
    private excelExportService: ExcelExportService,
    private fb: FormBuilder
  ) {
    this.filterForm = this.fb.group({
      status: [null],
      truckId: [''],
      dispatcherId: ['']
    });

    this.filteredTrucks = this.filterForm.get('truckId')!.valueChanges.pipe(
      startWith(''),
      map(value => this._filterTrucks(value || ''))
    );

    this.filteredDispatchers = this.filterForm.get('dispatcherId')!.valueChanges.pipe(
      startWith(''),
      map(value => this._filterDispatchers(value || ''))
    );
  }

  ngOnInit(): void {
    // Load assets first, then subscribe to trips
    this.assetCache.loadAssets().pipe(
      takeUntil(this.destroy$)
    ).subscribe(cache => {
      this.truckMap = cache.trucks;
      this.trailerMap = cache.trailers;
      this.dispatcherMap = cache.dispatchers;
      this.trucks = Array.from(cache.trucks.values()).sort((a, b) => a.plate.localeCompare(b.plate));
      this.trailers = Array.from(cache.trailers.values()).sort((a, b) => a.plate.localeCompare(b.plate));
      this.dispatchers = Array.from(cache.dispatchers.values()).sort((a, b) => a.name.localeCompare(b.name));
      
      // Restore filter form from state after assets load
      const currentFilters = this.filterService.getCurrentFilters();
      this.filterForm.patchValue({
        status: currentFilters.status || null,
        truckId: currentFilters.truckId || '',
        dispatcherId: currentFilters.dispatcherId || ''
      }, { emitEvent: false });

      // Now that assets are loaded, subscribe to trips
      this.subscribeToTrips();
    });

    // Subscribe to filter controls
    this.filterForm.get('status')!.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(status => {
      this.filterService.updateFilters({ status });
    });

    this.filterForm.get('truckId')!.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(truckId => {
      if (truckId === null || (typeof truckId === 'string' && truckId.length === 36)) {
        this.filterService.updateFilters({ truckId });
      }
    });

    this.filterForm.get('dispatcherId')!.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(dispatcherId => {
      if (dispatcherId === null || (typeof dispatcherId === 'string' && dispatcherId.length === 36)) {
        this.filterService.updateFilters({ dispatcherId });
      }
    });
  }

  private subscribeToTrips(): void {
    this.dashboardState.filtersAndPagination$.pipe(
      switchMap(([filters, pagination]) => {
        this.pageSize = pagination.pageSize;
        this.pageIndex = pagination.page;
        return this.loadTrips(filters, pagination);
      }),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      if (result.chartAggregates) {
        this.dashboardState.updateDashboardData(result);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTrips(filters: any, pagination: any): Observable<any> {
    this.loading = true;
    this.dashboardState.setLoadingState(true, pagination.page === 0, true);

    const apiFilters: any = {
      limit: pagination.pageSize
    };

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
    if (filters.truckId) {
      apiFilters.truckId = filters.truckId;
    }
    if (filters.dispatcherId) {
      apiFilters.dispatcherId = filters.dispatcherId;
    }

    if (pagination.page > 0 && pagination.pageTokens && pagination.pageTokens[pagination.page - 1]) {
      apiFilters.lastEvaluatedKey = pagination.pageTokens[pagination.page - 1];
    }

    const isPaginating = pagination.page > 0;
    const needsAggregates = !isPaginating;

    const apiCall$: Observable<any> = needsAggregates 
      ? this.tripService.getDashboard(apiFilters)
      : this.tripService.getTrips(apiFilters);

    return apiCall$.pipe(
      map((response: any) => {
        this.trips = response.trips || [];
        
        if (response.lastEvaluatedKey) {
          const pageTokens = [...(pagination.pageTokens || [])];
          pageTokens[pagination.page] = response.lastEvaluatedKey;
          this.dashboardState.updatePaginationSilent({ pageTokens });
        }

        const itemsBeforeCurrentPage = pagination.page * pagination.pageSize;
        const currentPageItems = this.trips.length;
        
        if (response.lastEvaluatedKey) {
          this.totalTrips = itemsBeforeCurrentPage + currentPageItems + 1;
        } else {
          this.totalTrips = itemsBeforeCurrentPage + currentPageItems;
        }

        this.loading = false;
        this.dashboardState.setLoadingState(false, false, false);
        
        return response;
      })
    );
  }

  onPageChange(event: PageEvent): void {
    this.dashboardState.updatePagination({
      page: event.pageIndex,
      pageSize: event.pageSize
    });
  }

  openEditDialog(trip: any): void {
    import('./driver-trip-edit-dialog/driver-trip-edit-dialog.component').then(m => {
      const dialogRef = this.dialog.open(m.DriverTripEditDialogComponent, {
        width: '600px',
        data: { trip }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.updateTripStatus(trip.tripId, result.status, result.notes, result.deliveryTimestamp);
        }
      });
    });
  }

  updateTripStatus(tripId: string, status: string, notes: string, deliveryTimestamp?: string): void {
    const statusDto: any = { orderStatus: status as any, notes };
    if (deliveryTimestamp) {
      statusDto.deliveryTimestamp = deliveryTimestamp;
    }
    this.tripService.updateTripStatus(tripId, statusDto).subscribe({
      next: () => {
        const filters = this.filterService.getCurrentFilters();
        const pagination = this.dashboardState.getCurrentPagination();
        this.loadTrips(filters, pagination).subscribe(result => {
          if (result.chartAggregates) {
            this.dashboardState.updateDashboardData(result);
          }
        });
      },
      error: (error) => {
        console.error('Failed to update trip status:', error);
      }
    });
  }

  clearAllFilters(): void {
    this.filterForm.patchValue({
      status: null,
      truckId: null,
      dispatcherId: null
    });
    
    // Update the shared filter service to trigger data refresh
    this.filterService.updateFilters({
      status: null,
      truckId: null,
      dispatcherId: null
    });
  }

  exportPDF(): void {
    this.pdfExportService.exportDashboard();
  }

  exportCSV(): void {
    const filters: any = {};
    const currentFilters = this.filterService.getCurrentFilters();
    if (currentFilters.dateRange.startDate) filters.startDate = currentFilters.dateRange.startDate.toISOString();
    if (currentFilters.dateRange.endDate) filters.endDate = currentFilters.dateRange.endDate.toISOString();
    if (currentFilters.status) filters.orderStatus = currentFilters.status;

    this.tripService.getTrips(filters).subscribe({
      next: (res) => {
        const allTrips = res.trips || [];
        const headers = ['Status', 'Date', 'Pickup', 'Delivery', 'Dispatcher', 'Truck', 'Trailer', 'Payment'];
        const rows = allTrips.map((t: any) => [
          t.orderStatus || '',
          t.scheduledTimestamp?.split('T')[0] || '',
          `${t.pickupCity || ''}, ${t.pickupState || ''}`,
          `${t.deliveryCity || ''}, ${t.deliveryState || ''}`,
          this.getDispatcherDisplay(t.dispatcherId),
          this.getTruckDisplay(t.truckId),
          this.getTrailerDisplay(t.trailerId),
          t.driverPayment || 0
        ]);
        this.excelExportService.exportToExcel('driver-orders-export', [{ name: 'Orders', headers, rows }], currentFilters.dateRange.startDate, currentFilters.dateRange.endDate);
      }
    });
  }

  getTruckDisplay = (truckId: string): string => {
    const truck = this.truckMap?.get(truckId);
    return truck?.plate || truckId;
  };

  getTrailerDisplay = (trailerId: string): string => {
    const trailer = this.trailerMap?.get(trailerId);
    return trailer?.plate || trailerId;
  };

  getDispatcherDisplay = (dispatcherId: string): string => {
    const dispatcher = this.dispatcherMap?.get(dispatcherId);
    return dispatcher?.name || dispatcherId;
  };

  getStatusClass(status: string): string {
    switch (status) {
      case 'Scheduled': return 'status-scheduled';
      case 'Picked Up': return 'status-picked-up';
      case 'In Transit': return 'status-in-transit';
      case 'Delivered': return 'status-delivered';
      case 'Paid': return 'status-paid';
      default: return '';
    }
  }

  getStatusLabel(status: string): string {
    return status;
  }

  clearTruckFilter(): void {
    this.filterForm.patchValue({ truckId: '' });
    this.filterService.updateFilters({ truckId: null });
  }

  clearDispatcherFilter(): void {
    this.filterForm.patchValue({ dispatcherId: '' });
    this.filterService.updateFilters({ dispatcherId: null });
  }

  private _filterTrucks(value: string): any[] {
    if (!value || typeof value !== 'string') return this.trucks;
    const filterValue = value.toLowerCase();
    return this.trucks.filter(truck => truck.plate.toLowerCase().includes(filterValue));
  }

  private _filterDispatchers(value: string): any[] {
    if (!value || typeof value !== 'string') return this.dispatchers;
    const filterValue = value.toLowerCase();
    return this.dispatchers.filter(dispatcher => dispatcher.name.toLowerCase().includes(filterValue));
  }
}
