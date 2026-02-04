import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { DashboardStateService, DashboardFilters } from '../../../dispatcher/dashboard/dashboard-state.service';
import { SharedFilterService } from '../../../dispatcher/dashboard/shared-filter.service';
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
  private dispatcherMap = new Map<string, string>(); // dispatcherId -> name

  // Math utility for template
  Math = Math;

  // Chart data
  revenueData = { revenue: 0, expenses: 0, profit: 0 };
  statusData: { [key: string]: number } = {};
  topBrokers: TopPerformer[] = [];
  topDispatchers: TopPerformer[] = [];
  topDrivers: TopPerformer[] = [];

  constructor(
    private dashboardState: DashboardStateService,
    private sharedFilterService: SharedFilterService,
    private tripService: TripService,
    private carrierService: CarrierService
  ) {}

  ngOnInit(): void {
    // Load dispatchers first
    this.loadDispatchers();
    
    let previousDateRange: { startDate: Date | null; endDate: Date | null } | null = null;
    
    this.sharedFilterService.filters$
      .pipe(
        takeUntil(this.destroy$),
        switchMap(filters => {
          const dateRangeChanged = !previousDateRange ||
            filters.dateRange.startDate?.getTime() !== previousDateRange.startDate?.getTime() ||
            filters.dateRange.endDate?.getTime() !== previousDateRange.endDate?.getTime();
          
          previousDateRange = { ...filters.dateRange };
          
          if (!dateRangeChanged && this.trips.length > 0) {
            return [];
          }
          
          this.loading = true;
          const apiFilters = this.buildApiFiltersForCharts(filters);
          return this.tripService.getTrips(apiFilters);
        })
      )
      .subscribe({
        next: (response) => {
          if (!response || !response.trips) return;
          
          this.trips = response.trips || [];
          this.loading = false;
          this.calculateChartData();
          setTimeout(() => this.tryRenderCharts(), 200);
        },
        error: (error) => {
          console.error('[Carrier Charts Widget] Error loading trips:', error);
          this.loading = false;
        }
      });
    
    this.dashboardState.refreshPaymentSummary$
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => {
          this.loading = true;
          const currentFilters = this.dashboardState.getCurrentFilters();
          const apiFilters = this.buildApiFiltersForCharts(currentFilters);
          return this.tripService.getTrips(apiFilters);
        })
      )
      .subscribe({
        next: (response) => {
          this.trips = response.trips || [];
          this.loading = false;
          this.calculateChartData();
          setTimeout(() => this.tryRenderCharts(), 200);
        },
        error: (error) => {
          console.error('[Carrier Charts Widget] Error loading trips after refresh:', error);
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

  private buildApiFiltersForCharts(filters: DashboardFilters): TripFilters {
    const apiFilters: TripFilters = {
      limit: 1000
    };

    if (filters.dateRange.startDate) {
      apiFilters.startDate = filters.dateRange.startDate.toISOString();
    }
    if (filters.dateRange.endDate) {
      apiFilters.endDate = filters.dateRange.endDate.toISOString();
    }

    return apiFilters;
  }

  ngAfterViewInit(): void {
    if (this.trips.length > 0) {
      setTimeout(() => this.renderCharts(), 100);
    }
  }

  private tryRenderCharts(): void {
    if (this.trips.length > 0 && 
        this.revenueChartRef && 
        this.statusChartRef && 
        this.topBrokersChartRef &&
        this.topDispatchersChartRef) {
      this.renderCharts();
    }
  }

  private calculateChartData(): void {
    if (!this.trips || this.trips.length === 0) {
      return;
    }

    let totalRevenue = 0;
    let totalExpenses = 0;
    let driverPay = 0;
    let ownerPay = 0;
    let dispatcherPay = 0;
    let fuelCost = 0;
    let fees = 0;

    const statusCounts: { [key: string]: number } = {};
    const brokerMap = new Map<string, { revenue: number; count: number }>();
    const dispatcherMap = new Map<string, { profit: number; count: number; name: string }>();
    const driverMap = new Map<string, { trips: number }>();

    this.trips.forEach(trip => {
      totalRevenue += trip.brokerPayment || 0;
      const expenses = calculateTripExpenses(trip);
      totalExpenses += expenses;

      driverPay += trip.driverPayment || 0;
      ownerPay += trip.truckOwnerPayment || 0;
      dispatcherPay += trip.dispatcherPayment || 0;
      
      if (trip.fuelGasAvgCost && trip.fuelGasAvgGallxMil) {
        const totalMiles = (trip.mileageOrder || 0) + (trip.mileageEmpty || 0);
        fuelCost += totalMiles * trip.fuelGasAvgGallxMil * trip.fuelGasAvgCost;
      }
      
      fees += (trip.lumperValue || 0) + (trip.detentionValue || 0);

      const status = trip.orderStatus || 'Scheduled';
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      // Broker performance
      if (trip.brokerName) {
        const broker = brokerMap.get(trip.brokerName) || { revenue: 0, count: 0 };
        broker.revenue += trip.brokerPayment || 0;
        broker.count += 1;
        brokerMap.set(trip.brokerName, broker);
      }

      // Dispatcher performance by profit
      if (trip.dispatcherId) {
        const dispatcherKey = trip.dispatcherId;
        const dispatcherName = this.dispatcherMap.get(trip.dispatcherId) || `Dispatcher ${trip.dispatcherId.substring(0, 8)}`;
        const dispatcher = dispatcherMap.get(dispatcherKey) || { 
          profit: 0, 
          count: 0,
          name: dispatcherName
        };
        dispatcher.profit += calculateTripProfit(trip);
        dispatcher.count += 1;
        dispatcherMap.set(dispatcherKey, dispatcher);
      }

      // Driver performance
      if (trip.driverName) {
        const driver = driverMap.get(trip.driverName) || { trips: 0 };
        driver.trips += 1;
        driverMap.set(trip.driverName, driver);
      }
    });

    this.revenueData = {
      revenue: totalRevenue,
      expenses: totalExpenses,
      profit: totalRevenue - totalExpenses
    };

    this.statusData = statusCounts;

    // Top 5 brokers by revenue
    this.topBrokers = Array.from(brokerMap.entries())
      .map(([name, data]) => ({ name, value: data.revenue, count: data.count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Top 5 dispatchers by profit
    this.topDispatchers = Array.from(dispatcherMap.entries())
      .map(([id, data]) => ({ name: data.name, value: data.profit, count: data.count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Top 5 drivers by trip count
    this.topDrivers = Array.from(driverMap.entries())
      .map(([name, data]) => ({ name, value: data.trips, count: data.trips }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }

  private renderCharts(): void {
    this.charts.forEach(chart => chart.destroy());
    this.charts = [];

    if (this.trips.length === 0) {
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
    switch (status) {
      case TripStatus.Scheduled: return '#2196f3';
      case TripStatus.PickedUp: return '#ff9800';
      case TripStatus.InTransit: return '#9c27b0';
      case TripStatus.Delivered: return '#4caf50';
      case TripStatus.Paid: return '#009688';
      default: return '#757575';
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
