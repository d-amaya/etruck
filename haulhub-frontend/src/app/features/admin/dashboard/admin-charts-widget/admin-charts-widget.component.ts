import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { AdminDashboardStateService } from '../admin-state.service';
import { Order, OrderStatus, calcAdminProfit } from '@haulhub/shared';

Chart.register(...registerables);

@Component({
  selector: 'app-admin-charts-widget',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  templateUrl: './admin-charts-widget.component.html',
  styleUrls: ['./admin-charts-widget.component.scss']
})
export class AdminChartsWidgetComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('revenueChart') revenueChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('statusChart') statusChartRef!: ElementRef<HTMLCanvasElement>;

  private destroy$ = new Subject<void>();
  private charts: Chart[] = [];

  loading = true;
  Math = Math;

  revenueData = { revenue: 0, adminProfit: 0, fees: 0 };
  statusData: { [key: string]: number } = {};

  constructor(private dashboardState: AdminDashboardStateService) {}

  ngOnInit(): void {
    this.dashboardState.dashboardData$.pipe(takeUntil(this.destroy$)).subscribe(response => {
      if (!response?.chartAggregates) return;
      this.processChartAggregates(response.chartAggregates);
    });
  }

  ngAfterViewInit(): void {
    if (this.hasData()) setTimeout(() => this.renderCharts(), 100);
  }

  hasData(): boolean { return Object.keys(this.statusData).length > 0 || this.revenueData.revenue > 0; }
  getTotalOrders(): number { return Object.values(this.statusData).reduce((s, c) => s + (c as number), 0); }

  private processChartAggregates(agg: any): void {
    this.statusData = agg.statusSummary || {};
    const payment = agg.paymentSummary || {};
    const totalRevenue = payment.totalBrokerPayments || 0;
    const adminPayments = payment.totalAdminPayments || 0;
    const fees = payment.totalAdditionalFees || 0;
    this.revenueData = { revenue: totalRevenue, adminProfit: adminPayments - fees, fees };
    this.loading = false;
    setTimeout(() => this.tryRenderCharts(), 200);
  }

  private tryRenderCharts(): void {
    if (this.hasData() && this.revenueChartRef && this.statusChartRef) this.renderCharts();
    else if (this.hasData()) setTimeout(() => this.tryRenderCharts(), 100);
  }

  private renderCharts(): void {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    this.renderRevenueChart();
    this.renderStatusChart();
  }

  private renderRevenueChart(): void {
    if (!this.revenueChartRef) return;
    const ctx = this.revenueChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    this.charts.push(new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Admin Profit', 'Fees'],
        datasets: [{ data: [Math.max(0, this.revenueData.adminProfit), this.revenueData.fees], backgroundColor: ['#4caf50', '#f44336'], borderWidth: 2, borderColor: '#fff' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => `${c.label}: $${(c.parsed || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` } }
        }
      }
    }));
  }

  private renderStatusChart(): void {
    if (!this.statusChartRef) return;
    const ctx = this.statusChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    const labels = Object.keys(this.statusData);
    const data = Object.values(this.statusData);
    const colors = labels.map(s => this.getStatusColor(s));
    this.charts.push(new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels.map(s => this.getStatusLabel(s)),
        datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }
      }
    }));
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case OrderStatus.Scheduled: return '#2196f3';
      case OrderStatus.PickingUp: return '#ff9800';
      case OrderStatus.Transit: return '#9c27b0';
      case OrderStatus.Delivered: return '#4caf50';
      case OrderStatus.ReadyToPay: return '#009688';
      case OrderStatus.Canceled: return '#757575';
      default: return '#bdbdbd';
    }
  }

  private getStatusLabel(status: string): string {
    switch (status) {
      case OrderStatus.Scheduled: return 'Scheduled';
      case OrderStatus.PickingUp: return 'Picked Up';
      case OrderStatus.Transit: return 'In Transit';
      case OrderStatus.Delivered: return 'Delivered';
      case OrderStatus.ReadyToPay: return 'Paid';
      case OrderStatus.Canceled: return 'Canceled';
      default: return status;
    }
  }

  ngOnDestroy(): void { this.charts.forEach(c => c.destroy()); this.destroy$.next(); this.destroy$.complete(); }
}
