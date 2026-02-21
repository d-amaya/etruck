import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { SharedFilterService } from '../dashboard/shared-filter.service';
import { DashboardStateService } from '../dashboard/dashboard-state.service';
import { AssetCacheService } from '../dashboard/asset-cache.service';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

Chart.register(...registerables);

interface KPICard {
  title: string;
  value: string;
  change: number;
  changeLabel: string;
  icon: string;
  color: 'primary' | 'accent' | 'warn' | 'success';
}

interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor?: string;
  }[];
}

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule
  ],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.scss']
})
export class AnalyticsDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() isWrapped = false; // Set by wrapper component
  @ViewChild('fuelCostChart') fuelCostChartRef!: ElementRef<HTMLCanvasElement>;
  
  isLoading = false;
  error: string | null = null;
  selectedTabIndex = 0;
  
  // Date Range Filter
  startDate: Date | null = null;
  endDate: Date | null = null;
  maxDate: Date | null = null; // No maximum date - allow future dates
  
  // KPI Cards
  kpiCards: KPICard[] = [];
  
  // Fuel chart data
  fuelCostTrendData: ChartData | null = null;
  
  // Chart instances
  private fuelCostChart: Chart | null = null;
  private fuelChartCreated = false;
  
  // Analytics Data
  totalRates = 0;
  totalRevenue = 0;
  outstandingPayments = 0;
  averageRates = 0;
  
  // Performance Data
  adminPerformanceData: any[] = [];
  brokerAnalyticsData: any = null;
  carrierPerformanceData: any[] = [];
  

  
  Math = Math; // Expose Math to template
  
  private destroy$ = new Subject<void>();

  constructor(
    private analyticsService: AnalyticsService,
    private excelExportService: ExcelExportService,
    private sharedFilterService: SharedFilterService,
    private dashboardStateService: DashboardStateService,
    private assetCache: AssetCacheService,
    private snackBar: MatSnackBar
  ) {}

  private driverMap = new Map<string, any>();
  private truckMap = new Map<string, any>();
  private brokerMap = new Map<string, any>();

  ngOnInit(): void {
    // Initialize empty KPI cards to show structure while loading
    this.kpiCards = [
      {
        title: 'Orders',
        value: '0',
        change: 0,
        changeLabel: 'total orders',
        icon: 'local_shipping',
        color: 'accent'
      },
      {
        title: 'Revenue',
        value: '$0.00',
        change: 0,
        changeLabel: 'vs last period',
        icon: 'attach_money',
        color: 'success'
      },
      {
        title: 'Expenses',
        value: '$0.00',
        change: 0,
        changeLabel: 'vs last period',
        icon: 'payments',
        color: 'warn'
      },
      {
        title: 'Profit',
        value: '$0.00',
        change: 0,
        changeLabel: 'vs last period',
        icon: 'trending_up',
        color: 'primary'
      }
    ];

    // Load asset maps for name resolution
    this.assetCache.loadAssets().subscribe(cache => {
      this.driverMap = cache.drivers;
      this.truckMap = cache.trucks;
      this.brokerMap = cache.brokers;
    });

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
        this.startDate = filters.dateRange.startDate;
        this.endDate = filters.dateRange.endDate;
        this.loadAllAnalytics();
      });
  }

  ngAfterViewInit(): void {
    // Charts will be created when tabs are activated via onTabChange
    // This is necessary because Angular Material tabs don't render inactive tab content
    console.log('[Analytics] ngAfterViewInit called - charts will be created on tab activation');
  }

  ngOnDestroy(): void {
    // Destroy chart instances
    if (this.fuelCostChart) {
      this.fuelCostChart.destroy();
    }
    
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadAllAnalytics(): void {
    this.error = null;
    
    // Clear any errors when wrapped
    if (this.isWrapped) {
      this.dashboardStateService.clearError();
    }

    // Validate date range (max 365 days)
    if (this.startDate && this.endDate) {
      const diffTime = this.endDate.getTime() - this.startDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 365) {
        // Adjust start date to be exactly 365 days before end date
        const adjustedStart = new Date(this.endDate);
        adjustedStart.setDate(adjustedStart.getDate() - 365);
        adjustedStart.setHours(0, 0, 0, 0);
        this.startDate = adjustedStart;
        
        this.snackBar.open('Date range limited to 365 days maximum', 'Close', {
          duration: 3000
        });
      }
    }

    // Load all analytics in a single API call
    this.loadUnifiedAnalytics();
  }

  private loadUnifiedAnalytics(): void {
    // Check cache first — avoid redundant API calls when switching views
    const cached = this.dashboardStateService.getCachedAnalytics(this.startDate, this.endDate);
    if (cached) {
      this.processUnifiedAnalyticsData(cached);
      this.isLoading = false;
      this.dashboardStateService.completeLoad();
      return;
    }

    // Cache miss — show loading and fetch
    if (!this.isWrapped) {
      this.isLoading = true;
      this.dashboardStateService.setLoadingState(true, false, true, 'Loading analytics...');
    }

    const currentPageSize = this.dashboardStateService['paginationSubject']?.value?.pageSize || 10;
    this.analyticsService.getUnifiedAnalytics(this.startDate || undefined, this.endDate || undefined, currentPageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any) => {
          this.dashboardStateService.setCachedAnalytics(this.startDate, this.endDate, data);
          // Cache payment report for Payments view
          if (data.paymentReport) {
            this.dashboardStateService.setCachedPaymentReport(this.startDate, this.endDate, data.paymentReport);
          }
          // Cache orders for Table view (page 0, no table filters)
          if (data.orders?.length) {
            const defaultFilters = { dateRange: { startDate: this.startDate, endDate: this.endDate }, status: null, brokerId: null, truckId: null, driverId: null, carrierId: null };
            const defaultPagination = { page: 0, pageSize: currentPageSize, pageTokens: data.lastEvaluatedKey ? [data.lastEvaluatedKey] : [] };
            this.dashboardStateService.setCachedTrips(defaultFilters as any, defaultPagination, {
              orders: data.orders, total: data.lastEvaluatedKey ? data.orders.length + 1 : data.orders.length,
              chartAggregates: data.aggregates, lastEvaluatedKey: data.lastEvaluatedKey
            });
          }
          this.processUnifiedAnalyticsData(data);
          this.isLoading = false;
          this.dashboardStateService.completeLoad();
        },
        error: (error: any) => {
          console.error('[Analytics] Error loading unified analytics:', error);
          this.error = 'Failed to load analytics data. Please try again.';
          this.isLoading = false;
          this.dashboardStateService.setError('Failed to load analytics data. Please try again.', true);
          this.dashboardStateService.completeLoad();
          this.snackBar.open('Error loading analytics data', 'Close', { duration: 5000 });
        }
      });
  }

  private processUnifiedAnalyticsData(data: any): void {
    this.processTripAnalytics(data.tripAnalytics);

    // Use backend-computed dispatcher performance as admin performance data
    this.adminPerformanceData = (data.dispatcherPerformance || []).map((d: any) => ({
      name: d.dispatcherId?.substring(0, 8),
      totalTrips: d.totalTrips, completedTrips: d.completedTrips,
      totalRevenue: d.totalRevenue, totalProfit: d.totalProfit,
      averageProfit: d.averageProfit, completionRate: d.completionRate,
    }));

    this.brokerAnalyticsData = {
      brokers: (data.brokerAnalytics || []).map((b: any) => ({
        ...b,
        brokerName: this.brokerMap.get(b.brokerId)?.brokerName || b.brokerId?.substring(0, 8),
        totalProfit: b.totalRevenue,
      }))
    };

    this.carrierPerformanceData = (data.carrierPerformance || []).map((c: any) => ({
      name: c.carrierId?.substring(0, 8),
      totalTrips: c.totalTrips, completedTrips: c.completedTrips,
      totalRevenue: c.totalRevenue, totalProfit: c.totalProfit,
      averageProfit: c.averageProfit, completionRate: c.completionRate,
    }));

    // Resolve entity names via asset cache
    const entityIds = data.entityIds || [];
    if (entityIds.length > 0) {
      this.assetCache.resolveEntities(entityIds).subscribe(resolved => {
        const nameMap = new Map(resolved.map((r: any) => [r.id, r.name]));
        // Update admin performance names
        this.adminPerformanceData = (data.dispatcherPerformance || []).map((d: any) => ({
          name: nameMap.get(d.dispatcherId) || d.dispatcherId?.substring(0, 8),
          totalTrips: d.totalTrips, completedTrips: d.completedTrips,
          totalRevenue: d.totalRevenue, totalProfit: d.totalProfit,
          averageProfit: d.averageProfit, completionRate: d.completionRate,
        }));
        // Update carrier performance names
        this.carrierPerformanceData = (data.carrierPerformance || []).map((c: any) => ({
          name: nameMap.get(c.carrierId) || c.carrierId?.substring(0, 8),
          totalTrips: c.totalTrips, completedTrips: c.completedTrips,
          totalRevenue: c.totalRevenue, totalProfit: c.totalProfit,
          averageProfit: c.averageProfit, completionRate: c.completionRate,
        }));
        // Update broker names
        this.brokerAnalyticsData = {
          brokers: (data.brokerAnalytics || []).map((b: any) => ({
            ...b,
            brokerName: this.brokerMap.get(b.brokerId)?.brokerName || nameMap.get(b.brokerId) || b.brokerId?.substring(0, 8),
            totalProfit: b.totalRevenue,
          }))
        };
      });
    }
  }

  private createFuelCostChart(): void {

    if (!this.fuelCostChartRef || !this.fuelCostTrendData) {
      console.warn('[Analytics] Cannot create fuel cost chart - missing ref or data');
      return;
    }

    // Destroy existing chart if it exists
    if (this.fuelCostChart) {
      this.fuelCostChart.destroy();
    }

    const ctx = this.fuelCostChartRef.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('[Analytics] Cannot get 2d context from fuel canvas');
      return;
    }

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: this.fuelCostTrendData.labels,
        datasets: this.fuelCostTrendData.datasets.map(ds => ({
          label: ds.label,
          data: ds.data,
          backgroundColor: ds.backgroundColor,
          borderColor: ds.borderColor,
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || '';
                const value = context.parsed.y ?? 0;
                return `${label}: ${this.formatCurrency(value)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => this.formatCurrency(Number(value))
            }
          }
        }
      }
    };

    this.fuelCostChart = new Chart(ctx, config);
  }

  private processTripAnalytics(data: any): void {
    // Store the actual values
    this.totalRevenue = data.totalRevenue || 0;
    this.outstandingPayments = data.totalRevenue - (data.totalRevenue * 0.8); // Estimate 20% outstanding

    // Build KPI cards with real data
    this.kpiCards = [
      {
        title: 'Orders',
        value: `${data.totalTrips || 0}`,
        change: data.onTimeDeliveryRate || 0,
        changeLabel: 'completion rate',
        icon: 'local_shipping',
        color: 'accent'
      },
      {
        title: 'Revenue',
        value: this.formatCurrency(data.totalRevenue || 0),
        change: 12.5,
        changeLabel: 'vs last period',
        icon: 'attach_money',
        color: 'success'
      },
      {
        title: 'Expenses',
        value: this.formatCurrency(data.totalExpenses || 0),
        change: -5.2,
        changeLabel: 'vs last period',
        icon: 'payments',
        color: 'warn'
      },
      {
        title: 'Profit',
        value: this.formatCurrency(data.totalProfit || 0),
        change: 8.3,
        changeLabel: 'vs last period',
        icon: 'trending_up',
        color: 'primary'
      }
    ];
  }

  private formatNumber(value: number): string {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toFixed(0);
  }

  onRefresh(): void {
    this.dashboardStateService.invalidateViewCaches();
    this.loadAllAnalytics();
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
    doc.text('Dispatcher Analytics Report', pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 22, { align: 'right' });

    yPos = 50;

    // KPI Summary Cards
    const cardWidth = (pageWidth - 28 - 15) / 4;
    const cardHeight = 25;
    const cardGap = 5;
    this.kpiCards.forEach((kpi, i) => {
      const x = 14 + (cardWidth + cardGap) * i;
      const color = kpi.color === 'success' ? profitGreen : kpi.color === 'warn' ? lossRed : primaryBlue;
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(x, yPos, cardWidth, cardHeight, 3, 3, 'F');
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(x, yPos, cardWidth, 3, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(kpi.title, x + cardWidth / 2, yPos + 12, { align: 'center' });
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(kpi.value, x + cardWidth / 2, yPos + 20, { align: 'center' });
    });

    yPos += cardHeight + 15;

    // Admin Performance
    if (this.adminPerformanceData?.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Admin Performance', 14, yPos);
      yPos += 5;
      autoTable(doc, {
        startY: yPos,
        head: [['Admin', 'Orders', 'Completed', 'Revenue', 'Profit', 'Completion Rate']],
        body: this.adminPerformanceData.map((a: any) => [
          a.name, a.totalTrips.toString(), a.completedTrips.toString(),
          this.formatCurrency(a.totalRevenue), this.formatCurrency(a.totalProfit),
          `${a.completionRate.toFixed(0)}%`
        ]),
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Broker Performance
    if (this.brokerAnalyticsData?.brokers?.length > 0) {
      if (yPos > 240) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Broker Performance', 14, yPos);
      yPos += 5;
      autoTable(doc, {
        startY: yPos,
        head: [['Broker', 'Orders', 'Completed', 'Revenue', 'Profit', 'Completion Rate']],
        body: this.brokerAnalyticsData.brokers.map((b: any) => [
          b.brokerName, (b.totalTrips || 0).toString(), (b.completedTrips || 0).toString(),
          this.formatCurrency(b.totalRevenue || 0), this.formatCurrency(b.totalProfit || 0),
          `${(b.completionRate || 0).toFixed(0)}%`
        ]),
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Carrier Performance
    if (this.carrierPerformanceData?.length > 0) {
      if (yPos > 240) { doc.addPage(); yPos = 20; }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Carrier Performance', 14, yPos);
      yPos += 5;
      autoTable(doc, {
        startY: yPos,
        head: [['Carrier', 'Orders', 'Completed', 'Revenue', 'Profit', 'Completion Rate']],
        body: this.carrierPerformanceData.map((c: any) => [
          c.name, c.totalTrips.toString(), c.completedTrips.toString(),
          this.formatCurrency(c.totalRevenue), this.formatCurrency(c.totalProfit),
          `${c.completionRate.toFixed(0)}%`
        ]),
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
      });
    }

    doc.save(`dispatcher-analytics-${new Date().toISOString().split('T')[0]}.pdf`);
    this.snackBar.open('Analytics exported to PDF successfully', 'Close', { duration: 3000 });
  }

  onExportCSV(): void {
    const sheets: any[] = [];
    if (this.adminPerformanceData?.length > 0) {
      sheets.push({
        name: 'Admin Performance',
        headers: ['Admin', 'Total Orders', 'Completed', 'Revenue', 'Profit', 'Completion Rate'],
        rows: this.adminPerformanceData.map((a: any) => [
          a.name, a.totalTrips, a.completedTrips, a.totalRevenue?.toFixed(2), a.totalProfit?.toFixed(2), `${a.completionRate?.toFixed(0)}%`
        ])
      });
    }
    if (this.brokerAnalyticsData?.brokers?.length > 0) {
      sheets.push({
        name: 'Broker Performance',
        headers: ['Broker', 'Total Orders', 'Completed', 'Revenue', 'Profit', 'Completion Rate'],
        rows: this.brokerAnalyticsData.brokers.map((b: any) => [
          b.brokerName, b.totalTrips || 0, b.completedTrips || 0, b.totalRevenue?.toFixed(2), b.totalProfit?.toFixed(2), `${(b.completionRate || 0).toFixed(0)}%`
        ])
      });
    }
    if (this.carrierPerformanceData?.length > 0) {
      sheets.push({
        name: 'Carrier Performance',
        headers: ['Carrier', 'Total Orders', 'Completed', 'Revenue', 'Profit', 'Completion Rate'],
        rows: this.carrierPerformanceData.map((c: any) => [
          c.name, c.totalTrips, c.completedTrips, c.totalRevenue?.toFixed(2), c.totalProfit?.toFixed(2), `${c.completionRate?.toFixed(0)}%`
        ])
      });
    }
    if (sheets.length > 0) {
      this.excelExportService.exportToExcel('dispatcher-analytics', sheets, this.startDate, this.endDate);
      this.snackBar.open('Analytics exported to Excel successfully', 'Close', { duration: 3000 });
    }
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;
    
    // If Fuel Efficiency tab (index 3) is selected and we have fuel chart data
    if (index === 3 && this.fuelCostTrendData) {
      setTimeout(() => {
        this.createFuelCostChart();
        this.fuelChartCreated = true;
      }, 200);
    }
  }

  onDateRangeChange(): void {
    if (this.startDate && this.endDate) {
      console.log('[Analytics] Date range changed:', this.startDate, 'to', this.endDate);
      this.loadAllAnalytics();
    }
  }

  /**
   * Format currency values
   */
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  }

  /**
   * Format date values
   */
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }



  /**
   * Load fuel efficiency and cost data
   */
}
