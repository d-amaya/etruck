import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Chart, ChartConfiguration } from 'chart.js/auto';
import { DriverDashboardStateService } from '../driver-dashboard-state.service';
import { DriverAssetCacheService } from '../driver-asset-cache.service';

@Component({
  selector: 'app-driver-charts-widget',
  templateUrl: './driver-charts-widget.component.html',
  styleUrls: ['./driver-charts-widget.component.scss']
})
export class DriverChartsWidgetComponent implements OnInit, OnDestroy {
  @ViewChild('statusChart') statusChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('dispatcherChart') dispatcherChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('monthlyChart') monthlyChartRef!: ElementRef<HTMLCanvasElement>;

  totalTrips = 0;
  totalPayment = 0;
  statusData: Record<string, number> = {};
  statusPaymentData: { status: string; payment: number }[] = [];
  monthlyPaymentData: { month: string; payment: number }[] = [];

  private statusChart: Chart | null = null;
  private statusPaymentChart: Chart | null = null;
  private monthlyPaymentChart: Chart | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private dashboardState: DriverDashboardStateService,
    private assetCache: DriverAssetCacheService
  ) {}

  ngOnInit(): void {
    this.dashboardState.dashboardData$.pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response: any) => {
        if (!response || !response.chartAggregates) return;
        this.processChartAggregates(response.chartAggregates);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.statusChart) this.statusChart.destroy();
    if (this.statusPaymentChart) this.statusPaymentChart.destroy();
    if (this.monthlyPaymentChart) this.monthlyPaymentChart.destroy();
  }

  private processChartAggregates(agg: any): void {
    this.statusData = agg.statusSummary || {};
    this.totalTrips = Object.values(this.statusData).reduce((sum: number, count) => sum + (count as number), 0);
    this.totalPayment = agg.paymentSummary?.totalDriverPayments || 0;

    // Use actual payment by status from backend
    const paymentByStatus = agg.paymentSummary?.paymentByStatus || {};
    const statuses = ['Scheduled', 'Picked Up', 'In Transit', 'Delivered', 'Paid'];
    this.statusPaymentData = statuses
      .filter(status => (this.statusData[status] || 0) > 0)
      .map(status => ({
        status,
        payment: paymentByStatus[status] || 0
      }));

    // Process monthly payment data
    const paymentByMonth = agg.paymentSummary?.paymentByMonth || {};
    this.monthlyPaymentData = Object.entries(paymentByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, payment]) => ({
        month: this.formatMonthLabel(month),
        payment: payment as number
      }));

    setTimeout(() => {
      this.createStatusChart();
      this.createStatusPaymentChart();
      this.createMonthlyPaymentChart();
    });
  }

  private formatMonthLabel(monthKey: string): string {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  private createStatusChart(): void {
    if (this.statusChart) this.statusChart.destroy();
    if (!this.statusChartRef) return;

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: ['Scheduled', 'Picked Up', 'In Transit', 'Delivered', 'Paid'],
        datasets: [{
          data: [
            this.statusData['Scheduled'] || 0,
            this.statusData['Picked Up'] || 0,
            this.statusData['In Transit'] || 0,
            this.statusData['Delivered'] || 0,
            this.statusData['Paid'] || 0
          ],
          backgroundColor: ['#1976d2', '#ff9800', '#9c27b0', '#4caf50', '#00acc1'],
          borderColor: '#fff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'bottom',
            labels: { font: { size: 11 } }
          },
          title: {
            display: true,
            text: `Total Trips: ${this.totalTrips}`,
            font: { size: 16, weight: 'bold' }
          }
        }
      }
    };

    this.statusChart = new Chart(this.statusChartRef.nativeElement, config);
  }

  private createStatusPaymentChart(): void {
    if (this.statusPaymentChart) this.statusPaymentChart.destroy();
    if (!this.dispatcherChartRef) return;

    const statusColors: Record<string, string> = {
      'Scheduled': '#2196f3',
      'PickingUp': '#ff9800',
      'Transit': '#9c27b0',
      'Delivered': '#4caf50',
      'WaitingRC': '#009688',
      'ReadyToPay': '#00bcd4',
      'Canceled': '#757575'
    };

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: this.statusPaymentData.map(d => d.status),
        datasets: [{
          label: 'Driver Payment',
          data: this.statusPaymentData.map(d => d.payment),
          backgroundColor: this.statusPaymentData.map(d => statusColors[d.status]),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => '$' + value.toLocaleString()
            }
          }
        }
      }
    };

    this.statusPaymentChart = new Chart(this.dispatcherChartRef.nativeElement, config);
  }

  private createMonthlyPaymentChart(): void {
    if (this.monthlyPaymentChart) this.monthlyPaymentChart.destroy();
    if (!this.monthlyChartRef) return;

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: this.monthlyPaymentData.map(d => d.month),
        datasets: [{
          label: 'Monthly Payment',
          data: this.monthlyPaymentData.map(d => d.payment),
          borderColor: '#1976d2',
          backgroundColor: 'rgba(25, 118, 210, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#1976d2'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => '$' + value.toLocaleString()
            }
          }
        }
      }
    };

    this.monthlyPaymentChart = new Chart(this.monthlyChartRef.nativeElement, config);
  }
}
