import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { DashboardStateService, DashboardFilters } from '../dashboard-state.service';
import { SharedFilterService } from '../shared-filter.service';
import { TripService } from '../../../../core/services';
import { Trip, TripStatus, TripFilters, calculateTripProfit, calculateTripExpenses, calculateFuelCost } from '@haulhub/shared';

Chart.register(...registerables);

interface TopPerformer {
  name: string;
  value: number;
  count: number;
}

@Component({
  selector: 'app-dashboard-charts-widget',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  templateUrl: './dashboard-charts-widget.component.html',
  styleUrls: ['./dashboard-charts-widget.component.scss']
})
export class DashboardChartsWidgetComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('revenueChart') revenueChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('statusChart') statusChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('topPerformersChart') topPerformersChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('expenseChart') expenseChartRef!: ElementRef<HTMLCanvasElement>;

  private destroy$ = new Subject<void>();
  private charts: Chart[] = [];

  trips: Trip[] = [];
  loading = true;

  // Math utility for template
  Math = Math;

  // Chart data
  revenueData = { revenue: 0, expenses: 0, profit: 0 };
  statusData: { [key: string]: number } = {};
  topBrokers: TopPerformer[] = [];
  topDrivers: TopPerformer[] = [];
  topTrucks: TopPerformer[] = [];
  expenseData = { driver: 0, owner: 0, fuel: 0, fees: 0 };

  constructor(
    private dashboardState: DashboardStateService,
    private sharedFilterService: SharedFilterService,
    private tripService: TripService
  ) {}

  ngOnInit(): void {
    // Track previous date range to detect changes
    let previousDateRange: { startDate: Date | null; endDate: Date | null } | null = null;
    
    // Subscribe to filter changes but only reload when date range changes
    this.sharedFilterService.filters$
      .pipe(
        takeUntil(this.destroy$),
        switchMap(filters => {
          // Check if date range actually changed
          const dateRangeChanged = !previousDateRange ||
            filters.dateRange.startDate?.getTime() !== previousDateRange.startDate?.getTime() ||
            filters.dateRange.endDate?.getTime() !== previousDateRange.endDate?.getTime();
          
          // Update previous date range
          previousDateRange = { ...filters.dateRange };
          
          if (!dateRangeChanged && this.trips.length > 0) {
            return []; // Return empty observable to skip
          }
          
          this.loading = true;
          // Build API filters with ONLY date range (ignore other filters)
          const apiFilters = this.buildApiFiltersForCharts(filters);
          
          // Use unified dashboard endpoint instead of multiple calls
          return this.tripService.getDashboard(apiFilters);
        })
      )
      .subscribe({
        next: (response: any) => {
          console.log('[Charts Widget] Dashboard response:', response);
          
          if (!response || !response.chartAggregates) return;
          
          const agg = response.chartAggregates;
          
          // Use backend aggregates
          this.statusData = agg.statusSummary || {};
          
          const payment = agg.paymentSummary || {};
          this.revenueData = {
            revenue: payment.totalBrokerPayments || 0,
            expenses: (payment.totalDriverPayments || 0) + (payment.totalTruckOwnerPayments || 0),
            profit: payment.totalProfit || 0
          };
          
          // Set expense breakdown
          this.expenseData = {
            driver: payment.totalDriverPayments || 0,
            owner: payment.totalTruckOwnerPayments || 0,
            fuel: payment.totalFuelCost || 0,
            fees: (payment.totalLumperFees || 0) + (payment.totalDetentionFees || 0) + (payment.totalAdditionalFees || 0)
          };
          
          console.log('[Charts Widget] Expense data:', this.expenseData);
          
          // Set top performers
          const performers = agg.topPerformers || {};
          this.topBrokers = (performers.topBrokers || []).map((b: any) => ({
            name: b.name,
            value: b.revenue,
            count: b.count
          }));
          this.topDrivers = (performers.topDrivers || []).map((d: any) => ({
            name: d.name,
            value: d.trips,
            count: d.trips
          }));
          this.topTrucks = (performers.topTrucks || []).map((t: any) => ({
            name: t.name,
            value: t.trips,
            count: t.trips
          }));
          
          // We have aggregates, no need for trips array
          const totalTrips = Object.values(this.statusData).reduce((sum: number, count) => sum + (count as number), 0);
          
          console.log(`[Charts Widget] Loaded aggregates for ${totalTrips} trips`);
          
          this.loading = false;
          // Render charts after a delay to ensure view is ready
          setTimeout(() => this.tryRenderCharts(), 200);
        },
        error: (error) => {
          console.error('[Charts Widget] Error loading dashboard aggregates:', error);
          this.loading = false;
        }
      });
    
    // Subscribe to payment summary refresh (triggered by trip add/delete)
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
          // Render charts after a delay to ensure view is ready
          setTimeout(() => this.tryRenderCharts(), 200);
        },
        error: (error) => {
          console.error('[Charts Widget] Error loading trips for charts after refresh:', error);
          this.loading = false;
        }
      });
  }

  private buildApiFiltersForCharts(filters: DashboardFilters): TripFilters {
    // Only use date range for charts, ignore other filters
    const apiFilters: TripFilters = {
      limit: 1000 // Get up to 1000 trips for chart calculations
    };

    if (filters.dateRange.startDate) {
      apiFilters.startDate = filters.dateRange.startDate.toISOString();
    }
    if (filters.dateRange.endDate) {
      apiFilters.endDate = filters.dateRange.endDate.toISOString();
    }

    // Explicitly NOT including: status, brokerId, lorryId, driverName
    // Charts show overview of ALL trips in the date range

    return apiFilters;
  }

  ngAfterViewInit(): void {
    console.log('[Charts Widget] AfterViewInit - Canvas refs:', {
      revenue: !!this.revenueChartRef,
      status: !!this.statusChartRef,
      topPerformers: !!this.topPerformersChartRef,
      expense: !!this.expenseChartRef
    });
    // Initial render if data is already available
    if (this.hasAggregateData()) {
      setTimeout(() => this.renderCharts(), 100);
    }
  }

  hasAggregateData(): boolean {
    return Object.keys(this.statusData).length > 0 || 
           this.revenueData.revenue > 0 ||
           this.topBrokers.length > 0;
  }

  getTotalTrips(): number {
    return Object.values(this.statusData).reduce((sum: number, count) => sum + (count as number), 0);
  }

  private tryRenderCharts(): void {
    const hasData = this.hasAggregateData();
    const hasRefs = !!(this.revenueChartRef && 
        this.statusChartRef && 
        this.topPerformersChartRef && 
        this.expenseChartRef);
    
    console.log('[Charts Widget] Render check:', { hasData, hasRefs });
    
    if (hasData && hasRefs) {
      this.renderCharts();
    } else if (hasData && !hasRefs) {
      // Retry after a short delay if we have data but refs aren't ready yet
      setTimeout(() => this.tryRenderCharts(), 100);
    }
  }

  private calculateChartData(): void {
    if (!this.trips || this.trips.length === 0) {
      return;
    }

    // Revenue breakdown
    let totalRevenue = 0;
    let totalExpenses = 0;
    let driverPay = 0;
    let ownerPay = 0;
    let fuelCost = 0;
    let fees = 0;

    // Status distribution
    const statusCounts: { [key: string]: number } = {};

    // Top performers tracking
    const brokerMap = new Map<string, { revenue: number; count: number }>();
    const driverMap = new Map<string, { trips: number }>();
    const truckMap = new Map<string, { trips: number }>();

    this.trips.forEach(trip => {
      // Revenue and expenses
      totalRevenue += trip.brokerPayment || 0;
      const expenses = calculateTripExpenses(trip);
      totalExpenses += expenses;

      driverPay += trip.driverPayment || 0;
      ownerPay += trip.truckOwnerPayment || 0;
      
      // Calculate fuel cost
      if (trip.fuelGasAvgCost && trip.fuelGasAvgGallxMil) {
        const totalMiles = (trip.mileageOrder || 0) + (trip.mileageEmpty || 0);
        fuelCost += totalMiles * trip.fuelGasAvgGallxMil * trip.fuelGasAvgCost;
      }
      
      fees += (trip.lumperValue || 0) + (trip.detentionValue || 0);

      // Status counts
      const status = trip.orderStatus || 'Scheduled';
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      // Broker performance - DISABLED: Using backend aggregates instead
      // if (trip.brokerId) {
      //   const broker = brokerMap.get(trip.brokerId) || { revenue: 0, count: 0 };
      //   broker.revenue += trip.brokerPayment || 0;
      //   broker.count += 1;
      //   brokerMap.set(trip.brokerId, broker);
      // }

      // Driver performance - DISABLED: Using backend aggregates instead
      // if (trip.driverId) {
      //   const driver = driverMap.get(trip.driverId) || { trips: 0 };
      //   driver.trips += 1;
      //   driverMap.set(trip.driverId, driver);
      // }

      // Truck performance
      if (trip.truckId) {
        const truck = truckMap.get(trip.truckId) || { trips: 0 };
        truck.trips += 1;
        truckMap.set(trip.truckId, truck);
      }
    });

    this.revenueData = {
      revenue: totalRevenue,
      expenses: totalExpenses,
      profit: totalRevenue - totalExpenses
    };

    this.statusData = statusCounts;

    this.expenseData = {
      driver: driverPay,
      owner: ownerPay,
      fuel: fuelCost,
      fees: fees
    };

    // Top 5 brokers by revenue
    this.topBrokers = Array.from(brokerMap.entries())
      .map(([name, data]) => ({ name, value: data.revenue, count: data.count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Top 5 drivers by trip count
    this.topDrivers = Array.from(driverMap.entries())
      .map(([name, data]) => ({ name, value: data.trips, count: data.trips }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Top 5 trucks by trip count
    this.topTrucks = Array.from(truckMap.entries())
      .map(([name, data]) => ({ name, value: data.trips, count: data.trips }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }

  private renderCharts(): void {
    
    // Destroy existing charts
    this.charts.forEach(chart => chart.destroy());
    this.charts = [];

    this.renderRevenueChart();
    this.renderStatusChart();
    this.renderTopPerformersChart();
    this.renderExpenseChart();
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

  private renderTopPerformersChart(): void {
    if (!this.topPerformersChartRef) return;

    const ctx = this.topPerformersChartRef.nativeElement.getContext('2d');
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

  private renderExpenseChart(): void {
    if (!this.expenseChartRef) return;

    const ctx = this.expenseChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: ['Expenses'],
        datasets: [
          {
            label: 'Driver Pay',
            data: [this.expenseData.driver],
            backgroundColor: '#ff9800',
            borderRadius: 4
          },
          {
            label: 'Owner Pay',
            data: [this.expenseData.owner],
            backgroundColor: '#9c27b0',
            borderRadius: 4
          },
          {
            label: 'Fuel Cost',
            data: [this.expenseData.fuel],
            backgroundColor: '#f44336',
            borderRadius: 4
          },
          {
            label: 'Fees',
            data: [this.expenseData.fees],
            backgroundColor: '#607d8b',
            borderRadius: 4
          }
        ]
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
                const label = context.dataset.label || '';
                const value = context.parsed.y || 0;
                return `${label}: $${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
              }
            }
          }
        },
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
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
