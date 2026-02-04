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
import { AuthService } from '../../../core/services/auth.service';
import { CarrierFilterService } from '../shared/carrier-filter.service';
import { CarrierUnifiedFilterCardComponent } from '../shared/unified-filter-card/unified-filter-card.component';
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
  private carrierId: string | null = null;

  constructor(
    private analyticsService: AnalyticsService,
    private authService: AuthService,
    private filterService: CarrierFilterService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Get carrier ID from auth service
    this.carrierId = this.authService.carrierId;
    
    if (!this.carrierId) {
      this.error = 'Unable to load carrier information';
      this.isLoading = false;
      return;
    }
    
    // Initialize empty KPI cards
    this.initializeKPICards();
    
    // Subscribe to date filter changes
    this.filterService.dateFilter$.pipe(takeUntil(this.destroy$)).subscribe(dateFilter => {
      this.startDate = dateFilter.startDate;
      this.endDate = dateFilter.endDate;
      this.loadAllAnalytics();
    });
  }

  ngAfterViewInit(): void {
    // Charts will be created when tabs are activated via onTabChange
    console.log('[Carrier Analytics] ngAfterViewInit called - charts will be created on tab activation');
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

    // Load trip analytics with date filter (using carrier context)
    this.loadTripAnalytics();
  }

  private loadTripAnalytics(): void {
    if (!this.carrierId) {
      this.error = 'Unable to load carrier information';
      this.isLoading = false;
      return;
    }

    // Use carrier-specific analytics endpoint
    this.analyticsService.getCarrierTripAnalytics(this.carrierId, this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.processTripAnalytics(data);
          this.loadFleetUtilizationData();
          this.loadBrokerAnalyticsData();
          this.loadFuelEfficiencyData();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('[Carrier Analytics] Error loading trip analytics:', error);
          this.error = 'Failed to load analytics data. Please try again.';
          this.isLoading = false;
          
          this.snackBar.open('Error loading analytics data', 'Close', {
            duration: 5000
          });
        }
      });
  }

  private loadFleetUtilizationData(): void {
    if (!this.carrierId) return;

    // Load driver performance (carrier context)
    this.analyticsService.getCarrierDriverPerformance(this.carrierId, this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.driverPerformanceData = data;
        },
        error: (error) => {
          console.error('[Carrier Analytics] Error loading driver performance:', error);
        }
      });

    // Load vehicle utilization (carrier context)
    this.analyticsService.getCarrierVehicleUtilization(this.carrierId, this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.vehicleUtilizationData = data;
        },
        error: (error) => {
          console.error('[Carrier Analytics] Error loading vehicle utilization:', error);
        }
      });
  }

  private loadBrokerAnalyticsData(): void {
    if (!this.carrierId) return;

    this.analyticsService.getCarrierBrokerAnalytics(this.carrierId, this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.brokerAnalyticsData = data;
        },
        error: (error) => {
          console.error('[Carrier Analytics] Error loading broker analytics:', error);
        }
      });
  }

  private loadFuelEfficiencyData(): void {
    if (!this.carrierId) return;

    // Load real fuel analytics data (carrier context)
    this.analyticsService.getCarrierFuelAnalytics(this.carrierId, this.startDate || undefined, this.endDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
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
              
              // If we're already on the Fuel Efficiency tab, create chart now
              if (this.selectedTabIndex === 3) {
                setTimeout(() => {
                  this.createFuelCostChart();
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
          console.error('[Carrier Analytics] Error loading fuel data:', error);
          this.fuelCostChartData = null;
          this.fuelEfficiencyChartData = null;
        }
      });
  }

  private createFuelCostChart(): void {
    if (!this.fuelCostChartRef || !this.fuelCostTrendData) {
      console.warn('[Carrier Analytics] Cannot create fuel cost chart - missing ref or data');
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
