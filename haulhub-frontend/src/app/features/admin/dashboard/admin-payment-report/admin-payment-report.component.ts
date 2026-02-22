import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ExcelExportService } from '../../../../core/services/excel-export.service';
import { OrderService } from '../../../../core/services/order.service';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AdminDashboardStateService } from '../admin-state.service';
import { AdminFilterService } from '../admin-filter.service';
import { AdminAssetCacheService } from '../admin-asset-cache.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-admin-payment-report',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatTableModule, MatTabsModule,
    MatProgressSpinnerModule, MatIconModule, MatMenuModule, MatButtonModule, MatSnackBarModule
  ],
  templateUrl: './admin-payment-report.component.html',
  styleUrls: ['./admin-payment-report.component.scss']
})
export class AdminPaymentReportComponent implements OnInit, OnDestroy {
  @Input() isWrapped = false;

  private destroy$ = new Subject<void>();
  report: any = null;
  loading = false;
  activeTabIndex = 0;

  dispatcherColumns: string[] = ['dispatcherName', 'totalPayment', 'tripCount'];
  brokerColumns: string[] = ['brokerName', 'totalPayment', 'tripCount'];
  carrierColumns: string[] = ['carrierName', 'totalPayment', 'tripCount'];

  enrichedDispatcherData: any[] = [];
  enrichedBrokerData: any[] = [];
  enrichedCarrierData: any[] = [];

  private startDate: Date | null = null;
  private endDate: Date | null = null;

  constructor(
    private dashboardState: AdminDashboardStateService,
    private adminFilterService: AdminFilterService,
    private assetCache: AdminAssetCacheService,
    private orderService: OrderService,
    private excelExportService: ExcelExportService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.adminFilterService.filters$.pipe(
      debounceTime(300),
      distinctUntilChanged((prev, curr) =>
        prev.dateRange.startDate?.getTime() === curr.dateRange.startDate?.getTime() &&
        prev.dateRange.endDate?.getTime() === curr.dateRange.endDate?.getTime()
      ),
      takeUntil(this.destroy$)
    ).subscribe(filters => {
      this.startDate = filters.dateRange.startDate;
      this.endDate = filters.dateRange.endDate;
      this.loadReport();
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  loadReport(): void {
    const cached = this.dashboardState.getCachedPaymentReport(this.startDate, this.endDate);
    if (cached) {
      this.report = cached;
      this.enrichGroupedData();
      this.loading = false;
      this.dashboardState.completeLoad();
      const entityIds = cached.entityIds || [];
      if (entityIds.length > 0) {
        this.assetCache.resolveEntities(entityIds).pipe(takeUntil(this.destroy$)).subscribe(() => {
          this.enrichGroupedData();
        });
      }
      return;
    }

    this.loading = true;
    const currentPageSize = (this.dashboardState as any).paginationSubject?.value?.pageSize || 10;
    const apiFilters: any = { includeDetailedAnalytics: true, includeAggregates: true, limit: currentPageSize };
    if (this.startDate) {
      const d = this.startDate;
      apiFilters.startDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00.000Z`;
    }
    if (this.endDate) {
      const d = this.endDate;
      apiFilters.endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59:59.999Z`;
    }

    this.orderService.getOrders(apiFilters).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        const report = response.paymentReport;
        if (report) report.entityIds = response.entityIds || [];
        this.report = report;
        this.dashboardState.setCachedPaymentReport(this.startDate, this.endDate, report);
        if (response.detailedAnalytics) {
          const analyticsData = { ...response.detailedAnalytics, paymentReport: report, entityIds: response.entityIds || [] };
          this.dashboardState.setCachedAnalytics(this.startDate, this.endDate, analyticsData);
        }
        if (response.orders?.length) {
          const defaultFilters = { dateRange: { startDate: this.startDate, endDate: this.endDate }, status: null, brokerId: null, dispatcherId: null } as any;
          const defaultPagination = { page: 0, pageSize: currentPageSize, pageTokens: response.lastEvaluatedKey ? [response.lastEvaluatedKey] : [] };
          this.dashboardState.setCachedTrips(defaultFilters, defaultPagination, {
            orders: response.orders, total: response.lastEvaluatedKey ? response.orders.length + 1 : response.orders.length, chartAggregates: response.aggregates, lastEvaluatedKey: response.lastEvaluatedKey
          });
        }
        this.enrichGroupedData();
        this.loading = false;
        this.dashboardState.completeLoad();

        const entityIds = response.entityIds || [];
        if (entityIds.length > 0) {
          this.assetCache.resolveEntities(entityIds).pipe(takeUntil(this.destroy$)).subscribe(() => {
            this.enrichGroupedData();
          });
        }
      },
      error: () => {
        this.snackBar.open('Failed to load payment report', 'Close', { duration: 3000 });
        this.loading = false;
        this.dashboardState.completeLoad();
      }
    });
  }

