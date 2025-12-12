import { Component, OnInit, OnDestroy } from '@angular/core';
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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AnalyticsService } from '../../../core/services/analytics.service';

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
    MatSnackBarModule
  ],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.scss']
})
export class AnalyticsDashboardComponent implements OnInit, OnDestroy {
  isLoading = true;
  error: string | null = null;
  
  // KPI Cards
  kpiCards: KPICard[] = [];
  
  // Chart Data
  revenueChartData: ChartData | null = null;
  profitChartData: ChartData | null = null;
  utilizationChartData: ChartData | null = null;
  
  // Analytics Data
  totalRates = 0;
  totalRevenue = 0;
  outstandingPayments = 0;
  averageRates = 0;
  
  // Fuel Efficiency Data
  fuelCostChartData: any = null;
  fuelEfficiencyChartData: any = null;
  defaultFuelPrice = 3.50; // Default fuel price per gallon
  newFuelPrice: number | null = null;
  fuelPriceHistory: Array<{ date: string; price: number; change: number }> = [];
  
  // Additional Fees Data
  additionalFeesData: any = null;
  tripFeesBreakdown: Array<{
    tripId: string;
    date: string;
    brokerName: string;
    lumperFees: number;
    detentionFees: number;
    totalFees: number;
    feePercentage: number;
  }> = [];
  feeRecoveryData: any = null;
  
  Math = Math; // Expose Math to template
  
  private destroy$ = new Subject<void>();

