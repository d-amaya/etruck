import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, switchMap, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { CarrierFilterService } from '../../shared/carrier-filter.service';
import { CarrierAssetCacheService } from '../../shared/carrier-asset-cache.service';
import { TripService } from '../../../../core/services';
import { CarrierService, User } from '../../../../core/services/carrier.service';
import { Trip, TripStatus, TripFilters, calculateTripProfit, calculateTripExpenses } from '@haulhub/shared';

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
    
    console.log('Dashboard data received:', {
      statusSummary: agg.statusSummary,
      paymentSummary: agg.paymentSummary,
      topPerformers: agg.topPerformers,
      brokerMapSize: this.brokerMap.size,
      driverMapSize: this.driverMap.size
    });
    
    // Handle unified endpoint structure
    this.statusData = agg.statusSummary || {};
    this.totalTripsInRange = Object.values(this.statusData).reduce((sum: number, count) => sum + (count as number), 0);
    
    const payment = agg.paymentSummary || {};
    this.revenueData = {
      revenue: payment.totalBrokerPayments || 0,
      expenses: (payment.totalDriverPayments || 0) + (payment.totalTruckOwnerPayments || 0) + (payment.totalLumperFees || 0) + (payment.totalDetentionFees || 0) + (payment.totalFuelCost || 0),
      profit: payment.totalProfit || 0
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
    
    // Resolve dispatcher IDs to names
    this.topDispatchers = (topPerformers.topDispatchers || []).map((d: any) => {
      const dispatcher = this.dispatcherMap.get(d.id);
      return {
        name: dispatcher?.name || d.id.substring(0, 8),
        value: d.profit,
        count: d.count
      };
    });
    
    console.log('Processed chart data:', {
      revenueData: this.revenueData,
      topBrokers: this.topBrokers,
      topDrivers: this.topDrivers,
      topDispatchers: this.topDispatchers
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
  totalTripsInRange = 0;

  // Asset maps for name resolution
  private brokerMap = new Map<string, any>();
  private driverMap = new Map<string, any>();
  private dispatcherMap = new Map<string, any>();

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
      this.dispatcherMap = cache.dispatchers;
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

    console.log('Rendering charts, refs:', {
      revenue: !!this.revenueChartRef,
      status: !!this.statusChartRef,
      brokers: !!this.topBrokersChartRef,
      dispatchers: !!this.topDispatchersChartRef
    });

    this.renderRevenueChart();
    this.renderStatusChart();
    this.renderTopBrokersChart();
    this.renderTopDispatchersChart();
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

  private renderTopBrokersChart(): void {
    if (!this.topBrokersChartRef) return;

    const ctx = this.topBrokersChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: this.topBrokers.map(b => b.name),
        datasets: [{
          label: 'Revenue ($)',
          data: this.topBrokers.map(b => b.value),
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
              label: (context) => {
                const value = context.parsed.y || 0;
                const broker = this.topBrokers[context.dataIndex];
                return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${broker.count} trips)`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: {
            ticks: {
              callback: (value) => '$' + Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
            }
          }
        }
      }
    };

    this.charts.push(new Chart(ctx, config));
  }

  private renderTopDispatchersChart(): void {
    if (!this.topDispatchersChartRef) {
      console.log('No dispatcher chart ref');
      return;
    }
    if (this.topDispatchers.length === 0) {
      console.log('No dispatcher data');
      return;
    }

    const ctx = this.topDispatchersChartRef.nativeElement.getContext('2d');
    if (!ctx) {
      console.log('No dispatcher chart context');
      return;
    }

    console.log('Rendering dispatcher chart with data:', this.topDispatchers);

    const colors = this.topDispatchers.map((d, i) => {
      const baseColors = ['#1565c0', '#1976d2', '#42a5f5', '#64b5f6', '#90caf9'];
      return d.value >= 0 ? baseColors[i] : '#f44336';
    });

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: this.topDispatchers.map(d => d.name),
        datasets: [{
          label: 'Net Profit ($)',
          data: this.topDispatchers.map(d => d.value),
          backgroundColor: colors,
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
              label: (context) => {
                const value = context.parsed.y || 0;
                const dispatcher = this.topDispatchers[context.dataIndex];
                return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${dispatcher.count} trips)`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: {
            ticks: {
              callback: (value) => '$' + Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
            }
          }
        }
      }
    };

    this.charts.push(new Chart(ctx, config));
  }

  private getStatusColor(status: string): string {
    // Handle both camelCase keys from backend and display strings
    switch (status) {
      case 'scheduled':
      case 'Scheduled':
      case TripStatus.Scheduled:
        return '#2196f3';
      case 'pickedUp':
      case 'PickedUp':
      case 'Picked Up':
      case TripStatus.PickedUp:
        return '#ff9800';
      case 'inTransit':
      case 'InTransit':
      case 'In Transit':
      case TripStatus.InTransit:
        return '#9c27b0';
      case 'delivered':
      case 'Delivered':
      case TripStatus.Delivered:
        return '#4caf50';
      case 'paid':
      case 'Paid':
      case TripStatus.Paid:
        return '#009688';
      default:
        // Removed debug warning
        return '#757575';
    }
  }

  private getStatusLabel(status: string): string {
    switch (status) {
      case TripStatus.Scheduled: return 'Scheduled';
      case TripStatus.PickedUp: return 'Picked Up';
      case TripStatus.InTransit: return 'In Transit';
      case TripStatus.Delivered: return 'Delivered';
      case TripStatus.Paid: return 'Paid';
      default: return status;
    }
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
