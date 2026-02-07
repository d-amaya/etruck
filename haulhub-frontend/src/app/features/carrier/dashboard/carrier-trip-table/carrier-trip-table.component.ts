import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Observable } from 'rxjs';
import { takeUntil, distinctUntilChanged, switchMap, startWith, map } from 'rxjs/operators';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CarrierService, User } from '../../../../core/services/carrier.service';
import { CarrierFilterService } from '../../shared/carrier-filter.service';
import { CarrierAssetCacheService } from '../../shared/carrier-asset-cache.service';
import { CarrierDashboardStateService } from '../../shared/carrier-dashboard-state.service';
import { Trip, TripStatus, Broker, calculateTripProfit } from '@haulhub/shared';
import { CarrierChartsWidgetComponent } from '../carrier-charts-widget/carrier-charts-widget.component';

@Component({
  selector: 'app-carrier-trip-table',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    CarrierChartsWidgetComponent
  ],
  templateUrl: './carrier-trip-table.component.html',
  styleUrls: ['./carrier-trip-table.component.scss']
})
export class CarrierTripTableComponent implements OnInit, OnDestroy {
  @Output() dashboardDataLoaded = new EventEmitter<any>();

  displayedColumns = [
    'status',
    'scheduledTimestamp',
    'pickupLocation',
    'dropoffLocation',
    'dispatcherName',
    'brokerName',
    'truckId',
    'driverName',
    'revenue',
    'expenses',
    'profitLoss',
    'actions'
  ];

  trips: Trip[] = [];
  totalTrips = 0;
  pageSize = 10;
  pageIndex = 0;
  loading = false;
  lastDashboardResponse: any = null;

  filterForm: FormGroup;
  statusOptions = Object.values(TripStatus).sort();
  brokers: Broker[] = [];
  dispatchers: User[] = [];
  drivers: User[] = [];
  trucks: any[] = [];
  trailers: any[] = [];

  // Filtered observables for autocomplete
  filteredTrucks: Observable<any[]> = new Observable();
  filteredDrivers: Observable<any[]> = new Observable();
  filteredDispatchers: Observable<any[]> = new Observable();

