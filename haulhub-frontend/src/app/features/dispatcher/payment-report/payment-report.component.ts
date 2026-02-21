import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule, MatTabChangeEvent } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { OrderService } from '../../../core/services/order.service';
import { OrderFilters } from '@haulhub/shared';
type PaymentReportFilters = Partial<OrderFilters>;
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SharedFilterService } from '../dashboard/shared-filter.service';
import { DashboardStateService } from '../dashboard/dashboard-state.service';
import { AssetCacheService } from '../dashboard/asset-cache.service';
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
    MatMenuModule,
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
  report: any | null = null;
  loading = false;
  activeTabIndex = 0; // Initialize to 0 for "By Broker" tab (first tab)

  // Table columns
  brokerColumns: string[] = ['brokerName', 'totalPayment', 'tripCount'];
  driverColumns: string[] = ['driverName', 'totalPayment', 'tripCount'];
  carrierColumns: string[] = ['carrierName', 'totalPayment', 'tripCount'];
  
  // Enriched data for display
  enrichedDriverData: any[] = [];
  enrichedBrokerData: any[] = [];
  enrichedCarrierData: any[] = [];
  
  // Asset maps
  private truckMap = new Map<string, any>();
  private driverMap = new Map<string, any>();
  private brokerMap = new Map<string, any>();
  private carrierMap = new Map<string, string>();

  constructor(
    private fb: FormBuilder,
    private orderService: OrderService,
    private snackBar: MatSnackBar,
    private excelExportService: ExcelExportService,
    private router: Router,
    private sharedFilterService: SharedFilterService,
    private dashboardStateService: DashboardStateService,
    private assetCache: AssetCacheService
  ) {
    this.filterForm = this.fb.group({
      startDate: [null],
      endDate: [null]
    });
  }

  ngOnInit(): void {
    // Load asset maps for enrichment
    this.loadAssetMaps();

    // Subscribe to shared filter changes (debounced to prevent multiple emissions)
    this.sharedFilterService.filters$
      .pipe(
        debounceTime(300),
        distinctUntilChanged((prev, curr) =>
          prev.dateRange.startDate?.getTime() === curr.dateRange.startDate?.getTime() &&
          prev.dateRange.endDate?.getTime() === curr.dateRange.endDate?.getTime()
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(filters => {
        this.filterForm.patchValue({
          startDate: filters.dateRange.startDate,
          endDate: filters.dateRange.endDate
        }, { emitEvent: false });
        this.loadReport();
      });
  }

  private loadAssetMaps(): void {
    this.assetCache.loadAssets().subscribe(cache => {
      cache.trucks.forEach((t, id) => this.truckMap.set(id, t));
      cache.drivers.forEach((d, id) => this.driverMap.set(id, d));
      cache.brokers.forEach((b, id) => this.brokerMap.set(id, b));
      cache.carriers.forEach((c: any, id) => this.carrierMap.set(id, c.name || id));
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Enrich grouped data with human-readable names from backend-grouped data
   */
  private enrichGroupedData(): void {
    if (!this.report) return;

    // Use backend-grouped data directly
    const groupedByBroker = this.report.groupedByBroker || {};
    const groupedByCarrier = this.report.groupedByCarrier || {};

    this.enrichedBrokerData = Object.entries(groupedByBroker).map(([id, g]: [string, any]) => ({
      brokerName: this.brokerMap.get(id)?.brokerName || id.substring(0, 8),
      totalPayment: g.totalPayment,
      tripCount: g.tripCount
    })).sort((a, b) => b.totalPayment - a.totalPayment);

    this.enrichedCarrierData = Object.entries(groupedByCarrier).map(([id, g]: [string, any]) => ({
      carrierName: this.carrierMap.get(id) || id.substring(0, 8),
      totalPayment: g.totalPayment,
      tripCount: g.tripCount
    })).sort((a, b) => b.totalPayment - a.totalPayment);

    // Resolve entity names for any cache misses
    const entityIds = this.report.entityIds || [];
    if (entityIds.length > 0) {
      this.assetCache.resolveEntities(entityIds).subscribe(resolved => {
        const nameMap = new Map(resolved.map((r: any) => [r.id, r.name]));
        this.enrichedBrokerData = Object.entries(groupedByBroker).map(([id, g]: [string, any]) => ({
          brokerName: this.brokerMap.get(id)?.brokerName || nameMap.get(id) || id.substring(0, 8),
          totalPayment: g.totalPayment, tripCount: g.tripCount
        })).sort((a, b) => b.totalPayment - a.totalPayment);
        this.enrichedCarrierData = Object.entries(groupedByCarrier).map(([id, g]: [string, any]) => ({
          carrierName: this.carrierMap.get(id) || nameMap.get(id) || id.substring(0, 8),
          totalPayment: g.totalPayment, tripCount: g.tripCount
        })).sort((a, b) => b.totalPayment - a.totalPayment);
      });
    }
  }

  loadReport(): void {
    if (this.filterForm.invalid) {
      return;
    }

    const sharedFilters = this.sharedFilterService.getCurrentFilters();

    // Check cache first — populated by Table view or Analytics view
    const cached = this.dashboardStateService.getCachedPaymentReport(
      sharedFilters.dateRange.startDate, sharedFilters.dateRange.endDate
    );
    if (cached) {
      this.report = cached as any;
      this.enrichGroupedData();
      this.loading = false;
      this.dashboardStateService.setLoadingState(false);
      this.dashboardStateService.clearError();
      return;
    }

    // Cache miss — show loading and fetch via unified endpoint
    if (!this.isWrapped) {
      this.loading = true;
      this.dashboardStateService.setLoadingState(true, false, true, 'Loading payment report...');
    }

    // Cache miss — fetch via unified endpoint (populates cache for all views)
    const currentPageSize = this.dashboardStateService['paginationSubject']?.value?.pageSize || 10;
    const filters: any = { includeAggregates: 'true', includeDetailedAnalytics: 'true', limit: currentPageSize };
    if (sharedFilters.dateRange.startDate) {
      const d = sharedFilters.dateRange.startDate;
      filters.startDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00.000Z`;
    }
    if (sharedFilters.dateRange.endDate) {
      const d = sharedFilters.dateRange.endDate;
      filters.endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59:59.999Z`;
    }

    this.orderService.getOrders(filters).subscribe({
      next: (response: any) => {
        const report = response.paymentReport;
        if (report) report.entityIds = response.entityIds || [];
        this.report = report as any;
        this.dashboardStateService.setCachedPaymentReport(
          sharedFilters.dateRange.startDate, sharedFilters.dateRange.endDate, report
        );
        // Cache analytics for Analytics view
        if (response.detailedAnalytics) {
          const analyticsData = { ...response.detailedAnalytics, paymentReport: report, entityIds: response.entityIds || [] };
          this.dashboardStateService.setCachedAnalytics(sharedFilters.dateRange.startDate, sharedFilters.dateRange.endDate, analyticsData);
        }
        // Cache orders for Table view (page 0, no table filters)
        if (response.orders?.length) {
          const defaultFilters = { dateRange: sharedFilters.dateRange, status: null, brokerId: null, truckId: null, driverId: null, carrierId: null };
          const defaultPagination = { page: 0, pageSize: currentPageSize, pageTokens: response.lastEvaluatedKey ? [response.lastEvaluatedKey] : [] };
          this.dashboardStateService.setCachedTrips(defaultFilters as any, defaultPagination, {
            orders: response.orders, total: response.lastEvaluatedKey ? response.orders.length + 1 : response.orders.length,
            chartAggregates: response.aggregates, lastEvaluatedKey: response.lastEvaluatedKey
          });
        }
        this.enrichGroupedData();
        this.loading = false;
        this.dashboardStateService.setLoadingState(false);
        this.dashboardStateService.clearError();
      },
      error: (error: any) => {
        console.error('Error loading payment report:', error);
        this.snackBar.open('Failed to load payment report', 'Close', { duration: 3000 });
        this.loading = false;
        this.dashboardStateService.setLoadingState(false);
        this.dashboardStateService.setError('Failed to load payment report. Please try again.');
      }
    });
  }

  onFilterSubmit(): void {
    this.dashboardStateService.invalidateViewCaches();
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
    
    this.dashboardStateService.invalidateViewCaches();
    this.loadReport();
  }

  onTabChange(event: MatTabChangeEvent): void {
    this.activeTabIndex = event.index;
    // Don't reload - just switch the view of existing data
  }

  getDriverGroupedData(): any[] {
    return this.enrichedDriverData;
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
    
    return Object.entries((this.report as any).groupedByBroker).map(([brokerId, data]: any) => {
      const broker = this.brokerMap.get(brokerId);
      return {
        brokerId,
        brokerName: broker?.brokerName || brokerId.substring(0, 8),
        totalPayment: data.totalPayment,
        tripCount: data.tripCount
      };
    });
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
    return 0;
  }

  onExportData(): void {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const primaryBlue: [number, number, number] = [25, 118, 210];
    const profitGreen: [number, number, number] = [46, 125, 50];
    const lossRed: [number, number, number] = [211, 47, 47];

    let yPos = 20;

    // Header banner
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('eTrucky', 14, 22);
    doc.setFontSize(16);
    doc.text('Dispatcher Payment Report', pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 22, { align: 'right' });

    yPos = 50;

    // Summary Cards
    const cardWidth = (pageWidth - 28 - 10) / 3;
    const cardHeight = 25;
    const cardGap = 5;
    const drawCard = (x: number, label: string, value: string, color: [number, number, number]) => {
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(x, yPos, cardWidth, cardHeight, 3, 3, 'F');
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(x, yPos, cardWidth, 3, 'F');
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(label, x + cardWidth / 2, yPos + 12, { align: 'center' });
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(color[0], color[1], color[2]);
      doc.text(value, x + cardWidth / 2, yPos + 20, { align: 'center' });
    };
    drawCard(14, 'Total Order Rate', this.formatCurrency(this.report?.totalOrderRate || 0), profitGreen);
    drawCard(14 + cardWidth + cardGap, 'Dispatcher Earnings', this.formatCurrency(this.report?.totalDispatcherPayment || 0), profitGreen);
    drawCard(14 + (cardWidth + cardGap) * 2, 'Total Orders', String(this.report?.orderCount || 0), primaryBlue);

    yPos += cardHeight + 15;

    // By Broker
    if (this.enrichedBrokerData.length > 0) {
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('By Broker', 14, yPos); yPos += 5;
      autoTable(doc, {
        startY: yPos,
        head: [['Broker', 'Total Order Rate', 'Orders']],
        body: this.enrichedBrokerData.map((b: any) => [b.brokerName, this.formatCurrency(b.totalPayment), b.tripCount.toString()]),
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // By Carrier
    if (this.enrichedCarrierData.length > 0) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('By Carrier', 14, yPos); yPos += 5;
      autoTable(doc, {
        startY: yPos,
        head: [['Carrier', 'Carrier Payment', 'Orders']],
        body: this.enrichedCarrierData.map((c: any) => [c.carrierName, this.formatCurrency(c.totalPayment), c.tripCount.toString()]),
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
      });
    }

    doc.save(`dispatcher-payments-${new Date().toISOString().split('T')[0]}.pdf`);
    this.snackBar.open('Payment report exported to PDF successfully', 'Close', { duration: 3000 });
  }

  onExportCSV(): void {
    if (!this.report) return;
    const sheets: any[] = [];
    if (this.enrichedBrokerData.length > 0) {
      sheets.push({
        name: 'By Broker',
        headers: ['Broker Name', 'Total Order Rate', 'Order Count'],
        rows: this.enrichedBrokerData.map((b: any) => [b.brokerName, b.totalPayment?.toFixed(2), b.tripCount])
      });
    }
    if (this.enrichedCarrierData.length > 0) {
      sheets.push({
        name: 'By Carrier',
        headers: ['Carrier Name', 'Carrier Payment', 'Order Count'],
        rows: this.enrichedCarrierData.map((c: any) => [c.carrierName, c.totalPayment?.toFixed(2), c.tripCount])
      });
    }
    if (sheets.length > 0) {
      const f = this.sharedFilterService.getCurrentFilters();
      this.excelExportService.exportToExcel('dispatcher-payments', sheets, f.dateRange.startDate, f.dateRange.endDate);
    }
  }

  goBack(): void {
    this.router.navigate(['/dispatcher/dashboard']);
  }
}
