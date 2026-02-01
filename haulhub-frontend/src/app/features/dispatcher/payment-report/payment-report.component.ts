import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule, MatTabChangeEvent } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TripService } from '../../../core/services/trip.service';
import { DispatcherPaymentReport, PaymentReportFilters } from '@haulhub/shared';
import { SharedFilterService } from '../dashboard/shared-filter.service';
import { DashboardStateService } from '../dashboard/dashboard-state.service';
import { Input } from '@angular/core';

@Component({
  selector: 'app-payment-report',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTableModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './payment-report.component.html',
  styleUrls: ['./payment-report.component.scss']
})
export class PaymentReportComponent implements OnInit, OnDestroy {
  @Input() isWrapped = false; // Set by wrapper component
  
  private destroy$ = new Subject<void>();
  filterForm: FormGroup;
  report: DispatcherPaymentReport | null = null;
  loading = false;
  activeTabIndex = 0; // Initialize to 0 for "By Broker" tab (first tab)

  // Table columns
  brokerColumns: string[] = ['brokerName', 'totalPayment', 'tripCount'];
  driverColumns: string[] = ['driverName', 'totalPayment', 'tripCount'];
  truckColumns: string[] = ['truckName', 'totalPayment', 'tripCount'];
  
  // Enriched data for display
  enrichedDriverData: any[] = [];
  enrichedTruckData: any[] = [];
  
  // Asset maps
  private truckMap = new Map<string, any>();
  private driverMap = new Map<string, any>();

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
    private snackBar: MatSnackBar,
    private router: Router,
    private sharedFilterService: SharedFilterService,
    private dashboardStateService: DashboardStateService
  ) {
    this.filterForm = this.fb.group({
      startDate: [null],
      endDate: [null]
    });
  }

  ngOnInit(): void {
    // Load asset maps for enrichment
    this.loadAssetMaps();
    
    // Subscribe to shared filter changes
    this.sharedFilterService.filters$
      .pipe(takeUntil(this.destroy$))
      .subscribe(filters => {
        // Update form with shared filter values
        this.filterForm.patchValue({
          startDate: filters.dateRange.startDate,
          endDate: filters.dateRange.endDate
        }, { emitEvent: false });
        
        // Load report with new filters
        this.loadReport();
      });
  }

  /**
   * Load asset maps from API for enrichment
   */
  private loadAssetMaps(): void {
    this.tripService.getTrucksByCarrier().subscribe({
      next: (trucks) => {
        trucks.forEach(truck => this.truckMap.set(truck.truckId, truck));
      },
      error: (error) => console.error('Error loading trucks:', error)
    });
    
    this.tripService.getDriversByCarrier().subscribe({
      next: (drivers) => {
        drivers.forEach(driver => this.driverMap.set(driver.userId, driver));
      },
      error: (error) => console.error('Error loading drivers:', error)
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Enrich grouped data with human-readable names
   */
  private enrichGroupedData(): void {
    if (!this.report) return;
    
    // Enrich driver data
    if (this.report.groupedByDriver) {
      this.enrichedDriverData = Object.entries(this.report.groupedByDriver).map(([driverId, data]) => {
        const driver = this.driverMap.get(driverId);
        return {
          driverName: driver?.name || data.driverName || driverId.substring(0, 8),
          totalPayment: data.totalPayment,
          tripCount: data.tripCount
        };
      });
    }
    
    // Enrich truck data
    if (this.report.groupedByTruck) {
      this.enrichedTruckData = Object.entries(this.report.groupedByTruck).map(([truckId, data]) => {
        const truck = this.truckMap.get(truckId);
        const truckName = truck ? `${truck.plate} (${truck.brand} ${truck.year})` : truckId.substring(0, 8);
        return {
          truckName,
          totalPayment: data.totalPayment,
          tripCount: data.tripCount
        };
      });
    }
  }

  loadReport(): void {
    if (this.filterForm.invalid) {
      return;
    }

    // Only show component-level loading spinner if not wrapped
    if (!this.isWrapped) {
      this.loading = true;
      // Only set dashboard loading state when not wrapped (standalone mode)
      this.dashboardStateService.setLoadingState(true, false, true, 'Loading payment report...');
    }
    
    // Use shared filter service values instead of form values
    // This ensures we use the latest filter state from quick filter buttons
    const sharedFilters = this.sharedFilterService.getCurrentFilters();
    
    const filters: PaymentReportFilters = {};
    
    if (sharedFilters.dateRange.startDate) {
      filters.startDate = sharedFilters.dateRange.startDate.toISOString();
    }
    
    if (sharedFilters.dateRange.endDate) {
      filters.endDate = sharedFilters.dateRange.endDate.toISOString();
    }

    // Don't add groupBy - fetch all grouped data at once

    this.tripService.getPaymentReport(filters).subscribe({
      next: (report) => {
        this.report = report as DispatcherPaymentReport;
        this.enrichGroupedData();
        this.loading = false;
        // Always complete loading (trip-table does this too)
        this.dashboardStateService.setLoadingState(false);
        this.dashboardStateService.clearError();
      },
      error: (error) => {
        console.error('Error loading payment report:', error);
        this.snackBar.open('Failed to load payment report', 'Close', {
          duration: 3000
        });
        this.loading = false;
        // Always complete loading even on error
        this.dashboardStateService.setLoadingState(false);
        this.dashboardStateService.setError('Failed to load payment report. Please try again.');
      }
    });
  }

  onFilterSubmit(): void {
    this.loadReport();
  }

  onClearFilters(): void {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    this.filterForm.patchValue({
      startDate: firstDay,
      endDate: lastDay
    });
    
    this.loadReport();
  }

  onTabChange(event: MatTabChangeEvent): void {
    this.activeTabIndex = event.index;
    // Don't reload - just switch the view of existing data
  }

  getDriverGroupedData(): any[] {
    return this.enrichedDriverData;
  }

  getTruckGroupedData(): any[] {
    return this.enrichedTruckData;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getBrokerGroupedData(): Array<{ brokerId: string; brokerName: string; totalPayment: number; tripCount: number }> {
    if (!this.report?.groupedByBroker) {
      return [];
    }
    
    return Object.entries(this.report.groupedByBroker).map(([brokerId, data]) => ({
      brokerId,
      brokerName: data.brokerName,
      totalPayment: data.totalPayment,
      tripCount: data.tripCount
    }));
  }
  getTotalExpenses(): number {
    if (!this.report) {
      return 0;
    }
    
    // The backend should already calculate these totals using calculateTripExpenses
    // from @haulhub/shared, which includes:
    // - Fuel costs (calculated from fuelAvgCost * fuelAvgGallonsPerMile * totalMiles)
    // - Lumper fees
    // - Detention fees
    // These are returned as totalAdditionalFees in the report
    return this.report.totalAdditionalFees || 0;
  }

  goBack(): void {
    this.router.navigate(['/dispatcher/dashboard']);
  }
}