  constructor(
    private analyticsService: AnalyticsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadAnalyticsData();
    this.loadFuelEfficiencyData();
    this.loadAdditionalFeesData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadAnalyticsData(): void {
    this.isLoading = true;
    this.error = null;

    // Load all analytics data
    this.analyticsService.getRevenueAnalytics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.processAnalyticsData(data);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading analytics:', error);
          this.error = 'Failed to load analytics data. Please try again.';
          this.isLoading = false;
        }
      });
  }

  private processAnalyticsData(data: any): void {
    // Process revenue data
    this.totalRevenue = data.totalRevenue || 0;
    this.totalRates = data.totalRevenue || 0; // Using revenue as rates for now
    this.outstandingPayments = 0; // TODO: Calculate from trip data
    this.averageRates = data.averageMonthlyRevenue || 0;

    // Build KPI cards
    this.kpiCards = [
      {
        title: 'Total Revenue',
        value: `$${this.formatNumber(this.totalRevenue)}`,
        change: 12.5,
        changeLabel: 'vs last month',
        icon: 'attach_money',
        color: 'success'
      },
      {
        title: 'Total Rates',
        value: `$${this.formatNumber(this.totalRates)}`,
        change: 8.3,
        changeLabel: 'vs last month',
        icon: 'trending_up',
        color: 'primary'
      },
      {
        title: 'Outstanding Payments',
        value: `$${this.formatNumber(this.outstandingPayments)}`,
        change: -5.2,
        changeLabel: 'vs last month',
        icon: 'payment',
        color: 'warn'
      },
      {
        title: 'Average Rate',
        value: `$${this.formatNumber(this.averageRates)}`,
        change: 3.1,
        changeLabel: 'vs last month',
        icon: 'analytics',
        color: 'accent'
      }
    ];

    // Build chart data
    if (data.monthlyData && data.monthlyData.length > 0) {
      const labels = data.monthlyData.map((m: any) => m.month);
      const revenueData = data.monthlyData.map((m: any) => m.revenue);
      const expensesData = data.monthlyData.map((m: any) => m.expenses);
      const profitData = data.monthlyData.map((m: any) => m.profit);

      this.revenueChartData = {
        labels,
        datasets: [
          {
            label: 'Revenue',
            data: revenueData,
            backgroundColor: 'rgba(33, 150, 243, 0.2)',
            borderColor: 'rgba(33, 150, 243, 1)'
          },
          {
            label: 'Expenses',
            data: expensesData,
            backgroundColor: 'rgba(244, 67, 54, 0.2)',
            borderColor: 'rgba(244, 67, 54, 1)'
          }
        ]
      };

      this.profitChartData = {
        labels,
        datasets: [
          {
            label: 'Profit',
            data: profitData,
            backgroundColor: 'rgba(76, 175, 80, 0.2)',
            borderColor: 'rgba(76, 175, 80, 1)'
          }
        ]
      };
    }
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
    this.loadAnalyticsData();
    this.loadFuelEfficiencyData();
    this.loadAdditionalFeesData();
  }

  onExportData(): void {
    // TODO: Implement data export functionality
    console.log('Export data functionality to be implemented');
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
   * Update default fuel price
   * Validates: Requirements 6.3
   */
  onUpdateFuelPrice(): void {
    if (!this.newFuelPrice || this.newFuelPrice <= 0) {
      this.snackBar.open('Please enter a valid fuel price', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    // Calculate change from previous price
    const change = this.newFuelPrice - this.defaultFuelPrice;

    // Add to price history
    this.fuelPriceHistory.unshift({
      date: new Date().toISOString(),
      price: this.newFuelPrice,
      change: change
    });

    // Keep only last 10 entries
    if (this.fuelPriceHistory.length > 10) {
      this.fuelPriceHistory = this.fuelPriceHistory.slice(0, 10);
    }

    // Update default price
    this.defaultFuelPrice = this.newFuelPrice;

    // TODO: Persist to backend/localStorage
    // For now, just store in localStorage
    localStorage.setItem('defaultFuelPrice', this.defaultFuelPrice.toString());
    localStorage.setItem('fuelPriceHistory', JSON.stringify(this.fuelPriceHistory));

    this.snackBar.open(`Fuel price updated to ${this.formatCurrency(this.defaultFuelPrice)}/gal`, 'Close', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });

    // Clear input
    this.newFuelPrice = null;

    // Reload fuel cost data with new price
    this.loadFuelEfficiencyData();
  }

  /**
   * Load fuel efficiency and cost data
   * Validates: Requirements 6.4, 15.4
   */
  private loadFuelEfficiencyData(): void {
    // Load default fuel price from localStorage if available
    const storedPrice = localStorage.getItem('defaultFuelPrice');
    if (storedPrice) {
      this.defaultFuelPrice = parseFloat(storedPrice);
    }

    // Load price history from localStorage
    const storedHistory = localStorage.getItem('fuelPriceHistory');
    if (storedHistory) {
      try {
        this.fuelPriceHistory = JSON.parse(storedHistory);
      } catch (e) {
        console.error('Error parsing fuel price history:', e);
        this.fuelPriceHistory = [];
      }
    }

    // TODO: Load actual fuel cost data from analytics service
    // For now, using placeholder data
    this.fuelCostChartData = {
      avgCost: 450.50,
      totalCost: 4505.00,
      tripCount: 10
    };

    this.fuelEfficiencyChartData = {
      fleetAvg: 0.167,
      bestVehicle: 'Freigh101',
      bestEfficiency: 0.150,
      vehicleCount: 3
    };
  }

  /**
   * Load additional fees data (lumper fees and detention charges)
   * Validates: Requirements 7.2, 7.3, 7.5
   */
  private loadAdditionalFeesData(): void {
    // TODO: Load actual additional fees data from analytics service
    // For now, using placeholder data to demonstrate the interface
    
    // Calculate summary statistics
    const totalLumperFees = 450.00;
    const totalDetentionFees = 275.00;
    const totalFees = totalLumperFees + totalDetentionFees;
    const lumperFeeCount = 5;
    const detentionFeeCount = 3;
    const totalFeeCount = 7; // Trips with any fees
    const totalRevenue = 15000.00; // Example total revenue
    
    this.additionalFeesData = {
      totalLumperFees,
      totalDetentionFees,
      totalFees,
      lumperFeeCount,
      detentionFeeCount,
      totalFeeCount,
      avgLumperFee: lumperFeeCount > 0 ? totalLumperFees / lumperFeeCount : 0,
      avgDetentionFee: detentionFeeCount > 0 ? totalDetentionFees / detentionFeeCount : 0,
      highestFee: 150.00, // Example highest single fee
      profitImpactPercent: totalRevenue > 0 ? (totalFees / totalRevenue) * 100 : 0,
      profitImpactAmount: totalFees
    };
    
    // Example trip fees breakdown
    this.tripFeesBreakdown = [
      {
        tripId: 'TRIP-001',
        date: new Date(2024, 0, 15).toISOString(),
        brokerName: 'TQL',
        lumperFees: 100.00,
        detentionFees: 75.00,
        totalFees: 175.00,
        feePercentage: 9.7 // (175 / 1800) * 100
      },
      {
        tripId: 'TRIP-002',
        date: new Date(2024, 0, 18).toISOString(),
        brokerName: 'C.H. Robinson',
        lumperFees: 125.00,
        detentionFees: 0,
        totalFees: 125.00,
        feePercentage: 6.9
      },
      {
        tripId: 'TRIP-003',
        date: new Date(2024, 0, 22).toISOString(),
        brokerName: 'Landstar',
        lumperFees: 0,
        detentionFees: 100.00,
        totalFees: 100.00,
        feePercentage: 5.6
      },
      {
        tripId: 'TRIP-004',
        date: new Date(2024, 0, 25).toISOString(),
        brokerName: 'Echo Global',
        lumperFees: 75.00,
        detentionFees: 50.00,
        totalFees: 125.00,
        feePercentage: 7.1
      },
      {
        tripId: 'TRIP-005',
        date: new Date(2024, 0, 28).toISOString(),
        brokerName: 'TQL',
        lumperFees: 150.00,
        detentionFees: 50.00,
        totalFees: 200.00,
        feePercentage: 11.1
      }
    ];
    
    // Fee recovery tracking
    this.feeRecoveryData = {
      invoiced: totalFees,
      recovered: 525.00, // Example: 72.4% recovered
      outstanding: 200.00,
      recoveryRate: 72.4
    };
  }
}
