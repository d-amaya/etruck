import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { AdminDashboardStateService } from '../admin-state.service';
import { AdminAssetCacheService } from '../admin-asset-cache.service';
import { OrderStatus } from '@haulhub/shared';

Chart.register(...registerables);

interface TopPerformer { name: string; value: number; profit?: number; count: number; }

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
  @ViewChild('topDispatchersChart') topDispatchersChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('topBrokersChart') topBrokersChartRef!: ElementRef<HTMLCanvasElement>;

  private destroy$ = new Subject<void>();
  private charts: Chart<any>[] = [];

  loading = true;
  Math = Math;

  revenueData = { revenue: 0, adminProfit: 0, dispatcherPayment: 0, carrierPayment: 0 };
  statusData: { [key: string]: number } = {};
  topDispatchers: TopPerformer[] = [];
  topBrokers: TopPerformer[] = [];

  constructor(
    private dashboardState: AdminDashboardStateService,
    private assetCache: AdminAssetCacheService
  ) {}

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
    const totalRevenue = payment.orderRate || 0;
    const adminPayments = payment.adminPayment || 0;
    this.revenueData = { revenue: totalRevenue, adminProfit: adminPayments, dispatcherPayment: payment.dispatcherPayment || 0, carrierPayment: payment.carrierPayment || 0 };

    const topPerformers = agg.topPerformers || {};

    this.topDispatchers = (topPerformers.topDispatchers || []).map((d: any) => ({
      name: this.assetCache.getResolvedName(d.id) || d.id.substring(0, 8),
      value: d.revenue || 0,
      profit: d.profit || 0,
      count: d.count
    }));

    this.topBrokers = (topPerformers.topBrokers || []).map((b: any) => ({
      name: this.assetCache.getBrokerName(b.id) || b.id.substring(0, 8),
      value: b.revenue,
      count: b.count
    }));

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
    this.renderTopDispatchersChart();
    this.renderTopBrokersChart();
  }

  private renderRevenueChart(): void {
    if (!this.revenueChartRef) return;
    const ctx = this.revenueChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    const totalLabel = `Total Revenue: $${this.revenueData.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const profit = this.revenueData.adminProfit;
    this.charts.push(new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Profit', 'Dispatcher Payout', 'Carrier Payout'],
        datasets: [{ data: [Math.max(0, profit), this.revenueData.dispatcherPayment, this.revenueData.carrierPayment], backgroundColor: ['#4caf50', '#ff9800', '#42a5f5'], borderWidth: 2, borderColor: '#fff' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: totalLabel, font: { size: 14, weight: 'bold' }, color: '#1976d2', padding: { bottom: 8 } },
          legend: { position: 'bottom', labels: { font: { size: 10 }, usePointStyle: true, pointStyle: 'circle', padding: 12 } },
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

  private renderTopDispatchersChart(): void {
    if (!this.topDispatchersChartRef || this.topDispatchers.length === 0) return;
    const ctx = this.topDispatchersChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    this.charts.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.topDispatchers.map(d => d.name),
        datasets: [
          { label: 'Revenue', data: this.topDispatchers.map(d => d.value), backgroundColor: 'rgba(25, 118, 210, 0.7)', borderColor: '#1565c0', borderWidth: 1, borderRadius: 4 },
          { label: 'Profit', data: this.topDispatchers.map(d => d.profit), backgroundColor: 'rgba(76, 175, 80, 0.7)', borderColor: '#2e7d32', borderWidth: 1, borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { usePointStyle: true, pointStyle: 'rect', padding: 16 } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: $${(c.parsed.y || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v: any) => '$' + Number(v).toLocaleString() } },
          x: { grid: { display: false } }
        }
      }
    }));
  }

  private renderTopBrokersChart(): void {
    if (!this.topBrokersChartRef || this.topBrokers.length === 0) return;
    const ctx = this.topBrokersChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    this.charts.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.topBrokers.map(b => b.name),
        datasets: [{ label: 'Revenue', data: this.topBrokers.map(b => b.value), backgroundColor: ['#2e7d32', '#388e3c', '#4caf50', '#66bb6a', '#81c784'], borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `$${(c.parsed.y || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` } }
        },
        scales: { y: { beginAtZero: true } }
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
      case OrderStatus.WaitingRC: return '#009688';
      case OrderStatus.ReadyToPay: return '#00bcd4';
      case OrderStatus.Canceled: return '#9e9e9e';
      default: return '#757575';
    }
  }

  private getStatusLabel(status: string): string {
    switch (status) {
      case OrderStatus.Scheduled: return 'Scheduled';
      case OrderStatus.PickingUp: return 'Picked Up';
      case OrderStatus.Transit: return 'In Transit';
      case OrderStatus.Delivered: return 'Delivered';
      case OrderStatus.WaitingRC: return 'Waiting RC';
      case OrderStatus.ReadyToPay: return 'Ready To Pay';
      case OrderStatus.Canceled: return 'Canceled';
      default: return status;
    }
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c.destroy());
    this.destroy$.next();
    this.destroy$.complete();
  }
}
