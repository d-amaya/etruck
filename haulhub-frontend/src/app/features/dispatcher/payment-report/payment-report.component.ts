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
import { takeUntil } from 'rxjs/operators';
import { TripService } from '../../../core/services/trip.service';
import { DispatcherPaymentReport, PaymentReportFilters } from '@haulhub/shared';
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
  report: DispatcherPaymentReport | null = null;
  loading = false;
  activeTabIndex = 0; // Initialize to 0 for "By Broker" tab (first tab)

  // Table columns
  brokerColumns: string[] = ['brokerName', 'totalPayment', 'tripCount'];
  driverColumns: string[] = ['driverName', 'totalPayment', 'tripCount'];
  truckOwnerColumns: string[] = ['ownerName', 'totalPayment', 'tripCount'];
  
  // Enriched data for display
  enrichedDriverData: any[] = [];
  enrichedTruckOwnerData: any[] = [];
  
  // Asset maps
  private truckMap = new Map<string, any>();
  private driverMap = new Map<string, any>();
  private brokerMap = new Map<string, any>();
  private truckOwnerMap = new Map<string, any>();

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
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

    // Subscribe to shared filter changes
    this.sharedFilterService.filters$
      .pipe(takeUntil(this.destroy$))
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
      cache.truckOwners.forEach((o, id) => this.truckOwnerMap.set(id, o));
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
          driverName: driver?.name || driverId.substring(0, 8),
          totalPayment: data.totalPayment,
          tripCount: data.tripCount
        };
      });
    }
    
    // Enrich truck owner data
    if (this.report.groupedByTruckOwner) {
      this.enrichedTruckOwnerData = Object.entries(this.report.groupedByTruckOwner).map(([ownerId, data]) => {
        const owner = this.truckOwnerMap.get(ownerId);
        return {
          ownerName: owner?.name || ownerId.substring(0, 8),
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
      const d = sharedFilters.dateRange.startDate;
      filters.startDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00.000Z`;
    }
    
    if (sharedFilters.dateRange.endDate) {
      const d = sharedFilters.dateRange.endDate;
      filters.endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59:59.999Z`;
    }

    // Don't add groupBy - fetch all grouped data at once

    // Check cache first — avoid redundant API calls when switching views
    const cached = this.dashboardStateService.getCachedPaymentReport(
      sharedFilters.dateRange.startDate, sharedFilters.dateRange.endDate
    );
    if (cached) {
      this.report = cached as DispatcherPaymentReport;
      this.enrichGroupedData();
      this.loading = false;
      this.dashboardStateService.setLoadingState(false);
      this.dashboardStateService.clearError();
      return;
    }

    this.tripService.getPaymentReport(filters).subscribe({
      next: (report) => {
        this.report = report as DispatcherPaymentReport;
        this.dashboardStateService.setCachedPaymentReport(
          sharedFilters.dateRange.startDate, sharedFilters.dateRange.endDate, report
        );
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

  getTruckOwnerGroupedData(): any[] {
    return this.enrichedTruckOwnerData;
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
    
    return Object.entries(this.report.groupedByBroker).map(([brokerId, data]) => {
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
    return this.report.totalAdditionalFees || 0;
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
    drawCard(14, 'Order Rate', this.formatCurrency(this.report?.totalBrokerPayments || 0), profitGreen);
    drawCard(14 + cardWidth + cardGap, 'Driver Payments', this.formatCurrency(this.report?.totalDriverPayments || 0), lossRed);
    drawCard(14 + (cardWidth + cardGap) * 2, 'Truck Owner Payments', this.formatCurrency(this.report?.totalTruckOwnerPayments || 0), lossRed);

    yPos += cardHeight + 15;

    // By Broker
    const brokerData = this.getBrokerGroupedData();
    if (brokerData.length > 0) {
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Payments by Broker', 14, yPos); yPos += 5;
      autoTable(doc, {
        startY: yPos,
        head: [['Broker', 'Total Payment', 'Trips']],
        body: brokerData.map(b => [b.brokerName, this.formatCurrency(b.totalPayment), b.tripCount.toString()]),
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } }
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // By Driver
    if (this.enrichedDriverData.length > 0) {
      if (yPos > 240) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Payments by Driver', 14, yPos); yPos += 5;
      autoTable(doc, {
        startY: yPos,
        head: [['Driver', 'Total Payment', 'Trips']],
        body: this.enrichedDriverData.map(d => [d.driverName, this.formatCurrency(d.totalPayment), d.tripCount.toString()]),
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } }
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // By Truck Owner
    if (this.enrichedTruckOwnerData.length > 0) {
      if (yPos > 240) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Payments by Truck Owner', 14, yPos); yPos += 5;
      autoTable(doc, {
        startY: yPos,
        head: [['Truck Owner', 'Total Payment', 'Trips']],
        body: this.enrichedTruckOwnerData.map(o => [o.ownerName, this.formatCurrency(o.totalPayment), o.tripCount.toString()]),
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } }
      });
    }

    doc.save(`dispatcher-payments-${new Date().toISOString().split('T')[0]}.pdf`);
    this.snackBar.open('Payment report exported to PDF successfully', 'Close', { duration: 3000 });
  }

  onExportCSV(): void {
    if (!this.report) return;
    const sheets: any[] = [];
    if (this.report.groupedByBroker) {
      sheets.push({
        name: 'By Broker',
        headers: ['Broker Name', 'Total Payment', 'Trip Count'],
        rows: Object.entries(this.report.groupedByBroker).map(([brokerId, data]: [string, any]) => [
          this.brokerMap.get(brokerId)?.brokerName || brokerId, data.totalPayment?.toFixed(2) || 0, data.tripCount || 0
        ])
      });
    }
    if (this.enrichedDriverData?.length > 0) {
      sheets.push({
        name: 'By Driver',
        headers: ['Driver Name', 'Total Payment', 'Trip Count'],
        rows: this.enrichedDriverData.map((d: any) => [
          d.driverName || d.driverId, d.totalPayment?.toFixed(2) || 0, d.tripCount || 0
        ])
      });
    }
    if (this.enrichedTruckOwnerData?.length > 0) {
      sheets.push({
        name: 'By Truck Owner',
        headers: ['Truck Owner', 'Total Payment', 'Trip Count'],
        rows: this.enrichedTruckOwnerData.map((o: any) => [
          o.ownerName || o.truckOwnerId, o.totalPayment?.toFixed(2) || 0, o.tripCount || 0
        ])
      });
    }
    if (sheets.length > 0) {
      const f = this.filterForm.value;
      this.excelExportService.exportToExcel('dispatcher-payments', sheets, f.startDate, f.endDate);
    }
  }

  goBack(): void {
    this.router.navigate(['/dispatcher/dashboard']);
  }
}