  private enrichGroupedData(): void {
    if (!this.report) return;

    const groupedByDispatcher = this.report.groupedByDispatcher || {};
    this.enrichedDispatcherData = Object.entries(groupedByDispatcher).map(([id, g]: [string, any]) => ({
      dispatcherName: this.assetCache.getResolvedName(id),
      totalPayment: g.totalPayment,
      tripCount: g.tripCount
    })).sort((a, b) => b.totalPayment - a.totalPayment);

    const groupedByBroker = this.report.groupedByBroker || {};
    this.enrichedBrokerData = Object.entries(groupedByBroker).map(([id, g]: [string, any]) => ({
      brokerName: this.assetCache.getBrokerName(id),
      totalPayment: g.totalPayment,
      tripCount: g.tripCount
    })).sort((a, b) => b.totalPayment - a.totalPayment);

    const groupedByCarrier = this.report.groupedByCarrier || {};
    this.enrichedCarrierData = Object.entries(groupedByCarrier).map(([id, g]: [string, any]) => ({
      carrierName: this.assetCache.getResolvedName(id),
      totalPayment: g.totalPayment,
      tripCount: g.tripCount
    })).sort((a, b) => b.totalPayment - a.totalPayment);
  }

  onTabChange(index: number): void { this.activeTabIndex = index; }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  onExportData(): void {
    if (!this.report) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const primaryBlue: [number, number, number] = [25, 118, 210];
    const profitGreen: [number, number, number] = [46, 125, 50];

    let yPos = 20;

    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setFontSize(26); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('eTrucky', 14, 22);
    doc.setFontSize(16); doc.text('Admin Payment Report', pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 22, { align: 'right' });

    yPos = 50;
    const cardWidth = (pageWidth - 28 - 10) / 3;
    const cards = [
      { label: 'Total Orders', value: `${this.report.orderCount || 0}`, color: primaryBlue },
      { label: 'Total Revenue', value: this.formatCurrency(this.report.totalOrderRate || 0), color: profitGreen },
      { label: 'Admin Earnings', value: this.formatCurrency(this.report.totalAdminPayment || 0), color: profitGreen }
    ];
    cards.forEach((card, i) => {
      const x = 14 + (cardWidth + 5) * i;
      doc.setFillColor(250, 250, 250); doc.roundedRect(x, yPos, cardWidth, 25, 3, 3, 'F');
      doc.setFillColor(card.color[0], card.color[1], card.color[2]); doc.rect(x, yPos, cardWidth, 3, 'F');
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(card.label, x + cardWidth / 2, yPos + 12, { align: 'center' });
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(card.color[0], card.color[1], card.color[2]);
      doc.text(card.value, x + cardWidth / 2, yPos + 20, { align: 'center' });
    });
    yPos += 40;

    const sections = [
      { title: 'By Dispatcher', data: this.enrichedDispatcherData, cols: ['Dispatcher', 'Total Payment', 'Orders'], key: 'dispatcherName' },
      { title: 'By Broker', data: this.enrichedBrokerData, cols: ['Broker', 'Total Payment', 'Orders'], key: 'brokerName' },
      { title: 'By Carrier', data: this.enrichedCarrierData, cols: ['Carrier', 'Total Payment', 'Orders'], key: 'carrierName' }
    ];
    for (const s of sections) {
      if (s.data.length === 0) continue;
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text(s.title, 14, yPos); yPos += 5;
      autoTable(doc, {
        startY: yPos, head: [s.cols],
        body: s.data.map((d: any) => [d[s.key], this.formatCurrency(d.totalPayment), d.tripCount.toString()]),
        theme: 'grid', headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 }, bodyStyles: { fontSize: 8 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    doc.save(`admin-payments-${new Date().toISOString().split('T')[0]}.pdf`);
    this.snackBar.open('Payment report exported to PDF successfully', 'Close', { duration: 3000 });
  }

  onExportCSV(): void {
    if (!this.report) return;
    const sheets: any[] = [];
    if (this.enrichedDispatcherData.length > 0) {
      sheets.push({
        name: 'By Dispatcher', headers: ['Dispatcher Name', 'Total Payment', 'Order Count'],
        rows: this.enrichedDispatcherData.map(d => [d.dispatcherName, d.totalPayment?.toFixed(2), d.tripCount])
      });
    }
    if (this.enrichedBrokerData.length > 0) {
      sheets.push({
        name: 'By Broker', headers: ['Broker Name', 'Total Payment', 'Order Count'],
        rows: this.enrichedBrokerData.map(b => [b.brokerName, b.totalPayment?.toFixed(2), b.tripCount])
      });
    }
    if (this.enrichedCarrierData.length > 0) {
      sheets.push({
        name: 'By Carrier', headers: ['Carrier Name', 'Total Payment', 'Order Count'],
        rows: this.enrichedCarrierData.map(c => [c.carrierName, c.totalPayment?.toFixed(2), c.tripCount])
      });
    }
    if (sheets.length > 0) {
      this.excelExportService.exportToExcel('admin-payments', sheets, this.startDate, this.endDate);
    }
  }
}
