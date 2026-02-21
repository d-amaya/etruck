import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { DashboardStateService, DashboardFilters } from '../dashboard-state.service';
import { SharedFilterService } from '../shared-filter.service';
import { OrderService } from '../../../../core/services';
import { Order, OrderStatus, OrderFilters, calcDispatcherProfit, calculateFuelCost } from '@haulhub/shared';

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

  trips: Order[] = [];
  loading = true;

  // Math utility for template
  Math = Math;

  // Chart data
  revenueData = { revenue: 0, expenses: 0, profit: 0 };
  statusData: { [key: string]: number } = {};
  topBrokers: TopPerformer[] = [];
  topDrivers: TopPerformer[] = [];
  topTrucks: TopPerformer[] = [];
  expenseData = { driver: 0, fuel: 0, fees: 0 };

  constructor(
    private dashboardState: DashboardStateService,
    private sharedFilterService: SharedFilterService,
    private orderService: OrderService
  ) {}

  ngOnInit(): void {
    // Subscribe to shared dashboard data from trip-table
    this.dashboardState.dashboardData$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (!response || !response.chartAggregates) return;
          
          this.processChartAggregates(response.chartAggregates);
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
          return this.orderService.getOrders(apiFilters);
        })
      )
      .subscribe({
        next: (response: any) => {
          this.trips = response.orders || [];
          this.loading = false;
          this.calculateChartData();
          // Render charts after a delay to ensure view is ready
          setTimeout(() => this.tryRenderCharts(), 200);
        },
        error: (error: any) => {
          console.error('[Charts Widget] Error loading trips for charts after refresh:', error);
          this.loading = false;
        }
      });
  }

  private buildApiFiltersForCharts(filters: DashboardFilters): OrderFilters {
    // Only use date range for charts, ignore other filters
    const apiFilters: OrderFilters = {
      limit: 1000 // Get up to 1000 trips for chart calculations
    };

    if (filters.dateRange.startDate) {
      const d = filters.dateRange.startDate;
      apiFilters.startDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00.000Z`;
    }
    if (filters.dateRange.endDate) {
      const d = filters.dateRange.endDate;
      apiFilters.endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59:59.999Z`;
    }

    // Explicitly NOT including: status, brokerId, lorryId, driverName
    // Charts show overview of ALL trips in the date range

    return apiFilters;
  }

  ngAfterViewInit(): void {
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
      totalRevenue += trip.orderRate || 0;
      const expenses = calcDispatcherProfit(trip);
      totalExpenses += expenses;

      driverPay += trip.driverPayment || 0;
      ownerPay += trip.carrierPayment || 0;
      
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
      //   broker.revenue += trip.orderRate || 0;
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

  private renderExpenseChart(): void {
    if (!this.expenseChartRef) return;

    const ctx = this.expenseChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    // Sort expenses by value (highest to lowest)
    const expenses = [
      { label: 'Driver Pay', value: this.expenseData.driver },
      { label: 'Fuel Cost', value: this.expenseData.fuel },
      { label: 'Fees', value: this.expenseData.fees }
    ].sort((a, b) => b.value - a.value);

    // Assign colors from darkest to lightest
    const colors = ['#1565c0', '#1976d2', '#42a5f5', '#64b5f6'];

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: ['Expenses'],
        datasets: expenses.map((expense, index) => ({
          label: expense.label,
          data: [expense.value],
          backgroundColor: colors[index],
          borderRadius: 4
        }))
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
    switch (status) {
      case OrderStatus.Scheduled: return 'Scheduled';
      case OrderStatus.PickingUp: return 'Picked Up';
      case OrderStatus.Transit: return 'In Transit';
      case OrderStatus.Delivered: return 'Delivered';
      case OrderStatus.ReadyToPay: return 'Paid';
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

  private processChartAggregates(agg: any): void {
    // Use backend aggregates
    this.statusData = agg.statusSummary || {};
    
    const payment = agg.paymentSummary || {};
    
    // Calculate total expenses - backend already includes all expenses in profit calculation
    // Total expenses = driver + owner + fuel + fees
    const totalExpenses = 
      (payment.totalDriverPayments || 0) + 
      (payment.totalFuelCost || 0) + 
      (payment.totalAdditionalFees || 0);
    
    this.revenueData = {
      revenue: payment.totalBrokerPayments || 0,
      expenses: totalExpenses,
      profit: payment.totalProfit || 0
    };
    
    this.expenseData = {
      driver: payment.totalDriverPayments || 0,
      fuel: payment.totalFuelCost || 0,
      fees: payment.totalAdditionalFees || 0
    };
    
    // Set top performers - map IDs to names using cache-on-miss
    const performers = agg.topPerformers || {};
    
    // Process brokers with cache-on-miss
    this.topBrokers = [];
    (performers.topBrokers || []).forEach((b: any) => {
      this.dashboardState.getBrokerName(b.id).subscribe(name => {
        this.topBrokers.push({ name, value: b.revenue, count: b.count });
        // Re-render chart after all brokers are resolved
        if (this.topBrokers.length === (performers.topBrokers || []).length) {
          setTimeout(() => this.tryRenderCharts(), 100);
        }
      });
    });
    
    this.topDrivers = (performers.topDrivers || []).map((d: any) => ({
      name: d.id ? d.id.substring(0, 8) : 'Unknown',
      value: d.trips,
      count: d.trips
    }));
    this.topTrucks = (performers.topTrucks || []).map((t: any) => ({
      name: t.id ? t.id.substring(0, 8) : 'Unknown',
      value: t.trips,
      count: t.trips
    }));
    
    
    this.loading = false;
    setTimeout(() => this.tryRenderCharts(), 200);
  }

  ngOnDestroy(): void {
    this.charts.forEach(chart => chart.destroy());
    this.destroy$.next();
    this.destroy$.complete();
  }
}
