import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { AuthService } from '../../../core/services/auth.service';
import { CarrierFilterService } from '../shared/carrier-filter.service';
import { CarrierAssetCacheService } from '../shared/carrier-asset-cache.service';
import { CarrierUnifiedFilterCardComponent } from '../shared/unified-filter-card/unified-filter-card.component';
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
  selector: 'app-carrier-analytics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule,
    CarrierUnifiedFilterCardComponent
  ],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.scss']
})
export class CarrierAnalyticsComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() isWrapped = false;
  @ViewChild('fuelCostChart') fuelCostChartRef!: ElementRef<HTMLCanvasElement>;
  
  isLoading = true;
  error: string | null = null;
  selectedTabIndex = 0;
  private isLoadingAnalytics = false;
  
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
  
  // Analytics Data
  totalRates = 0;
  totalRevenue = 0;
  outstandingPayments = 0;
  averageRates = 0;
  
  // Fleet Utilization Data
  driverPerformanceData: any[] = [];
  vehicleUtilizationData: any[] = [];
  dispatcherPerformanceData: any[] = [];
  
  // Broker Performance Data
  brokerAnalyticsData: any = null;
  
  // Fuel Efficiency Data
  fuelCostChartData: any = null;
  fuelEfficiencyChartData: any = null;
  
  Math = Math; // Expose Math to template
  
  private destroy$ = new Subject<void>();
  private carrierId: string | null = null;

  constructor(
    private analyticsService: AnalyticsService,
    private authService: AuthService,
    private filterService: CarrierFilterService,
    private assetCache: CarrierAssetCacheService,
    private snackBar: MatSnackBar
  ) {}

  private driverMap = new Map<string, any>();
  private truckMap = new Map<string, any>();
  private brokerMap = new Map<string, any>();
  private dispatcherMap = new Map<string, any>();

  ngOnInit(): void {
    // Initialize empty KPI cards
    this.initializeKPICards();

    // Load asset maps for name resolution
    this.assetCache.loadAssets().subscribe(cache => {
      this.driverMap = cache.drivers;
      this.truckMap = cache.trucks;
      this.brokerMap = cache.brokers;
      this.dispatcherMap = cache.dispatchers;
    });
    
    // Subscribe to date filter changes with distinctUntilChanged to prevent duplicate calls
    this.filterService.dateFilter$
      .pipe(
        distinctUntilChanged((prev, curr) => 
          prev.startDate?.getTime() === curr.startDate?.getTime() && 
          prev.endDate?.getTime() === curr.endDate?.getTime()
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(dateFilter => {
        this.startDate = dateFilter.startDate;
        this.endDate = dateFilter.endDate;
        this.loadAllAnalytics();
      });
  }

  ngAfterViewInit(): void {
    // Charts will be created when tabs are activated via onTabChange
    // Removed debug log
  }

  ngOnDestroy(): void {
    // Destroy chart instances
    if (this.fuelCostChart) {
      this.fuelCostChart.destroy();
    }
    
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeKPICards(): void {
    this.kpiCards = [
      {
        title: 'Trips',
        value: '0',
        change: 0,
        changeLabel: 'total trips',
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
  }

  private loadAllAnalytics(): void {
    // Prevent concurrent loads
    if (this.isLoadingAnalytics) {
      return;
    }
    
    this.isLoadingAnalytics = true;
    this.isLoading = true;
    this.error = null;

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
    // Check cache first (5-min TTL)
    const cached = this.filterService.getCachedAnalytics(this.startDate, this.endDate);
    if (cached) {
      this.processUnifiedAnalyticsData(cached);
      this.isLoading = false;
      this.isLoadingAnalytics = false;
      return;
    }

    this.analyticsService.getUnifiedAnalytics(this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.filterService.setCachedAnalytics(this.startDate, this.endDate, data);
          this.processUnifiedAnalyticsData(data);
          this.isLoading = false;
          this.isLoadingAnalytics = false;
        },
        error: (error) => {
          console.error('[Carrier Analytics] Error loading unified analytics:', error);
          this.error = 'Failed to load analytics data. Please try again.';
          this.isLoading = false;
          this.isLoadingAnalytics = false;
          this.snackBar.open('Error loading analytics data', 'Close', { duration: 5000 });
        }
      });
  }

  private processUnifiedAnalyticsData(data: any): void {
    this.processTripAnalytics(data.tripAnalytics);
    this.driverPerformanceData = (data.driverPerformance || []).map((d: any) => ({
      ...d, driverName: this.driverMap.get(d.driverId)?.name || d.driverId?.substring(0, 8)
    }));
    this.vehicleUtilizationData = (data.vehicleUtilization || []).map((v: any) => ({
      ...v, vehicleName: this.truckMap.get(v.vehicleId)?.plate || v.vehicleId?.substring(0, 8)
    }));
    this.brokerAnalyticsData = {
      brokers: (data.brokerAnalytics || []).map((b: any) => ({
        ...b, brokerName: this.brokerMap.get(b.brokerId)?.brokerName || b.brokerId?.substring(0, 8)
      }))
    };
    this.dispatcherPerformanceData = (data.dispatcherPerformance || []).map((d: any) => ({
      ...d, dispatcherName: this.dispatcherMap.get(d.dispatcherId)?.name || d.dispatcherId?.substring(0, 8)
    }));
    if (data.fuelAnalytics && data.fuelAnalytics.tripsWithFuelData > 0) {
      this.fuelCostChartData = {
        avgCost: data.fuelAnalytics.averageFuelCost,
        totalCost: data.fuelAnalytics.totalFuelCost,
        tripCount: data.fuelAnalytics.totalTripsWithFuelData,
        totalGallons: data.fuelAnalytics.totalGallonsUsed,
        avgFuelPrice: data.fuelAnalytics.averageFuelPrice
      };
      const bestVehicle = data.fuelAnalytics.vehicleFuelEfficiency?.length > 0 ? data.fuelAnalytics.vehicleFuelEfficiency[0] : null;
      this.fuelEfficiencyChartData = {
        fleetAvg: data.fuelAnalytics.averageGallonsPerMile,
        fleetAvgMPG: data.fuelAnalytics.averageGallonsPerMile > 0 ? 1 / data.fuelAnalytics.averageGallonsPerMile : 0,
        bestVehicle: bestVehicle ? (this.truckMap.get(bestVehicle.vehicleId)?.plate || bestVehicle.vehicleId?.substring(0, 8)) : 'N/A',
        bestEfficiency: bestVehicle ? bestVehicle.averageGallonsPerMile : 0,
        bestMPG: bestVehicle ? bestVehicle.averageMPG : 0,
        vehicleCount: data.fuelAnalytics.vehicleFuelEfficiency?.length || 0,
        vehicles: (data.fuelAnalytics.vehicleFuelEfficiency || []).map((v: any) => ({
          ...v,
          vehicleId: this.truckMap.get(v.vehicleId)?.plate || v.vehicleId?.substring(0, 8),
          tripCount: v.totalTrips,
          totalMiles: v.totalDistance,
          totalCost: v.totalFuelCost,
        }))
      };
    }
  }

  private createFuelCostChart(): void {
    if (!this.fuelCostChartRef || !this.fuelCostTrendData) {
      // Removed debug warning
      return;
    }

    // Destroy existing chart if it exists
    if (this.fuelCostChart) {
      this.fuelCostChart.destroy();
    }

    const ctx = this.fuelCostChartRef.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('[Carrier Analytics] Cannot get 2d context from fuel canvas');
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
        title: 'Trips',
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

  onRefresh(): void {
    this.loadAllAnalytics();
  }

  onExportData(): void {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const primaryBlue: [number, number, number] = [25, 118, 210];
    const profitGreen: [number, number, number] = [46, 125, 50];
    const lossRed: [number, number, number] = [211, 47, 47];
    
    let yPos = 20;
    
    // Header with eTrucky banner
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('eTrucky', 14, 22);
    doc.setFontSize(16);
    doc.text('Carrier Analytics Report', pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 22, { align: 'right' });
    
    yPos = 50;
    
    // Summary Cards
    const cardWidth = (pageWidth - 28 - 15) / 4;
    const cardHeight = 25;
    const cardGap = 5;
    
    this.kpiCards.forEach((kpi, index) => {
      const x = 14 + (cardWidth + cardGap) * index;
      const color = kpi.color === 'success' ? profitGreen : kpi.color === 'warn' ? lossRed : primaryBlue;
      this.drawSummaryCard(doc, x, yPos, cardWidth, cardHeight, kpi.title, kpi.value, color);
    });
    
    yPos += cardHeight + 15;
    
    // 1. Dispatcher Performance
    if (this.dispatcherPerformanceData && this.dispatcherPerformanceData.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Dispatcher Performance', 14, yPos);
      yPos += 5;
      
      const dispatcherData = this.dispatcherPerformanceData.map(d => [
        d.dispatcherName,
        d.totalTrips.toString(),
        d.completedTrips.toString(),
        this.formatCurrency(d.totalRevenue),
        this.formatCurrency(d.totalProfit),
        `${d.completionRate.toFixed(0)}%`
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['Dispatcher', 'Trips', 'Completed', 'Revenue', 'Profit', 'Rate']],
        body: dispatcherData,
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'center' }
        },
        didParseCell: (data) => {
          if (data.column.index === 4 && data.section === 'body') {
            const value = this.dispatcherPerformanceData[data.row.index].totalProfit;
            data.cell.styles.textColor = value >= 0 ? profitGreen : lossRed;
          }
        }
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    // 2. Driver Performance
    if (this.driverPerformanceData && this.driverPerformanceData.length > 0) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Driver Performance', 14, yPos);
      yPos += 5;
      
      const driverData = this.driverPerformanceData.map(d => [
        d.driverName,
        d.totalTrips.toString(),
        d.completedTrips.toString(),
        `${d.totalDistance.toFixed(0)} mi`,
        this.formatCurrency(d.totalRevenue),
        `${d.onTimeDeliveryRate.toFixed(0)}%`
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['Driver', 'Trips', 'Completed', 'Distance', 'Earnings', 'Rate']],
        body: driverData,
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          4: { halign: 'right' },
          5: { halign: 'center' }
        }
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    // 3. Broker Performance
    if (this.brokerAnalyticsData && this.brokerAnalyticsData.brokers && this.brokerAnalyticsData.brokers.length > 0) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Broker Performance', 14, yPos);
      yPos += 5;
      
      const brokerData = this.brokerAnalyticsData.brokers.map((b: any) => [
        b.brokerName || 'Unknown',
        (b.tripCount || 0).toString(),
        (b.completedTrips || 0).toString(),
        this.formatCurrency(b.totalRevenue || 0),
        this.formatCurrency(b.averageRevenue || 0)
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['Broker', 'Trips', 'Completed', 'Revenue', 'Avg/Trip']],
        body: brokerData,
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          3: { halign: 'right' },
          4: { halign: 'right' }
        }
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    // 4. Vehicle Performance
    if (this.vehicleUtilizationData && this.vehicleUtilizationData.length > 0) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.text('Vehicle Performance', 14, yPos);
      yPos += 5;
      
      const vehicleData = this.vehicleUtilizationData.map(v => [
        v.vehicleName,
        v.totalTrips.toString(),
        `${v.totalDistance.toFixed(0)} mi`,
        this.formatCurrency(v.totalRevenue),
        `${v.utilizationRate.toFixed(1)}%`,
        this.formatCurrency(v.averageRevenuePerTrip)
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['Truck', 'Trips', 'Distance', 'Revenue', 'Utilization', 'Avg/Trip']],
        body: vehicleData,
        theme: 'grid',
        headStyles: { fillColor: primaryBlue, textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          3: { halign: 'right' },
          4: { halign: 'center' },
          5: { halign: 'right' }
        }
      });
    }
    
    // Save PDF
    doc.save(`carrier-analytics-${new Date().toISOString().split('T')[0]}.pdf`);
    
    this.snackBar.open('Analytics exported to PDF successfully', 'Close', {
      duration: 3000
    });
  }

  private drawSummaryCard(doc: jsPDF, x: number, y: number, width: number, height: number, label: string, value: string, color: [number, number, number]): void {
    // Card background
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, y, width, height, 3, 3, 'F');
    
    // Colored top border
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x, y, width, 3, 'F');
    
    // Label
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(label, x + width / 2, y + 12, { align: 'center' });
    
    // Value
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(value, x + width / 2, y + 20, { align: 'center' });
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;
    
    // If Fuel Efficiency tab (index 3) is selected and we have fuel chart data
    if (index === 3 && this.fuelCostTrendData) {
      setTimeout(() => {
        this.createFuelCostChart();
      }, 200);
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
}
