import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CarrierService } from '../../../core/services/carrier.service';
type DispatcherPaymentReport = any;
import { CarrierFilterService } from '../shared/carrier-filter.service';
import { CarrierDashboardStateService } from '../shared/carrier-dashboard-state.service';
import { CarrierAssetCacheService } from '../shared/carrier-asset-cache.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-carrier-payment-report',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    MatSnackBarModule
  ],
  templateUrl: './payment-report.component.html',
  styleUrls: ['./payment-report.component.scss']
})
export class CarrierPaymentReportComponent implements OnInit, OnDestroy {
  @Input() isWrapped = false;
  
  private destroy$ = new Subject<void>();
  report: DispatcherPaymentReport | null = null;
  loading = false;
  activeTabIndex = 0;

  brokerColumns: string[] = ['brokerName', 'totalPayment', 'tripCount'];
  driverColumns: string[] = ['driverName', 'totalPayment', 'tripCount'];
  fuelColumns: string[] = ['truckName', 'trips', 'totalMiles', 'avgMPG', 'totalCost'];
  truckColumns: string[] = ['truckName', 'totalPayment', 'tripCount'];
  
  enrichedDriverData: any[] = [];
  enrichedBrokerData: any[] = [];
  fuelByTruck: any[] = [];
  
  private truckMap = new Map<string, any>();
  private driverMap = new Map<string, any>();
  private brokerMap = new Map<string, any>();

  constructor(
    private carrierService: CarrierService,
    private snackBar: MatSnackBar,
    private excelExportService: ExcelExportService,
    private filterService: CarrierFilterService,
    private dashboardState: CarrierDashboardStateService,
    private assetCache: CarrierAssetCacheService
  ) {}

  ngOnInit(): void {
    this.loadAssetMaps();
    
    this.filterService.dateFilter$
      .pipe(
        debounceTime(300),
        distinctUntilChanged((prev, curr) =>
          prev.startDate?.getTime() === curr.startDate?.getTime() &&
          prev.endDate?.getTime() === curr.endDate?.getTime()
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.loadReport();
      });
  }

