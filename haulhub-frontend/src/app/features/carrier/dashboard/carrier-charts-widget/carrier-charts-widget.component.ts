import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, switchMap, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { CarrierFilterService } from '../../shared/carrier-filter.service';
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
  @ViewChild('revenueChart') revenueChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('statusChart') statusChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('topBrokersChart') topBrokersChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('topDispatchersChart') topDispatchersChartRef!: ElementRef<HTMLCanvasElement>;

  private destroy$ = new Subject<void>();
  private charts: Chart[] = [];

  trips: Trip[] = [];
  loading = true;
  dispatchers: User[] = [];
  private dispatcherMap = new Map<string, string>();
  private dataLoaded = false; // Track if data has been loaded

  // Math utility for template
  Math = Math;

  // Chart data - will be populated from backend aggregates
  revenueData = { revenue: 0, expenses: 0, profit: 0 };
  statusData: { [key: string]: number } = {};
  topBrokers: TopPerformer[] = [];
  topDispatchers: TopPerformer[] = [];
  topDrivers: TopPerformer[] = [];
  totalTripsInRange = 0;

  constructor(
    private carrierFilterService: CarrierFilterService,
    private tripService: TripService,
    private carrierService: CarrierService
  ) {}

  ngOnInit(): void {
    // Load dispatchers first
    this.loadDispatchers();
    
    this.carrierFilterService.dateFilter$
      .pipe(
        debounceTime(50), // Wait 50ms for both dates to be set
        distinctUntilChanged((prev, curr) => 
          prev.startDate?.getTime() === curr.startDate?.getTime() &&
          prev.endDate?.getTime() === curr.endDate?.getTime()
        ),
        takeUntil(this.destroy$),
        switchMap(dateFilter => {
          console.log('[Carrier Charts Widget] Loading data for date range:', dateFilter);
          this.loading = true;
          this.dataLoaded = false;
          // Use dashboard endpoint to get ALL trips for accurate aggregation
          return this.carrierService.getDashboardMetrics(dateFilter.startDate, dateFilter.endDate);
        })
      )
      .subscribe({
        next: (response) => {
          if (!response) return;
          
          // Use pre-calculated aggregates from backend
          const agg = response.chartAggregates;
          this.totalTripsInRange = agg.totalTripsInRange;
          
          this.revenueData = {
            revenue: agg.totalRevenue,
            expenses: agg.totalExpenses,
            profit: agg.totalRevenue - agg.totalExpenses
          };
          
          this.statusData = agg.statusBreakdown;
          
          this.topBrokers = agg.topBrokers.map(b => ({
            name: b.name,
            value: b.revenue,
            count: b.count
          }));
          
          this.topDispatchers = agg.topDispatchers.map(d => ({
            name: d.name,
            value: d.profit,
            count: d.count
          }));
          
          this.topDrivers = agg.topDrivers.map(d => ({
            name: d.name,
            value: d.trips,
            count: d.trips
          }));
          
          console.log(`[Carrier Charts Widget] Loaded aggregates from ${this.totalTripsInRange} trips`);
          
          this.dataLoaded = true;
          this.loading = false;
          setTimeout(() => this.tryRenderCharts(), 200);
        },
        error: (error) => {
          console.error('[Carrier Charts Widget] Error loading dashboard:', error);
          this.loading = false;
        }
      });
  }

  private loadDispatchers(): void {
    this.carrierService.getUsers('DISPATCHER').subscribe({
      next: (response) => {
        this.dispatchers = response.users || [];
        this.dispatcherMap.clear();
        this.dispatchers.forEach(d => this.dispatcherMap.set(d.userId, d.name));
      },
      error: (error) => {
        console.error('[Carrier Charts Widget] Error loading dispatchers:', error);
      }
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

    console.log('[Carrier Charts Widget] Rendering charts with data:', {
      revenueData: this.revenueData,
      statusDataKeys: Object.keys(this.statusData),
      topBrokersCount: this.topBrokers.length,
      topDispatchersCount: this.topDispatchers.length
    });

    if (this.totalTripsInRange === 0) {
      console.log('[Carrier Charts Widget] No trips to render');
      return;
    }

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
          backgroundColor: '#1976d2',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.parsed.x || 0;
                const broker = this.topBrokers[context.dataIndex];
                return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${broker.count} trips)`;
              }
            }
          }
        },
        scales: {
          x: {
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
    if (!this.topDispatchersChartRef) return;

    const ctx = this.topDispatchersChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: this.topDispatchers.map(d => d.name),
        datasets: [{
          label: 'Net Profit ($)',
          data: this.topDispatchers.map(d => d.value),
          backgroundColor: this.topDispatchers.map(d => d.value >= 0 ? '#4caf50' : '#f44336'),
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.parsed.x || 0;
                const dispatcher = this.topDispatchers[context.dataIndex];
                return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${dispatcher.count} trips)`;
              }
            }
          }
        },
        scales: {
          x: {
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
        console.warn('[Carrier Charts Widget] Unknown status for color:', status);
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
