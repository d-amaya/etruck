import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Observable, of, forkJoin } from 'rxjs';
import { switchMap, takeUntil, map, catchError, tap, finalize } from 'rxjs/operators';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent, MatPaginator } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { Order, OrderStatus, OrderFilters, Broker, calcAdminProfit } from '@haulhub/shared';
import { OrderService } from '../../../../core/services/order.service';
import { AdminDashboardStateService, AdminDashboardFilters, PaginationState } from '../admin-state.service';
import { AdminAssetCacheService } from '../admin-asset-cache.service';
import { AdminChartsWidgetComponent } from '../admin-charts-widget/admin-charts-widget.component';

@Component({
  selector: 'app-admin-order-table',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule,
    MatTableModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatDialogModule, MatSnackBarModule, MatChipsModule,
    MatFormFieldModule, MatSelectModule, MatInputModule,
    AdminChartsWidgetComponent
  ],
  templateUrl: './admin-order-table.component.html',
  styleUrls: ['./admin-order-table.component.scss']
})
export class AdminOrderTableComponent implements OnInit, OnDestroy {
  @ViewChild(MatPaginator) paginator?: MatPaginator;

  displayedColumns = [
    'status', 'invoiceNumber', 'brokerLoad', 'scheduledTimestamp',
    'pickupCity', 'deliveryCity', 'broker', 'dispatcher',
    'orderRate', 'adminProfit', 'actions'
  ];

  orders: Order[] = [];
  totalOrders = 0;
  pageSize = 25;
  pageIndex = 0;
  loading = false;
  hasActiveFilters = false;

  filterForm: FormGroup;
  statusOptions = Object.values(OrderStatus);
  brokers: Broker[] = [];
  dispatchers: { id: string; name: string }[] = [];

  // Inline edit state
  editingOrderId: string | null = null;
  editDispatcherRate: number | null = null;

  // Resolved name maps
  private brokerMap = new Map<string, any>();
  private dispatcherMap = new Map<string, string>(); // id -> name

  private destroy$ = new Subject<void>();
  Math = Math;

  constructor(
    private fb: FormBuilder,
    private orderService: OrderService,
    private dashboardState: AdminDashboardStateService,
    private assetCache: AdminAssetCacheService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.filterForm = this.fb.group({ status: [null], brokerId: [null], dispatcherId: [null] });
  }