  private loadAssetMaps(): void {
    this.assetCache.loadAssets().subscribe(cache => {
      this.truckMap = cache.trucks;
      this.driverMap = cache.drivers;
      cache.brokers.forEach((b, id) => this.brokerMap.set(id, b));
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private enrichGroupedData(): void {
    if (!this.report) return;

    // Use backend-grouped data directly
    const groupedByBroker = (this.report as any).groupedByBroker || {};
    const groupedByCarrier = (this.report as any).groupedByCarrier || {};

    // Driver payroll from backend-grouped data
    const groupedByDriver = (this.report as any).groupedByDriver || {};
    this.enrichedDriverData = Object.entries(groupedByDriver).map(([id, g]: [string, any]) => ({
      driverName: this.driverMap.get(id)?.name || id.substring(0, 8),
      totalPayment: g.totalPayment,
      tripCount: g.tripCount
    })).sort((a, b) => b.totalPayment - a.totalPayment);

    this.enrichedBrokerData = Object.entries(groupedByBroker).map(([id, g]: [string, any]) => ({
      brokerName: this.brokerMap.get(id)?.brokerName || id.substring(0, 8),
      totalPayment: g.totalPayment,
      tripCount: g.tripCount
    })).sort((a, b) => b.totalPayment - a.totalPayment);

    // Fuel data from backend analytics (if cached)
    const filters = this.filterService.getCurrentFilter();
    const cachedAnalytics = this.filterService.getCachedAnalytics(filters.startDate, filters.endDate);
    if (cachedAnalytics?.fuelAnalytics?.vehicleFuelEfficiency) {
      this.fuelByTruck = cachedAnalytics.fuelAnalytics.vehicleFuelEfficiency.map((v: any) => ({
        truckName: this.truckMap.get(v.vehicleId)?.plate || v.vehicleId?.substring(0, 8),
        trips: v.totalTrips, totalMiles: v.totalDistance,
        totalCost: v.totalFuelCost,
        avgMPG: v.averageMPG || 0,
      })).sort((a: any, b: any) => b.totalCost - a.totalCost);
    }
  }

  loadReport(): void {
    const filters = this.filterService.getCurrentFilter();

    // Check cache first (populated by Table view or Analytics view)
    const cached = this.filterService.getCachedPaymentReport(filters.startDate, filters.endDate);
    if (cached) {
      this.report = cached as DispatcherPaymentReport;
      this.enrichGroupedData();
      this.loading = false;
      return;
    }

    // Cache miss — fetch via unified endpoint
    this.loading = true;
    const currentPageSize = (this.dashboardState as any).paginationSubject?.value?.pageSize || 10;
    const apiFilters: any = { includeDetailedAnalytics: 'true', limit: currentPageSize };
    if (filters.startDate) {
      const d = filters.startDate;
      apiFilters.startDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00.000Z`;
    }
    if (filters.endDate) {
      const d = filters.endDate;
      apiFilters.endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59:59.999Z`;
    }

    this.carrierService.getDashboardUnified(apiFilters).subscribe({
      next: (response: any) => {
        const report = response.paymentReport;
        if (report) report.entityIds = response.entityIds || [];
        this.report = report as DispatcherPaymentReport;
        this.filterService.setCachedPaymentReport(filters.startDate, filters.endDate, report);
        // Cache analytics for Analytics view
        if (response.detailedAnalytics) {
          const analyticsData = { ...response.detailedAnalytics, paymentReport: report, entityIds: response.entityIds || [] };
          this.filterService.setCachedAnalytics(filters.startDate, filters.endDate, analyticsData);
        }
        // Cache orders for Table view (page 0, no table filters)
        const trips = response.trips || [];
        if (trips.length) {
          const defaultFilters = { dateRange: { startDate: filters.startDate, endDate: filters.endDate }, status: null, truckId: null, driverId: null, dispatcherId: null } as any;
          const defaultPagination = { page: 0, pageSize: currentPageSize, pageTokens: response.lastEvaluatedKey ? [response.lastEvaluatedKey] : [] };
          this.filterService.setCachedTrips(defaultFilters, defaultPagination, {
            chartAggregates: response.chartAggregates || {}, trips,
            entityIds: response.entityIds, lastEvaluatedKey: response.lastEvaluatedKey
          });
        }
        this.enrichGroupedData();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading payment report:', error);
        this.snackBar.open('Failed to load payment report', 'Close', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  onTabChange(index: number): void {
    this.activeTabIndex = index;
  }

  getBrokerName(brokerId: string): string {
    const broker = this.brokerMap.get(brokerId);
    return broker?.brokerName || brokerId.substring(0, 8);
  }

  getEnrichedBrokerData(): any[] {
    return this.enrichedBrokerData;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  }

  onExportData(): void {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const primaryBlue: [number, number, number] = [25, 118, 210];
    const profitGreen: [number, number, number] = [46, 125, 50];
    const lossRed: [number, number, number] = [211, 47, 47];
    
    let yPos = 20;
    
    // Header
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('eTrucky', 14, 22);
    doc.setFontSize(16);
    doc.text('Carrier Payment Report', pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 22, { align: 'right' });
    
    yPos = 50;
    
    // Summary Cards
    const cardWidth = (pageWidth - 28 - 15) / 4;
    const cardHeight = 25;
    const cardGap = 5;
    
    this.drawSummaryCard(doc, 14, yPos, cardWidth, cardHeight, 'Carrier Revenue', 
      this.formatCurrency(this.report?.totalCarrierPayment || 0), profitGreen);
    this.drawSummaryCard(doc, 14 + cardWidth + cardGap, yPos, cardWidth, cardHeight, 'Driver Payroll',
      this.formatCurrency(this.report?.totalDriverPayment || 0), lossRed);
    this.drawSummaryCard(doc, 14 + (cardWidth + cardGap) * 2, yPos, cardWidth, cardHeight, 'Fuel Cost',
      this.formatCurrency(this.report?.totalFuelCost || 0), lossRed);
    this.drawSummaryCard(doc, 14 + (cardWidth + cardGap) * 3, yPos, cardWidth, cardHeight, 'Net Profit',
      this.formatCurrency(this.report?.profit || 0), (this.report?.profit || 0) >= 0 ? profitGreen : lossRed);
    
    yPos += cardHeight + 15;
    
    // Driver Payroll
    if (this.enrichedDriverData.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Driver Payroll', 14, yPos);
      yPos += 5;
      
      autoTable(doc, {
        startY: yPos,
        head: [['Driver', 'Total Payment', 'Orders']],
        body: this.enrichedDriverData.map(d => [d.driverName, this.formatCurrency(d.totalPayment), d.tripCount.toString()]),
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } }
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    // Fuel Cost by Truck
    if (this.fuelByTruck.length > 0) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Fuel Cost by Truck', 14, yPos);
      yPos += 5;
      
      autoTable(doc, {
        startY: yPos,
        head: [['Truck', 'Trips', 'Total Miles', 'Avg MPG', 'Total Fuel Cost']],
        body: this.fuelByTruck.map(f => [
          f.truckName, f.trips.toString(), `${f.totalMiles.toFixed(0)} mi`,
          f.avgMPG.toFixed(2), this.formatCurrency(f.totalCost)
        ]),
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right' } }
      });
    }
    
    doc.save(`carrier-payments-${new Date().toISOString().split('T')[0]}.pdf`);
    this.snackBar.open('Payment report exported to PDF successfully', 'Close', { duration: 3000 });
  }

  onExportCSV(): void {
    if (!this.report) return;
    const sheets: any[] = [];
    if (this.enrichedDriverData?.length > 0) {
      sheets.push({
        name: 'Driver Payroll',
        headers: ['Driver Name', 'Total Payment', 'Order Count'],
        rows: this.enrichedDriverData.map((d: any) => [
          d.driverName, d.totalPayment?.toFixed(2) || 0, d.tripCount || 0
        ])
      });
    }
    if (this.fuelByTruck?.length > 0) {
      sheets.push({
        name: 'Fuel Cost by Truck',
        headers: ['Truck', 'Trips', 'Total Miles', 'Avg MPG', 'Total Fuel Cost'],
        rows: this.fuelByTruck.map((f: any) => [
          f.truckName, f.trips, f.totalMiles?.toFixed(0), f.avgMPG?.toFixed(2), f.totalCost?.toFixed(2)
        ])
      });
    }
    if (sheets.length > 0) {
      const f = this.filterService.getCurrentFilter();
      this.excelExportService.exportToExcel('carrier-payments', sheets, f.startDate, f.endDate);
    }
  }

  private drawSummaryCard(doc: jsPDF, x: number, y: number, width: number, height: number, label: string, value: string, color: [number, number, number]): void {
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, y, width, height, 3, 3, 'F');
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x, y, width, 3, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(label, x + width / 2, y + 12, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(value, x + width / 2, y + 20, { align: 'center' });
  }
}
