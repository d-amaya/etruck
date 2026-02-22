import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ExcelExportService } from '../../../../core/services/excel-export.service';
import { OrderService } from '../../../../core/services/order.service';
import { Subject } from 'rxjs';
import { takeUntil, distinctUntilChanged, debounceTime } from 'rxjs/operators';
import { AdminDashboardStateService } from '../admin-state.service';
import { AdminFilterService } from '../admin-filter.service';
import { AdminAssetCacheService } from '../admin-asset-cache.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface KPICard {
  title: string;
  value: string;
  change: number;
  changeLabel: string;
  icon: string;
  color: 'primary' | 'accent' | 'warn' | 'success';
}

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatMenuModule,
    MatProgressSpinnerModule, MatTabsModule, MatSnackBarModule
  ],
  templateUrl: './admin-analytics.component.html',
  styleUrls: ['./admin-analytics.component.scss']
})
export class AdminAnalyticsComponent implements OnInit, OnDestroy {
  @Input() isWrapped = false;

  isLoading = false;
  error: string | null = null;
  selectedTabIndex = 0;
  private isLoadingAnalytics = false;

  startDate: Date | null = null;
  endDate: Date | null = null;

  kpiCards: KPICard[] = [];
  dispatcherPerformanceData: any[] = [];
  brokerPerformanceData: any[] = [];
  carrierPerformanceData: any[] = [];

  Math = Math;
  private destroy$ = new Subject<void>();