  ngOnInit(): void {
    this.statusOptions.sort((a, b) => this.getStatusLabel(a).localeCompare(this.getStatusLabel(b)));

    // Load brokers
    this.assetCache.loadAssets().pipe(takeUntil(this.destroy$)).subscribe(cache => {
      this.brokerMap = cache.brokers;
    });
    this.dashboardState.brokers$.pipe(takeUntil(this.destroy$)).subscribe(brokers => {
      this.brokers = brokers.sort((a, b) => a.brokerName.localeCompare(b.brokerName));
      brokers.forEach(b => this.brokerMap.set(b.brokerId, b));
    });

    // Load dispatchers from state
    this.dashboardState.dispatchers$.pipe(takeUntil(this.destroy$)).subscribe(d => {
      this.dispatchers = d.sort((a, b) => a.name.localeCompare(b.name));
      d.forEach(dp => this.dispatcherMap.set(dp.id, dp.name));
    });

    // Subscribe to filters + pagination
    this.dashboardState.filtersAndPagination$.pipe(
      switchMap(([filters, pagination]) => {
        this.pageSize = pagination.pageSize;
        this.pageIndex = pagination.page;
        this.hasActiveFilters = this.dashboardState.getActiveFilterCount() > 0;
        return this.loadOrders(filters, pagination);
      }),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      this.orders = result.orders;
      this.totalOrders = result.total;
      if (result.chartAggregates) this.dashboardState.updateDashboardData(result);
      this.dashboardState.updateFilteredOrders(this.orders);
      this.resolveDispatcherNames();
    });
  }

  private resolveDispatcherNames(): void {
    const ids = [...new Set(this.orders.map(o => o.dispatcherId).filter(Boolean))];
    const unknown = ids.filter(id => !this.dispatcherMap.has(id));
    if (unknown.length === 0) {
      this.updateDispatchersList(ids);
      return;
    }
    this.assetCache.resolveEntities(unknown).subscribe(entities => {
      entities.forEach(e => this.dispatcherMap.set(e.id, e.name));
      this.updateDispatchersList(ids);
    });
  }

  private updateDispatchersList(ids: string[]): void {
    const list = ids.map(id => ({ id, name: this.dispatcherMap.get(id) || id.substring(0, 8) }));
    this.dashboardState.updateDispatchers(list);
  }

  private loadOrders(filters: AdminDashboardFilters, pagination: PaginationState): Observable<{ orders: Order[]; total: number; chartAggregates?: any }> {
    const cached = this.dashboardState.getCachedTrips(filters, pagination);
    if (cached) { this.loading = false; return of(cached); }

    this.loading = true;
    const apiFilters = this.buildApiFilters(filters, pagination);

    if (pagination.page === 0) {
      (apiFilters as any).includeAggregates = true;
    }

    return this.orderService.getOrders(apiFilters).pipe(
      map((response: any) => {
        this.loading = false;
        const orders = (response.orders || []).sort((a: any, b: any) =>
          new Date(b.scheduledTimestamp).getTime() - new Date(a.scheduledTimestamp).getTime()
        );

        if (response.lastEvaluatedKey) {
          const pageTokens = [...(pagination.pageTokens || [])];
          pageTokens[pagination.page] = response.lastEvaluatedKey;
          this.dashboardState.updatePaginationSilent({ pageTokens });
        }

        const itemsBefore = pagination.page * pagination.pageSize;
        const total = response.lastEvaluatedKey ? itemsBefore + orders.length + 1 : itemsBefore + orders.length;
        return { orders, total, chartAggregates: response.aggregates };
      }),
      tap(result => this.dashboardState.setCachedTrips(filters, pagination, result)),
      catchError(error => {
        this.loading = false;
        if (error.name !== 'AbortError' && error.status !== 0) {
          this.snackBar.open('Error loading orders.', 'Close', { duration: 5000 });
        }
        return of({ orders: [], total: 0 });
      }),
      finalize(() => this.dashboardState.completeLoad())
    );
  }

  private buildApiFilters(filters: AdminDashboardFilters, pagination: PaginationState): OrderFilters {
    const f: OrderFilters = { limit: pagination.pageSize };
    if (pagination.page > 0 && pagination.pageTokens?.[pagination.page - 1]) {
      f.lastEvaluatedKey = pagination.pageTokens[pagination.page - 1];
    }
    if (filters.dateRange.startDate) {
      const d = filters.dateRange.startDate;
      f.startDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00.000Z`;
    }
    if (filters.dateRange.endDate) {
      const d = filters.dateRange.endDate;
      f.endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59:59.999Z`;
    }
    if (filters.status) f.orderStatus = filters.status;
    if (filters.brokerId) f.brokerId = filters.brokerId;
    if (filters.dispatcherId) f.dispatcherId = filters.dispatcherId;
    return f;
  }

  // ── Display helpers ───────────────────────────────────────

  getBrokerName(brokerId: string): string { return this.brokerMap.get(brokerId)?.brokerName || brokerId.substring(0, 8); }
  getDispatcherName(dispatcherId: string): string { return this.dispatcherMap.get(dispatcherId) || dispatcherId.substring(0, 8); }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const d = new Date(dateString);
    return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
  }

  calculateAdminProfit(order: Order): number { return calcAdminProfit(order); }

  getStatusClass(status: string): string {
    switch (status) {
      case OrderStatus.Scheduled: return 'status-scheduled';
      case OrderStatus.PickingUp: return 'status-picked-up';
      case OrderStatus.Transit: return 'status-in-transit';
      case OrderStatus.Delivered: return 'status-delivered';
      case OrderStatus.ReadyToPay: return 'status-paid';
      case OrderStatus.Canceled: return 'status-canceled';
      default: return '';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case OrderStatus.Scheduled: return 'Scheduled';
      case OrderStatus.PickingUp: return 'Picked Up';
      case OrderStatus.Transit: return 'In Transit';
      case OrderStatus.Delivered: return 'Delivered';
      case OrderStatus.ReadyToPay: return 'Paid';
      case OrderStatus.Canceled: return 'Canceled';
      default: return String(status);
    }
  }

  // ── Inline dispatcherRate editing ─────────────────────────

  startEdit(order: Order): void {
    this.editingOrderId = order.orderId;
    this.editDispatcherRate = order.dispatcherRate || 5;
  }

  cancelEdit(): void {
    this.editingOrderId = null;
    this.editDispatcherRate = null;
  }

  saveDispatcherRate(order: Order): void {
    if (this.editDispatcherRate === null || this.editDispatcherRate < 0 || this.editDispatcherRate > 10) {
      this.snackBar.open('Dispatcher rate must be between 0 and 10%', 'Close', { duration: 3000 });
      return;
    }
    this.orderService.updateOrder(order.orderId, { dispatcherRate: this.editDispatcherRate } as any).subscribe({
      next: (updated) => {
        const idx = this.orders.findIndex(o => o.orderId === order.orderId);
        if (idx >= 0) this.orders[idx] = updated;
        this.editingOrderId = null;
        this.editDispatcherRate = null;
        this.dashboardState.triggerRefresh();
        this.snackBar.open('Dispatcher rate updated', 'Close', { duration: 3000 });
      },
      error: () => this.snackBar.open('Failed to update dispatcher rate', 'Close', { duration: 5000 })
    });
  }

  // ── Actions ───────────────────────────────────────────────

  viewOrder(order: Order): void { this.router.navigate(['/admin/orders', order.orderId]); }

  onPageChange(event: PageEvent): void {
    this.dashboardState.updatePagination({ page: event.pageIndex, pageSize: event.pageSize });
  }

  onDropdownChange(): void { this.applyFilters(); }

  clearAllFilters(): void {
    this.filterForm.patchValue({ status: null, brokerId: null, dispatcherId: null });
    const current = this.dashboardState.getCurrentFilters();
    this.dashboardState.updateFilters({ dateRange: current.dateRange, status: null, brokerId: null, dispatcherId: null });
    if (this.paginator) this.paginator.pageIndex = 0;
  }

  private applyFilters(): void {
    const v = this.filterForm.value;
    this.dashboardState.updateFilters({ status: v.status, brokerId: v.brokerId, dispatcherId: v.dispatcherId });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