  // Lookup maps for display
  private brokerMap = new Map<string, Broker>();
  private dispatcherMap = new Map<string, User>();
  private driverMap = new Map<string, User>();
  private truckMap = new Map<string, any>();
  private trailerMap = new Map<string, any>();

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private carrierService: CarrierService,
    private filterService: CarrierFilterService,
    private assetCache: CarrierAssetCacheService,
    private dashboardState: CarrierDashboardStateService,
    private router: Router
  ) {
    this.filterForm = this.fb.group({
      status: [null],
      brokerId: [null],
      dispatcherId: [null],
      driverId: [null],
      truckId: [null]
    });
  }

  ngOnInit(): void {
    // Load assets from cache
    this.assetCache.loadAssets().pipe(
      takeUntil(this.destroy$)
    ).subscribe(cache => {
      this.trucks = Array.from(cache.trucks.values()).sort((a, b) => a.plate.localeCompare(b.plate));
      this.trailers = Array.from(cache.trailers.values()).sort((a, b) => a.plate.localeCompare(b.plate));
      this.drivers = Array.from(cache.drivers.values()).sort((a, b) => a.name.localeCompare(b.name));
      this.dispatchers = Array.from(cache.dispatchers.values()).sort((a, b) => a.name.localeCompare(b.name));
      this.brokers = Array.from(cache.brokers.values()).sort((a, b) => a.brokerName.localeCompare(b.brokerName));
      
      this.truckMap = cache.trucks;
      this.trailerMap = cache.trailers;
      this.driverMap = cache.drivers;
      this.dispatcherMap = cache.dispatchers;
      this.brokerMap = cache.brokers;
      
      // Setup autocomplete filters
      this.filteredTrucks = this.filterForm.get('truckId')!.valueChanges.pipe(
        startWith(''),
        map(value => this._filterTrucks(value || ''))
      );
      
      this.filteredDrivers = this.filterForm.get('driverId')!.valueChanges.pipe(
        startWith(''),
        map(value => this._filterDrivers(value || ''))
      );
      
      this.filteredDispatchers = this.filterForm.get('dispatcherId')!.valueChanges.pipe(
        startWith(''),
        map(value => this._filterDispatchers(value || ''))
      );
    });
    
    // Subscribe to combined filters and pagination
    this.dashboardState.filtersAndPagination$.pipe(
      switchMap(([filters, pagination]) => {
        this.pageSize = pagination.pageSize;
        this.pageIndex = pagination.page;
        return this.loadTrips(filters, pagination);
      }),
      takeUntil(this.destroy$)
    ).subscribe((result: any) => {
      this.trips = result.trips;
      this.lastDashboardResponse = result;
      this.loading = false;
      
      const pagination = this.dashboardState.getCurrentPagination();
      
      // Store pagination token
      if (result.lastEvaluatedKey) {
        const pageTokens = [...pagination.pageTokens];
        pageTokens[pagination.page] = result.lastEvaluatedKey;
        this.dashboardState.updatePaginationSilent({ pageTokens });
        
        // Estimate total to enable next button
        const itemsBeforeCurrentPage = pagination.page * pagination.pageSize;
        const currentPageItems = result.trips.length;
        this.totalTrips = itemsBeforeCurrentPage + currentPageItems + 1;
      } else {
        // Last page - exact total
        const itemsBeforeCurrentPage = pagination.page * pagination.pageSize;
        const currentPageItems = result.trips.length;
        this.totalTrips = itemsBeforeCurrentPage + currentPageItems;
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }


  loadTrips(filters: any, pagination: any): Observable<any> {
    this.loading = true;
    
    // Smart pagination: only fetch aggregates on page 0
    const needsAggregates = pagination.page === 0;
    
    const apiFilters: any = {
      limit: pagination.pageSize,
    };
    
    if (filters.dateRange?.startDate) {
      apiFilters.startDate = filters.dateRange.startDate.toISOString();
    }
    if (filters.dateRange?.endDate) {
      apiFilters.endDate = filters.dateRange.endDate.toISOString();
    }
    if (filters.status) {
      apiFilters.orderStatus = filters.status;
    }
    if (filters.brokerId) {
      apiFilters.brokerId = filters.brokerId;
    }
    if (filters.dispatcherId) {
      apiFilters.dispatcherId = filters.dispatcherId;
    }
    if (filters.driverId) {
      apiFilters.driverId = filters.driverId;
    }
    if (filters.truckId) {
      apiFilters.truckId = filters.truckId;
    }
    
    if (pagination.page > 0 && pagination.pageTokens[pagination.page - 1]) {
      apiFilters.lastEvaluatedKey = pagination.pageTokens[pagination.page - 1];
    }
    
    // Page 0: unified endpoint with aggregates
    // Page N: trips only endpoint
    if (needsAggregates) {
      return this.carrierService.getDashboardUnified(apiFilters);
    } else {
      return this.carrierService.getTrips(apiFilters);
    }
  }

  onFilterChange(): void {
    const formValue = this.filterForm.value;
    const currentFilters = this.dashboardState.getCurrentFilters();
    
    this.dashboardState.updateFilters({
      ...currentFilters,
      status: formValue.status,
      brokerId: formValue.brokerId,
      dispatcherId: formValue.dispatcherId,
      driverId: formValue.driverId,
      truckId: formValue.truckId,
    });
  }

  clearAllFilters(): void {
    this.filterForm.reset({
      status: null,
      brokerId: null,
      dispatcherId: null,
      driverId: null,
      truckId: null
    });
    this.dashboardState.resetFilters();
  }

  onPageChange(event: PageEvent): void {
    this.dashboardState.updatePagination({
      page: event.pageIndex,
      pageSize: event.pageSize,
    });
  }

  viewTrip(trip: Trip): void {
    this.router.navigate(['/carrier/trips', trip.tripId]);
  }

  createTrip(): void {
    this.router.navigate(['/carrier/trips/create']);
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
    return (trip.driverPayment || 0) + (trip.truckOwnerPayment || 0) + (trip.fuelCost || 0);
  }

  getTruckDisplay(truckId: string): string {
    if (!truckId) return 'N/A';
    const truck = this.truckMap.get(truckId);
    return truck ? truck.plate : truckId.substring(0, 8);
  }

  getTrailerDisplay(trailerId: string): string {
    if (!trailerId) return 'N/A';
    const trailer = this.trailerMap.get(trailerId);
    return trailer ? trailer.plate : trailerId.substring(0, 8);
  }

  getDriverDisplay(driverId: string): string {
    if (!driverId) return 'N/A';
    const driver = this.driverMap.get(driverId);
    return driver ? driver.name : driverId.substring(0, 8);
  }

  getBrokerDisplay(brokerId: string): string {
    if (!brokerId) return 'N/A';
    const broker = this.brokerMap.get(brokerId);
    return broker ? broker.brokerName : brokerId;
  }

  getDispatcherDisplay(dispatcherId: string): string {
    if (!dispatcherId) return 'N/A';
    const dispatcher = this.dispatcherMap.get(dispatcherId);
    return dispatcher ? dispatcher.name : dispatcherId.substring(0, 8);
  }

  getStatusClass(status: TripStatus | string): string {
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

  getStatusAriaLabel(status: TripStatus): string {
    return `Trip status: ${this.getStatusLabel(status)}`;
  }

  getActionAriaLabel(action: string, tripId: string, destination?: string): string {
    const dest = destination ? ` to ${destination}` : '';
    return `${action} trip${dest}`;
  }

  getProfitAriaLabel(trip: Trip): string {
    const profit = this.calculateProfit(trip);
    const profitText = this.formatCurrency(profit);
    const profitType = profit >= 0 ? 'profit' : 'loss';
    return `${profitType}: ${profitText}`;
  }

  getEmptyStateMessage(): string {
    return 'No trips found matching your filters.';
  }

  get hasActiveFilters(): boolean {
    const formValue = this.filterForm.value;
    return !!(formValue.status || formValue.brokerId || formValue.dispatcherId || formValue.driverId || formValue.truckId);
  }

  private _filterTrucks(value: string | any): any[] {
    if (typeof value === 'object') {
      return this.trucks;
    }
    const filterValue = (value || '').toString().toLowerCase();
    return this.trucks.filter(truck => 
      truck.plate.toLowerCase().includes(filterValue)
    );
  }

  private _filterDrivers(value: string | any): any[] {
    if (typeof value === 'object') {
      return this.drivers;
    }
    const filterValue = (value || '').toString().toLowerCase();
    return this.drivers.filter(driver => {
      const name = driver.name.toLowerCase();
      const words = name.split(' ');
      return words.some(word => word.startsWith(filterValue)) || name.includes(filterValue);
    });
  }

  private _filterDispatchers(value: string | any): any[] {
    if (typeof value === 'object') {
      return this.dispatchers;
    }
    const filterValue = (value || '').toString().toLowerCase();
    const filtered = this.dispatchers.filter(dispatcher => {
      const name = dispatcher.name.toLowerCase();
      const words = name.split(' ');
      // Match if any word starts with the filter value OR full name contains it
      return words.some(word => word.startsWith(filterValue)) || name.includes(filterValue);
    });
    return filtered;
  }

  displayTruck = (truckId: string | null): string => {
    if (!truckId) return '';
    const truck = this.truckMap.get(truckId);
    return truck ? truck.plate : '';
  };

  displayDriver = (driverId: string | null): string => {
    if (!driverId) return '';
    const driver = this.driverMap.get(driverId);
    return driver ? driver.name : '';
  };

  displayDispatcher = (dispatcherId: string | null): string => {
    if (!dispatcherId) return '';
    const dispatcher = this.dispatcherMap.get(dispatcherId);
    return dispatcher ? dispatcher.name : '';
  };

  clearTruckFilter(): void {
    this.filterForm.patchValue({ truckId: null });
    this.onFilterChange();
  }

  clearDriverFilter(): void {
    this.filterForm.patchValue({ driverId: null });
    this.onFilterChange();
  }

  clearDispatcherFilter(): void {
    this.filterForm.patchValue({ dispatcherId: null });
    this.onFilterChange();
  }

  exportPDF(): void {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    const primaryBlue: [number, number, number] = [25, 118, 210];
    const lightBlue: [number, number, number] = [227, 242, 253];
    const profitGreen: [number, number, number] = [46, 125, 50];
    const lossRed: [number, number, number] = [211, 47, 47];
    
    let yPosition = 20;
    
    // Header
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('eTrucky', 14, 22);
    doc.setFontSize(16);
    doc.text('Carrier Dashboard Report', pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 22, { align: 'right' });
    
    yPosition = 45;
    
    // Filters section
    const filters = this.dashboardState.getCurrentFilters();
    const filterParts = [];
    if (filters.dateRange.startDate && filters.dateRange.endDate) {
      filterParts.push(`Date: ${this.formatDate(filters.dateRange.startDate.toISOString())} - ${this.formatDate(filters.dateRange.endDate.toISOString())}`);
    }
    if (filters.status) filterParts.push(`Status: ${filters.status}`);
    if (filters.brokerId) filterParts.push(`Broker: ${this.getBrokerDisplay(filters.brokerId)}`);
    if (filters.dispatcherId) filterParts.push(`Dispatcher: ${this.getDispatcherDisplay(filters.dispatcherId)}`);
    if (filters.driverId) filterParts.push(`Driver: ${this.getDriverDisplay(filters.driverId)}`);
    if (filters.truckId) filterParts.push(`Truck: ${this.getTruckDisplay(filters.truckId)}`);
    
    if (filterParts.length > 0) {
      doc.setFillColor(lightBlue[0], lightBlue[1], lightBlue[2]);
      doc.rect(14, yPosition - 5, pageWidth - 28, 12, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text(`Filters: ${filterParts.join(' | ')}`, pageWidth / 2, yPosition + 2, { align: 'center' });
      yPosition += 18;
    }
    
    // Summary cards
    const response = this.lastDashboardResponse;
    if (response?.chartAggregates) {
      const payment = response.chartAggregates.paymentSummary;
      const cardWidth = (pageWidth - 28 - 30) / 4;
      const cardHeight = 25;
      const cardGap = 10;
      
      this.drawSummaryCard(doc, 14, yPosition, cardWidth, cardHeight, 
        'Total Trips', this.trips.length.toString(), primaryBlue);
      this.drawSummaryCard(doc, 14 + cardWidth + cardGap, yPosition, cardWidth, cardHeight,
        'Total Revenue', this.formatCurrency(payment.totalBrokerPayments), profitGreen);
      this.drawSummaryCard(doc, 14 + (cardWidth + cardGap) * 2, yPosition, cardWidth, cardHeight,
        'Total Expenses', this.formatCurrency(payment.totalDriverPayments + payment.totalTruckOwnerPayments + (payment.totalFuelCost || 0) + (payment.totalLumperFees || 0) + (payment.totalDetentionFees || 0)), lossRed);
      this.drawSummaryCard(doc, 14 + (cardWidth + cardGap) * 3, yPosition, cardWidth, cardHeight,
        payment.totalProfit >= 0 ? 'Net Profit' : 'Net Loss', 
        this.formatCurrency(Math.abs(payment.totalProfit)), 
        payment.totalProfit >= 0 ? profitGreen : lossRed);
      
      yPosition += cardHeight + 15;
    }
    
    // Table
    const tableData = this.trips.map(trip => [
      this.getStatusLabel(trip.orderStatus || 'Scheduled'),
      this.formatDate(trip.scheduledTimestamp),
      `${trip.pickupCity}, ${trip.pickupState}`,
      `${trip.deliveryCity}, ${trip.deliveryState}`,
      this.getDispatcherDisplay(trip.dispatcherId),
      this.getBrokerDisplay(trip.brokerId),
      this.getTruckDisplay(trip.truckId),
      this.getDriverDisplay(trip.driverId),
      this.formatCurrency(trip.brokerPayment || 0),
      this.formatCurrency(this.calculateExpenses(trip)),
      this.formatCurrency(this.calculateProfit(trip))
    ]);
    
    autoTable(doc, {
      startY: yPosition,
      head: [['Status', 'Date', 'Pickup', 'Delivery', 'Dispatcher', 'Broker', 'Truck', 'Driver', 'Revenue', 'Expenses', 'Profit']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        8: { halign: 'right' },
        9: { halign: 'right' },
        10: { halign: 'right' }
      }
    });
    
    doc.save(`carrier-dashboard-${new Date().toISOString().split('T')[0]}.pdf`);
  }

  private drawSummaryCard(doc: jsPDF, x: number, y: number, width: number, height: number, label: string, value: string, color: [number, number, number]): void {
    // Card background
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, y, width, height, 3, 3, 'F');
    
    // Colored top border
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x, y, width, 3, 'F');
    
    // Label
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(label, x + width / 2, y + 12, { align: 'center' });
    
    // Value
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(value, x + width / 2, y + 20, { align: 'center' });
  }

  Math = Math;
}
