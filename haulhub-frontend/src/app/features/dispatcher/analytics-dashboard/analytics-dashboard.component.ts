import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
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
  @ViewChild('fuelCostChart') fuelCostChartRef!: ElementRef<HTMLCanvasElement>;
  
  isLoading = true;
  error: string | null = null;
  selectedTabIndex = 0;
  
  // Date Range Filter
  startDate: Date | null = null;
  endDate: Date | null = null;
  maxDate: Date = new Date();
  
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
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Subscribe to shared filter changes
    this.sharedFilterService.filters$
      .pipe(takeUntil(this.destroy$))
      .subscribe(filters => {
        this.startDate = filters.dateRange.startDate;
        this.endDate = filters.dateRange.endDate;
        this.loadAllAnalytics();
      });
    
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
    this.isLoading = true;
    this.error = null;
    
    // Notify dashboard state service that we're loading
    this.dashboardStateService.setLoadingState(true, false, true, 'Loading analytics...');
    this.dashboardStateService.clearError();

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

    console.log('[Analytics] Loading all analytics data...');
    console.log('[Analytics] Date range:', this.startDate, 'to', this.endDate);

    // Load trip analytics with date filter
    this.loadTripAnalytics();
  }

  private loadTripAnalytics(): void {
    this.analyticsService.getTripAnalytics(this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          console.log('[Analytics] Trip analytics data received:', data);
          this.processTripAnalytics(data);
          this.loadFleetUtilizationData();
          this.loadBrokerAnalyticsData();
          this.loadFuelEfficiencyData();
          this.isLoading = false;
          
          // Notify dashboard state service that loading is complete
          this.dashboardStateService.completeLoad();
        },
        error: (error) => {
          console.error('[Analytics] Error loading trip analytics:', error);
          this.error = 'Failed to load analytics data. Please try again.';
          this.isLoading = false;
          
          // Notify dashboard state service of error
          this.dashboardStateService.setError('Failed to load analytics data. Please try again.', true);
          this.dashboardStateService.completeLoad();
          
          this.snackBar.open('Error loading analytics data', 'Close', {
            duration: 5000
          });
        }
      });
  }

  private loadFleetUtilizationData(): void {
    // Load driver performance
    this.analyticsService.getDriverPerformance(this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.driverPerformanceData = data;
        },
        error: (error) => {
          console.error('Error loading driver performance:', error);
        }
      });

    // Load vehicle utilization
    this.analyticsService.getVehicleUtilization(this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.vehicleUtilizationData = data;
        },
        error: (error) => {
          console.error('Error loading vehicle utilization:', error);
        }
      });
  }

  private loadBrokerAnalyticsData(): void {
    this.analyticsService.getBrokerAnalytics(this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          console.log('[Analytics] Broker analytics data received:', data);
          this.brokerAnalyticsData = data;
        },
        error: (error) => {
          console.error('[Analytics] Error loading broker analytics:', error);
        }
      });
  }



  private createFuelCostChart(): void {
    console.log('[Analytics] createFuelCostChart called');
    console.log('[Analytics] fuelCostChartRef:', !!this.fuelCostChartRef);
    console.log('[Analytics] fuelCostTrendData:', !!this.fuelCostTrendData);

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

    console.log('[Analytics] Creating fuel cost chart with', this.fuelCostTrendData.labels.length, 'data points');

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
    console.log('[Analytics] Fuel cost chart created successfully');
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
    this.loadAllAnalytics();
  }

  onExportData(): void {
    // TODO: Implement data export functionality
    this.snackBar.open('Export functionality coming soon', 'Close', {
      duration: 3000
    });
  }

  onTabChange(index: number): void {
    console.log('[Analytics] Tab changed to index:', index);
    this.selectedTabIndex = index;
    
    // If Fuel Efficiency tab (index 3) is selected and we have fuel chart data
    if (index === 3 && this.fuelCostTrendData) {
      console.log('[Analytics] Fuel Efficiency tab activated, creating fuel chart...');
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
  private loadFuelEfficiencyData(): void {
    // Load real fuel analytics data
    this.analyticsService.getFuelAnalytics(this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          console.log('[Analytics] Fuel analytics data received:', data);
          console.log('[Analytics] Monthly fuel data:', data.monthlyFuelData);
          
          if (data.totalTripsWithFuelData > 0) {
            this.fuelCostChartData = {
              avgCost: data.averageFuelCost,
              totalCost: data.totalFuelCost,
              tripCount: data.totalTripsWithFuelData,
              totalGallons: data.totalGallonsUsed,
              avgFuelPrice: data.averageFuelPrice
            };

            const bestVehicle = data.vehicleFuelEfficiency.length > 0 ? data.vehicleFuelEfficiency[0] : null;
            
            this.fuelEfficiencyChartData = {
              fleetAvg: data.averageGallonsPerMile,
              fleetAvgMPG: data.averageGallonsPerMile > 0 ? 1 / data.averageGallonsPerMile : 0,
              bestVehicle: bestVehicle ? bestVehicle.vehicleId : 'N/A',
              bestEfficiency: bestVehicle ? bestVehicle.averageGallonsPerMile : 0,
              bestMPG: bestVehicle ? bestVehicle.averageMPG : 0,
              vehicleCount: data.vehicleFuelEfficiency.length,
              vehicles: data.vehicleFuelEfficiency
            };
            
            // Build fuel cost trend chart data
            if (data.monthlyFuelData && data.monthlyFuelData.length > 0) {
              const labels = data.monthlyFuelData.map((m: any) => m.month);
              const fuelCostData = data.monthlyFuelData.map((m: any) => m.fuelCost);
              
              this.fuelCostTrendData = {
                labels,
                datasets: [
                  {
                    label: 'Fuel Cost',
                    data: fuelCostData,
                    backgroundColor: 'rgba(255, 152, 0, 0.2)',
                    borderColor: 'rgba(255, 152, 0, 1)'
                  }
                ]
              };
              
              console.log('[Analytics] Fuel chart data prepared');
              
              // If we're already on the Fuel Efficiency tab, create chart now
              if (this.selectedTabIndex === 3) {
                setTimeout(() => {
                  console.log('[Analytics] Creating fuel chart (already on Fuel Efficiency tab)...');
                  this.createFuelCostChart();
                  this.fuelChartCreated = true;
                }, 300);
              }
            }
          } else {
            // No fuel data available
            this.fuelCostChartData = null;
            this.fuelEfficiencyChartData = null;
            this.fuelCostTrendData = null;
          }
        },
        error: (error) => {
          console.error('[Analytics] Error loading fuel data:', error);
          this.fuelCostChartData = null;
          this.fuelEfficiencyChartData = null;
        }
      });
  }

}
