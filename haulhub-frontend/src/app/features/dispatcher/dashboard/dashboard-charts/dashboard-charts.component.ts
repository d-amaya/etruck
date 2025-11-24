import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgChartsModule } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { Subject, forkJoin, Observable } from 'rxjs';
import { switchMap, takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { TripService, PaymentSummary, PaymentsTimeline } from '../../../../core/services/trip.service';
import { DashboardStateService, DashboardFilters } from '../dashboard-state.service';
import { TripStatus, TripFilters } from '@haulhub/shared';

interface ChartDataResponse {
  statusSummary: Record<TripStatus, number>;
  paymentsTimeline: PaymentsTimeline;
}

@Component({
  selector: 'app-dashboard-charts',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, NgChartsModule],
  templateUrl: './dashboard-charts.component.html',
  styleUrls: ['./dashboard-charts.component.scss']
})
export class DashboardChartsComponent implements OnInit, OnDestroy {
  selectedChartType: 'status' | 'payments' | 'profit' = 'status';
  
  tripsByStatusData: ChartData<'bar'> = {
    labels: [],
    datasets: []
  };

  paymentsOverTimeData: ChartData<'line'> = {
    labels: [],
    datasets: []
  };

  profitAnalysisData: ChartData<'bar'> = {
    labels: [],
    datasets: []
  };

  hasError = false;

  barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0
        }
      }
    }
  };

  lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => '$' + value.toLocaleString()
        }
      }
    }
  };

  // Compact versions for the new layout
  compactBarChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          font: { size: 10 }
        }
      },
      x: {
        ticks: {
          font: { size: 10 }
        }
      }
    }
  };

  compactLineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          font: { size: 10 },
          boxWidth: 12
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => '$' + value.toLocaleString(),
          font: { size: 10 }
        }
      },
      x: {
        ticks: {
          font: { size: 10 }
        }
      }
    }
  };

  private destroy$ = new Subject<void>();

  constructor(
    private tripService: TripService,
    private dashboardState: DashboardStateService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.dashboardState.filters$
      .pipe(
        switchMap(filters => this.loadChartData(filters)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: data => {
          this.hasError = false;
          this.updateCharts(data);
        },
        error: error => {
          this.handleError(error);
        }
      });
  }

  private loadChartData(filters: DashboardFilters): Observable<ChartDataResponse> {
    return forkJoin({
      statusSummary: this.tripService.getTripSummaryByStatus(this.buildApiFilters(filters)),
      paymentsTimeline: this.tripService.getPaymentsTimeline(this.buildApiFilters(filters))
    }).pipe(
      catchError(error => {
        console.error('Failed to load chart data:', error);
        this.handleError(error);
        // Return empty data to gracefully degrade
        return of({
          statusSummary: {
            [TripStatus.Scheduled]: 0,
            [TripStatus.PickedUp]: 0,
            [TripStatus.InTransit]: 0,
            [TripStatus.Delivered]: 0,
            [TripStatus.Paid]: 0
          } as Record<TripStatus, number>,
          paymentsTimeline: {
            labels: [],
            brokerPayments: [],
            driverPayments: [],
            lorryOwnerPayments: [],
            profit: []
          } as PaymentsTimeline
        } as ChartDataResponse);
      })
    );
  }

  private updateCharts(data: ChartDataResponse): void {
    // Update trips by status bar chart
    const statusLabels = Object.keys(data.statusSummary).map(status =>
      status.replace(/([A-Z])/g, ' $1').trim()
    );
    const statusCounts = Object.values(data.statusSummary);

    this.tripsByStatusData = {
      labels: statusLabels,
      datasets: [{
        label: 'Trips',
        data: statusCounts,
        backgroundColor: [
          '#90CAF9', // Scheduled - light blue
          '#FFE082', // Picked Up - light amber
          '#CE93D8', // In Transit - light purple
          '#A5D6A7', // Delivered - light green
          '#80CBC4'  // Paid - light teal
        ],
        borderColor: [
          '#42A5F5',
          '#FFA726',
          '#AB47BC',
          '#66BB6A',
          '#26A69A'
        ],
        borderWidth: 1
      }]
    };

    // Update payments over time line chart
    this.paymentsOverTimeData = {
      labels: data.paymentsTimeline.labels,
      datasets: [
        {
          label: 'Broker Payments',
          data: data.paymentsTimeline.brokerPayments,
          borderColor: '#42A5F5',
          backgroundColor: 'rgba(66, 165, 245, 0.1)',
          tension: 0.4
        },
        {
          label: 'Driver Payments',
          data: data.paymentsTimeline.driverPayments,
          borderColor: '#FFA726',
          backgroundColor: 'rgba(255, 167, 38, 0.1)',
          tension: 0.4
        },
        {
          label: 'Lorry Owner Payments',
          data: data.paymentsTimeline.lorryOwnerPayments,
          borderColor: '#AB47BC',
          backgroundColor: 'rgba(171, 71, 188, 0.1)',
          tension: 0.4
        },
        {
          label: 'Profit',
          data: data.paymentsTimeline.profit,
          borderColor: '#66BB6A',
          backgroundColor: 'rgba(102, 187, 106, 0.1)',
          tension: 0.4
        }
      ]
    };

    // Update profit analysis bar chart
    this.profitAnalysisData = {
      labels: data.paymentsTimeline.labels,
      datasets: [{
        label: 'Monthly Profit',
        data: data.paymentsTimeline.profit,
        backgroundColor: data.paymentsTimeline.profit.map(profit => 
          profit >= 0 ? '#A5D6A7' : '#FFAB91'
        ),
        borderColor: data.paymentsTimeline.profit.map(profit => 
          profit >= 0 ? '#66BB6A' : '#FF7043'
        ),
        borderWidth: 1
      }]
    };
  }

  private buildApiFilters(filters: DashboardFilters): TripFilters {
    const apiFilters: TripFilters = {};
    if (filters.dateRange.startDate) {
      apiFilters.startDate = filters.dateRange.startDate.toISOString();
    }
    if (filters.dateRange.endDate) {
      apiFilters.endDate = filters.dateRange.endDate.toISOString();
    }
    if (filters.status) apiFilters.status = filters.status;
    if (filters.brokerId) apiFilters.brokerId = filters.brokerId;
    if (filters.lorryId) apiFilters.lorryId = filters.lorryId;
    if (filters.driverName) apiFilters.driverName = filters.driverName;
    return apiFilters;
  }

  private handleError(error: any): void {
    this.hasError = true;
    let errorMessage = 'Failed to load chart data';
    
    if (error?.status === 0) {
      errorMessage = 'Network connection error. Please check your internet connection.';
    } else if (error?.status >= 500) {
      errorMessage = 'Server error. Please try again later.';
    } else if (error?.status === 401) {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error?.error?.message) {
      errorMessage = error.error.message;
    }

    this.snackBar.open(errorMessage, 'Dismiss', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }

  retryLoad(): void {
    this.hasError = false;
    // Trigger reload by emitting current filters
    const currentFilters = this.dashboardState.getCurrentFilters();
    this.loadChartData(currentFilters).subscribe({
      next: data => {
        this.updateCharts(data);
      },
      error: error => {
        this.handleError(error);
      }
    });
  }

  onChartTypeChange(): void {
    // Chart data is already loaded, just switching view
    // Could add analytics tracking here if needed
  }

  getChartTitle(): string {
    switch (this.selectedChartType) {
      case 'status':
        return 'Trips by Status';
      case 'payments':
        return 'Payments Timeline';
      case 'profit':
        return 'Profit Analysis';
      default:
        return 'Dashboard Chart';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