  constructor(
    private dashboardState: AdminDashboardStateService,
    private adminFilterService: AdminFilterService,
    private assetCache: AdminAssetCacheService,
    private orderService: OrderService,
    private excelExportService: ExcelExportService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initializeKPICards();

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
      this.loadAnalytics();
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private initializeKPICards(): void {
    this.kpiCards = [
      { title: 'Orders', value: '0', change: 0, changeLabel: 'total orders', icon: 'local_shipping', color: 'accent' },
      { title: 'Total Revenue', value: '$0.00', change: 0, changeLabel: 'total deal value', icon: 'attach_money', color: 'success' },
      { title: 'Admin Earnings', value: '$0.00', change: 0, changeLabel: 'admin payment', icon: 'payments', color: 'primary' },
      { title: 'Profit', value: '$0.00', change: 0, changeLabel: 'after expenses', icon: 'trending_up', color: 'success' }
    ];
  }

  private loadAnalytics(): void {
    if (this.isLoadingAnalytics) return;
    this.isLoadingAnalytics = true;
    this.error = null;

    const cached = this.dashboardState.getCachedAnalytics(this.startDate, this.endDate);
    if (cached) {
      this.processAnalyticsData(cached);
      this.isLoading = false;
      this.isLoadingAnalytics = false;
      this.dashboardState.completeLoad();
      const entityIds = cached.entityIds || [];
      if (entityIds.length > 0) {
        this.assetCache.resolveEntities(entityIds).pipe(takeUntil(this.destroy$)).subscribe(() => {
          this.remapEntityNames(cached);
        });
      }
      return;
    }

    this.isLoading = true;
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
        const analyticsData = { ...response.detailedAnalytics, paymentReport: response.paymentReport, entityIds: response.entityIds || [] };
        this.dashboardState.setCachedAnalytics(this.startDate, this.endDate, analyticsData);
        if (response.paymentReport) {
          const pr = response.paymentReport;
          pr.entityIds = response.entityIds || [];
          this.dashboardState.setCachedPaymentReport(this.startDate, this.endDate, pr);
        }
        if (response.orders?.length) {
          const defaultFilters = { dateRange: { startDate: this.startDate, endDate: this.endDate }, status: null, brokerId: null, dispatcherId: null } as any;
          const defaultPagination = { page: 0, pageSize: currentPageSize, pageTokens: response.lastEvaluatedKey ? [response.lastEvaluatedKey] : [] };
          this.dashboardState.setCachedTrips(defaultFilters, defaultPagination, {
            orders: response.orders, total: response.lastEvaluatedKey ? response.orders.length + 1 : response.orders.length, chartAggregates: response.aggregates, lastEvaluatedKey: response.lastEvaluatedKey
          });
        }
        this.processAnalyticsData(analyticsData);
        this.isLoading = false;
        this.isLoadingAnalytics = false;
        this.dashboardState.completeLoad();

        const entityIds = response.entityIds || [];
        if (entityIds.length > 0) {
          this.assetCache.resolveEntities(entityIds).pipe(takeUntil(this.destroy$)).subscribe(() => {
            this.remapEntityNames(analyticsData);
          });
        }
      },
      error: () => {
        this.error = 'Failed to load analytics data. Please try again.';
        this.isLoading = false;
        this.isLoadingAnalytics = false;
        this.dashboardState.completeLoad();
        this.snackBar.open('Error loading analytics data', 'Close', { duration: 5000 });
      }
    });
  }

  private processAnalyticsData(data: any): void {
    const ta = data.tripAnalytics || {};
    const pr = data.paymentReport || {};

    this.kpiCards = [
      { title: 'Orders', value: `${ta.totalTrips || 0}`, change: ta.completedTrips ? Math.round((ta.completedTrips / ta.totalTrips) * 100) : 0, changeLabel: 'completion rate', icon: 'local_shipping', color: 'accent' },
      { title: 'Total Revenue', value: this.formatCurrency(pr.totalOrderRate || 0), change: 0, changeLabel: 'total deal value', icon: 'attach_money', color: 'success' },
      { title: 'Admin Earnings', value: this.formatCurrency(ta.totalRevenue || 0), change: 0, changeLabel: 'admin payment', icon: 'payments', color: 'primary' },
      { title: 'Profit', value: this.formatCurrency(ta.totalProfit || 0), change: 0, changeLabel: 'after expenses', icon: 'trending_up', color: 'success' }
    ];

    this.dispatcherPerformanceData = (data.dispatcherPerformance || []).map((d: any) => ({
      ...d, dispatcherName: this.assetCache.getResolvedName(d.dispatcherId)
    }));
    this.brokerPerformanceData = (data.brokerAnalytics || []).map((b: any) => ({
      ...b, brokerName: this.assetCache.getBrokerName(b.brokerId)
    }));
    this.carrierPerformanceData = (data.carrierPerformance || []).map((c: any) => ({
      ...c, carrierName: this.assetCache.getResolvedName(c.carrierId)
    }));
  }

  private remapEntityNames(data: any): void {
    this.dispatcherPerformanceData = (data.dispatcherPerformance || []).map((d: any) => ({
      ...d, dispatcherName: this.assetCache.getResolvedName(d.dispatcherId)
    }));
    this.brokerPerformanceData = (data.brokerAnalytics || []).map((b: any) => ({
      ...b, brokerName: this.assetCache.getBrokerName(b.brokerId)
    }));
    this.carrierPerformanceData = (data.carrierPerformance || []).map((c: any) => ({
      ...c, carrierName: this.assetCache.getResolvedName(c.carrierId)
    }));
  }

  onRefresh(): void { this.isLoadingAnalytics = false; this.loadAnalytics(); }

  onTabChange(index: number): void { this.selectedTabIndex = index; }

  onExportData(): void {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const primaryBlue: [number, number, number] = [25, 118, 210];
    const profitGreen: [number, number, number] = [46, 125, 50];

    let yPos = 20;

    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setFontSize(26); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('eTrucky', 14, 22);
    doc.setFontSize(16); doc.text('Admin Analytics Report', pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 22, { align: 'right' });

    yPos = 50;
    const cardWidth = (pageWidth - 28 - 15) / 4;
    this.kpiCards.forEach((kpi, index) => {
      const x = 14 + (cardWidth + 5) * index;
      const color = kpi.color === 'success' ? profitGreen : primaryBlue;
      doc.setFillColor(250, 250, 250); doc.roundedRect(x, yPos, cardWidth, 25, 3, 3, 'F');
      doc.setFillColor(color[0], color[1], color[2]); doc.rect(x, yPos, cardWidth, 3, 'F');
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(kpi.title, x + cardWidth / 2, yPos + 12, { align: 'center' });
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(color[0], color[1], color[2]);
      doc.text(kpi.value, x + cardWidth / 2, yPos + 20, { align: 'center' });
    });
    yPos += 40;

    if (this.dispatcherPerformanceData?.length > 0) {
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Dispatcher Performance', 14, yPos); yPos += 5;
      autoTable(doc, {
        startY: yPos,
        head: [['Dispatcher', 'Orders', 'Completed', 'Revenue', 'Completion Rate']],
        body: this.dispatcherPerformanceData.map(d => [
          d.dispatcherName, d.totalTrips.toString(), d.completedTrips.toString(),
          this.formatCurrency(d.totalRevenue), `${d.completionRate.toFixed(0)}%`
        ]),
        theme: 'grid', headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 }, bodyStyles: { fontSize: 8 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    if (this.brokerPerformanceData?.length > 0) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Broker Performance', 14, yPos); yPos += 5;
      autoTable(doc, {
        startY: yPos,
        head: [['Broker', 'Orders', 'Completed', 'Revenue', 'Completion Rate']],
        body: this.brokerPerformanceData.map(b => [
          b.brokerName, b.totalTrips.toString(), b.completedTrips.toString(),
          this.formatCurrency(b.totalRevenue), `${b.completionRate.toFixed(0)}%`
        ]),
        theme: 'grid', headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 }, bodyStyles: { fontSize: 8 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    if (this.carrierPerformanceData?.length > 0) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Carrier Performance', 14, yPos); yPos += 5;
      autoTable(doc, {
        startY: yPos,
        head: [['Carrier', 'Orders', 'Completed', 'Carrier Payment', 'Completion Rate']],
        body: this.carrierPerformanceData.map(c => [
          c.carrierName, c.totalTrips.toString(), c.completedTrips.toString(),
          this.formatCurrency(c.totalRevenue), `${c.completionRate.toFixed(0)}%`
        ]),
        theme: 'grid', headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 }, bodyStyles: { fontSize: 8 },
      });
    }

    doc.save(`admin-analytics-${new Date().toISOString().split('T')[0]}.pdf`);
    this.snackBar.open('Analytics exported to PDF successfully', 'Close', { duration: 3000 });
  }

  onExportCSV(): void {
    const sheets: any[] = [];
    if (this.dispatcherPerformanceData?.length > 0) {
      sheets.push({
        name: 'Dispatcher Performance',
        headers: ['Dispatcher', 'Total Orders', 'Completed', 'Revenue', 'Profit', 'Completion Rate'],
        rows: this.dispatcherPerformanceData.map(d => [
          d.dispatcherName, d.totalTrips, d.completedTrips,
          d.totalRevenue?.toFixed(2), d.totalProfit?.toFixed(2), `${(d.completionRate || 0).toFixed(0)}%`
        ])
      });
    }
    if (this.brokerPerformanceData?.length > 0) {
      sheets.push({
        name: 'Broker Performance',
        headers: ['Broker', 'Total Orders', 'Completed', 'Revenue', 'Completion Rate'],
        rows: this.brokerPerformanceData.map(b => [
          b.brokerName, b.totalTrips, b.completedTrips,
          b.totalRevenue?.toFixed(2), `${(b.completionRate || 0).toFixed(0)}%`
        ])
      });
    }
    if (this.carrierPerformanceData?.length > 0) {
      sheets.push({
        name: 'Carrier Performance',
        headers: ['Carrier', 'Total Orders', 'Completed', 'Carrier Payment', 'Profit', 'Completion Rate'],
        rows: this.carrierPerformanceData.map(c => [
          c.carrierName, c.totalTrips, c.completedTrips,
          c.totalRevenue?.toFixed(2), c.totalProfit?.toFixed(2), `${(c.completionRate || 0).toFixed(0)}%`
        ])
      });
    }
    if (sheets.length > 0) {
      this.excelExportService.exportToExcel('admin-analytics', sheets, this.startDate, this.endDate);
      this.snackBar.open('Analytics exported to Excel successfully', 'Close', { duration: 3000 });
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }
}
