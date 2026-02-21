import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, switchMap, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { Order, OrderStatus } from '@haulhub/shared';
import { CarrierFilterService } from '../../shared/carrier-filter.service';
import { CarrierAssetCacheService } from '../../shared/carrier-asset-cache.service';
import { TripService } from '../../../../core/services';
import { CarrierService } from '../../../../core/services/carrier.service';

Chart.register(...registerables);

interface TopPerformer {
  name: string;
  value: number;
  count: number;
}

@Component({
  selector: 'app-carrier-charts-widget',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  templateUrl: './carrier-charts-widget.component.html',
  styleUrls: ['./carrier-charts-widget.component.scss']
})
export class CarrierChartsWidgetComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() set dashboardData(data: any) {
    if (!data || !data.chartAggregates) return;
    
    const agg = data.chartAggregates;
    
    // Handle unified endpoint structure
    this.statusData = agg.statusSummary || {};
    this.totalTripsInRange = Object.values(this.statusData).reduce((sum: number, count) => sum + (count as number), 0);
    
    const payment = agg.paymentSummary || {};
    const revenue = payment.carrierPayment || 0;
    const expenses = (payment.driverPayment || 0) + (payment.fuelCost || 0);
    this.revenueData = {
      revenue,
      expenses,
      profit: revenue - expenses
    };
    
    const topPerformers = agg.topPerformers || {};
    
    // Resolve broker IDs to names
    this.topBrokers = (topPerformers.topBrokers || []).map((b: any) => {
      const broker = this.brokerMap.get(b.id);
      return {
        name: broker?.brokerName || b.id.substring(0, 8),
        value: b.revenue,
        count: b.count
      };
    });
    
    // Resolve driver IDs to names
    this.topDrivers = (topPerformers.topDrivers || []).map((d: any) => {
      const driver = this.driverMap.get(d.id);
      return {
        name: driver?.name || d.id.substring(0, 8),
        value: d.trips,
        count: d.trips
      };
    });
    
    // Resolve truck IDs to plates
    this.topTrucks = (topPerformers.topTrucks || []).map((t: any) => {
      const truck = this.truckMap.get(t.id);
      return {
        name: truck?.plate || t.id.substring(0, 8),
        value: t.trips,
        count: t.trips
      };
    });
    
    this.dataLoaded = true;
    this.loading = false;
    setTimeout(() => this.tryRenderCharts(), 200);
  }

  @ViewChild('revenueChart') revenueChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('statusChart') statusChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('topBrokersChart') topBrokersChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('topDispatchersChart') topDispatchersChartRef!: ElementRef<HTMLCanvasElement>;

  private destroy$ = new Subject<void>();
  private charts: Chart[] = [];

  loading = true;
  private dataLoaded = false;

  Math = Math;

  revenueData = { revenue: 0, expenses: 0, profit: 0 };
  statusData: { [key: string]: number } = {};
  topBrokers: TopPerformer[] = [];
  topDispatchers: TopPerformer[] = [];
  topDrivers: TopPerformer[] = [];
  topTrucks: TopPerformer[] = [];
  totalTripsInRange = 0;

  // Asset maps for name resolution
  private brokerMap = new Map<string, any>();
  private driverMap = new Map<string, any>();
  private truckMap = new Map<string, any>();

  constructor(
    private carrierFilterService: CarrierFilterService,
    private tripService: TripService,
    private carrierService: CarrierService,
    private assetCache: CarrierAssetCacheService
  ) {}

  ngOnInit(): void {
    // Load assets for name resolution
    this.assetCache.loadAssets().pipe(
      takeUntil(this.destroy$)
    ).subscribe(cache => {
      this.brokerMap = cache.brokers;
      this.driverMap = cache.drivers;
      this.truckMap = cache.trucks;
    });
  }

  ngAfterViewInit(): void {
    // Charts will render when data is loaded
  }

  private tryRenderCharts(): void {
    if (this.totalTripsInRange > 0 && 
        this.revenueChartRef && 
        this.statusChartRef && 
        this.topBrokersChartRef &&
        this.topDispatchersChartRef) {
      this.renderCharts();
    }
  }

  private renderCharts(): void {
    this.charts.forEach(chart => chart.destroy());
    this.charts = [];

    if (this.totalTripsInRange === 0) {
      return;
    }

    this.renderRevenueChart();
    this.renderStatusChart();
    this.renderTopDriversChart();
    this.renderTopTrucksChart();
  }

  private renderRevenueChart(): void {
    if (!this.revenueChartRef) return;

    const ctx = this.revenueChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: ['Revenue', 'Expenses'],
        datasets: [{
          data: [this.revenueData.revenue, this.revenueData.expenses],
          backgroundColor: ['#4caf50', '#f44336'],
          borderWidth: 2,
          borderColor: '#fff'
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
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                return `${label}: $${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              }
            }
          }
        }
      }
    };

    this.charts.push(new Chart(ctx, config));
  }

  private renderStatusChart(): void {
    if (!this.statusChartRef) return;

    const ctx = this.statusChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const labels = Object.keys(this.statusData);
    const data = Object.values(this.statusData);
    const colors = labels.map(status => this.getStatusColor(status));

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: labels.map(s => this.getStatusLabel(s)),
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 } }
          }
        }
      }
    };

    this.charts.push(new Chart(ctx, config));
  }

  private renderTopDriversChart(): void {
    if (!this.topBrokersChartRef || this.topDrivers.length === 0) return;
    const ctx = this.topBrokersChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: this.topDrivers.map(d => d.name),
        datasets: [{
          label: 'Trips',
          data: this.topDrivers.map(d => d.value),
          backgroundColor: ['#1565c0', '#1976d2', '#42a5f5', '#64b5f6', '#90caf9'],
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `${context.parsed.y} trips`
            }
          }
        },
        scales: {
          x: { ticks: { maxRotation: 45, minRotation: 45 } },
          y: { beginAtZero: true }
        }
      }
    };
    this.charts.push(new Chart(ctx, config));
  }

  private renderTopTrucksChart(): void {
    if (!this.topDispatchersChartRef || this.topTrucks.length === 0) return;
    const ctx = this.topDispatchersChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: this.topTrucks.map(t => t.name),
        datasets: [{
          label: 'Trips',
          data: this.topTrucks.map(t => t.value),
          backgroundColor: ['#2e7d32', '#388e3c', '#4caf50', '#66bb6a', '#81c784'],
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `${context.parsed.y} trips`
            }
          }
        },
        scales: {
          x: { ticks: { maxRotation: 45, minRotation: 45 } },
          y: { beginAtZero: true }
        }
      }
    };
    this.charts.push(new Chart(ctx, config));
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case OrderStatus.Scheduled: return '#2196f3';
      case OrderStatus.PickingUp: return '#ff9800';
      case OrderStatus.Transit: return '#9c27b0';
      case OrderStatus.Delivered: return '#4caf50';
      case OrderStatus.WaitingRC: return '#009688';
      case OrderStatus.ReadyToPay: return '#00bcd4';
      case OrderStatus.Canceled: return '#757575';
      default: return '#757575';
    }
  }

  private getStatusLabel(status: string): string {
    return status;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  }

  ngOnDestroy(): void {
    this.charts.forEach(chart => chart.destroy());
    this.destroy$.next();
    this.destroy$.complete();
  }
}
