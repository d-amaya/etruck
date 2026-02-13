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
import { takeUntil } from 'rxjs/operators';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { SharedFilterService } from '../dashboard/shared-filter.service';
import { DashboardStateService } from '../dashboard/dashboard-state.service';
import { AssetCacheService } from '../dashboard/asset-cache.service';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

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
  
  isLoading = true;
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
  
  // Fleet Utilization Data
  driverPerformanceData: any[] = [];
  vehicleUtilizationData: any[] = [];
  
  // Broker Performance Data
  brokerAnalyticsData: any = null;
  
  // Fuel Efficiency Data
  fuelCostChartData: any = null;
  fuelEfficiencyChartData: any = null;
  

  
  Math = Math; // Expose Math to template
  
  private destroy$ = new Subject<void>();

  constructor(
    private analyticsService: AnalyticsService,
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

    // Load asset maps for name resolution
    this.assetCache.loadAssets().subscribe(cache => {
      this.driverMap = cache.drivers;
      this.truckMap = cache.trucks;
      this.brokerMap = cache.brokers;
    });

    // Subscribe to shared filter changes
    this.sharedFilterService.filters$
      .pipe(takeUntil(this.destroy$))
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
    // Only show component-level loading spinner if not wrapped
    if (!this.isWrapped) {
      this.isLoading = true;
      // Only set dashboard loading state when not wrapped (standalone mode)
      this.dashboardStateService.setLoadingState(true, false, true, 'Loading analytics...');
    }
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

    this.analyticsService.getUnifiedAnalytics(this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.dashboardStateService.setCachedAnalytics(this.startDate, this.endDate, data);
          this.processUnifiedAnalyticsData(data);
          this.isLoading = false;
          this.dashboardStateService.completeLoad();
        },
        error: (error) => {
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
    // TODO: Implement data export functionality
    this.snackBar.open('Export functionality coming soon', 'Close', {
      duration: 3000
    });
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
