import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Observable, of, forkJoin } from 'rxjs';
import { switchMap, takeUntil, map, catchError, tap, finalize, take } from 'rxjs/operators';
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
import { MatMenuModule } from '@angular/material/menu';
import { Order, OrderStatus, OrderFilters, Broker, calcAdminProfit } from '@haulhub/shared';
import { OrderService } from '../../../../core/services/order.service';
import { ExcelExportService } from '../../../../core/services/excel-export.service';
import { AdminDashboardStateService, AdminDashboardFilters, PaginationState } from '../admin-state.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AdminAssetCacheService } from '../admin-asset-cache.service';
import { AdminChartsWidgetComponent } from '../admin-charts-widget/admin-charts-widget.component';

@Component({
  selector: 'app-admin-order-table',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatDialogModule, MatSnackBarModule, MatChipsModule,
    MatFormFieldModule, MatSelectModule, MatInputModule, MatMenuModule,
    AdminChartsWidgetComponent
  ],
  templateUrl: './admin-order-table.component.html',
  styleUrls: ['./admin-order-table.component.scss']
})
export class AdminOrderTableComponent implements OnInit, OnDestroy {
  @ViewChild(MatPaginator) paginator?: MatPaginator;

  displayedColumns = [
    'status', 'scheduledTimestamp', 'invoiceNumber', 'brokerLoad',
    'pickupCity', 'deliveryCity', 'broker', 'dispatcher',
    'orderRate', 'adminProfit', 'actions'
  ];

  orders: Order[] = [];
  totalOrders = 0;
  pageSize = 10;
  pageIndex = 0;
  loading = false;
  hasActiveFilters = false;

  filterForm: FormGroup;
  statusOptions = Object.values(OrderStatus);
  brokers: Broker[] = [];
  dispatchers: { id: string; name: string }[] = [];

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
    private excelExportService: ExcelExportService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.filterForm = this.fb.group({ status: [null], brokerId: [null], dispatcherId: [null] });
  }

  ngOnInit(): void {
    this.statusOptions.sort((a, b) => this.getStatusLabel(a).localeCompare(this.getStatusLabel(b)));

    // Restore filter form from state
    this.dashboardState.filters$.pipe(takeUntil(this.destroy$), take(1)).subscribe(f => {
      this.filterForm.patchValue({ status: f.status || null, brokerId: f.brokerId || null, dispatcherId: f.dispatcherId || null }, { emitEvent: false });
    });

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
    if (cached) {
      if (cached.lastEvaluatedKey && pagination.page === 0) {
        this.dashboardState.updatePaginationSilent({ pageTokens: [cached.lastEvaluatedKey] });
      }
      this.loading = false;
      return of(cached);
    }

    this.loading = true;
    const apiFilters = this.buildApiFilters(filters, pagination);

    if (pagination.page === 0) {
      (apiFilters as any).includeAggregates = true;
      if (!this.dashboardState.getCachedAnalytics(filters.dateRange.startDate, filters.dateRange.endDate)) {
        (apiFilters as any).includeDetailedAnalytics = true;
      }
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

        // Cache analytics/payment into Admin's own state
        if (pagination.page === 0 && response.detailedAnalytics) {
          const start = filters.dateRange.startDate;
          const end = filters.dateRange.endDate;
          const analyticsData = { ...response.detailedAnalytics, paymentReport: response.paymentReport, entityIds: response.entityIds || [] };
          this.dashboardState.setCachedAnalytics(start, end, analyticsData);
          if (response.paymentReport) {
            this.dashboardState.setCachedPaymentReport(start, end, response.paymentReport);
          }
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
      case OrderStatus.WaitingRC: return 'status-waiting-rc';
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
      case OrderStatus.WaitingRC: return 'Waiting RC';
      case OrderStatus.ReadyToPay: return 'Ready To Pay';
      case OrderStatus.Canceled: return 'Canceled';
      default: return String(status);
    }
  }

  // ── Inline dispatcherRate editing ─────────────────────────

  editOrder(order: Order): void { this.router.navigate(['/admin/orders', order.orderId, 'edit']); }

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

  // ── Exports ────────────────────────────────────────────────

  exportPDF(): void {
    const filters = this.dashboardState.getCurrentFilters();
    const apiFilters: any = { ...this.buildApiFilters(filters, { page: 0, pageSize: 10, pageTokens: [] }), returnAllOrders: 'true', includeAggregates: 'true' };
    delete apiFilters.limit;
    delete apiFilters.lastEvaluatedKey;
    this.orderService.getOrders(apiFilters).subscribe({
      next: (res: any) => this.generatePDF(res.orders || [], res.aggregates),
      error: () => this.snackBar.open('Failed to export PDF', 'Close', { duration: 3000 })
    });
  }

  private generatePDF(allOrders: any[], aggregates: any): void {
    const doc = new jsPDF('landscape');
    const pw = doc.internal.pageSize.getWidth();
    const blue: [number, number, number] = [25, 118, 210];
    const green: [number, number, number] = [46, 125, 50];
    const red: [number, number, number] = [211, 47, 47];
    let y = 20;

    // Header
    doc.setFillColor(...blue); doc.rect(0, 0, pw, 35, 'F');
    doc.setFontSize(26); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('eTrucky', 14, 22);
    doc.setFontSize(16); doc.text('Admin Orders Report', pw / 2, 22, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, pw - 14, 22, { align: 'right' });
    y = 45;

    // Filters
    const filters = this.dashboardState.getCurrentFilters();
    const parts: string[] = [];
    if (filters.dateRange?.startDate && filters.dateRange?.endDate) {
      parts.push(`Date: ${this.formatDate(filters.dateRange.startDate.toISOString())} - ${this.formatDate(filters.dateRange.endDate.toISOString())}`);
    }
    if (filters.status) parts.push(`Status: ${this.getStatusLabel(filters.status)}`);
    if (filters.brokerId) parts.push(`Broker: ${this.getBrokerName(filters.brokerId)}`);
    if (filters.dispatcherId) parts.push(`Dispatcher: ${this.getDispatcherName(filters.dispatcherId)}`);
    if (parts.length > 0) {
      doc.setFillColor(227, 242, 253); doc.rect(14, y - 5, pw - 28, 12, 'F');
      doc.setFontSize(10); doc.setTextColor(...blue);
      doc.text(`Filters: ${parts.join(' | ')}`, pw / 2, y + 2, { align: 'center' });
      y += 18;
    }

    // Summary cards
    if (aggregates?.paymentSummary) {
      const p = aggregates.paymentSummary;
      const totalOrderRate = p.orderRate || 0;
      const adminEarnings = p.adminPayment || 0;
      const fees = (p.lumperValue || 0) + (p.detentionValue || 0);
      const profit = adminEarnings - fees;
      const cw = (pw - 28 - 30) / 4, ch = 25, gap = 10;
      this.drawCard(doc, 14, y, cw, ch, 'Total Orders', allOrders.length.toString(), blue);
      this.drawCard(doc, 14 + cw + gap, y, cw, ch, 'Total Revenue', this.formatCurrency(totalOrderRate), blue);
      this.drawCard(doc, 14 + (cw + gap) * 2, y, cw, ch, 'Admin Earnings', this.formatCurrency(adminEarnings), green);
      this.drawCard(doc, 14 + (cw + gap) * 3, y, cw, ch, profit >= 0 ? 'Profit' : 'Loss', this.formatCurrency(Math.abs(profit)), profit >= 0 ? green : red);
      y += ch + 15;
    }

    // Table
    const headers = ['Status', 'Date', 'Invoice #', 'Pickup', 'Delivery', 'Broker', 'Dispatcher', 'Revenue', 'Admin Payment'];
    const rows = allOrders.map(o => [
      this.getStatusLabel(o.orderStatus), this.formatDate(o.scheduledTimestamp),
      o.invoiceNumber || 'N/A',
      `${o.pickupCity || ''}, ${o.pickupState || ''}`, `${o.deliveryCity || ''}, ${o.deliveryState || ''}`,
      this.getBrokerName(o.brokerId), this.getDispatcherName(o.dispatcherId),
      this.formatCurrency(o.orderRate || 0), this.formatCurrency(o.adminPayment || 0)
    ]);
    autoTable(doc, {
      startY: y, head: [headers], body: rows, theme: 'grid',
      headStyles: { fillColor: blue, textColor: [255, 255, 255], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right' } }
    });
    doc.save(`admin-orders-${new Date().toISOString().split('T')[0]}.pdf`);
    this.snackBar.open('PDF exported successfully', 'Close', { duration: 3000 });
  }

  private drawCard(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, color: [number, number, number]): void {
    doc.setFillColor(250, 250, 250); doc.roundedRect(x, y, w, h, 3, 3, 'F');
    doc.setFillColor(...color); doc.rect(x, y, w, 3, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(label, x + w / 2, y + 12, { align: 'center' });
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...color);
    doc.text(value, x + w / 2, y + 20, { align: 'center' });
  }

  exportCSV(): void {
    const filters = this.dashboardState.getCurrentFilters();
    const apiFilters: any = { ...this.buildApiFilters(filters, { page: 0, pageSize: 10, pageTokens: [] }), includeAggregates: true, returnAllOrders: 'true' };
    delete apiFilters.limit;
    delete apiFilters.lastEvaluatedKey;
    this.orderService.getOrders(apiFilters).subscribe({
      next: (res: any) => {
        const orders = res.orders || [];
        const headers = ['Status', 'Date', 'Invoice #', 'Broker Load', 'Pickup', 'Delivery', 'Broker', 'Dispatcher', 'Revenue', 'Admin Rate %', 'Admin Payment'];
        const rows = orders.map((o: any) => [
          this.getStatusLabel(o.orderStatus), this.formatDate(o.scheduledTimestamp),
          o.invoiceNumber || '', o.brokerLoad || '',
          `${o.pickupCity || ''}, ${o.pickupState || ''}`, `${o.deliveryCity || ''}, ${o.deliveryState || ''}`,
          this.getBrokerName(o.brokerId), this.getDispatcherName(o.dispatcherId),
          o.orderRate || 0, o.adminRate || 0, o.adminPayment || 0
        ]);
        this.excelExportService.exportToExcel('admin-orders-export', [{ name: 'Orders', headers, rows }],
          filters.dateRange.startDate, filters.dateRange.endDate);
        this.snackBar.open('Excel exported successfully', 'Close', { duration: 3000 });
      },
      error: () => this.snackBar.open('Failed to export Excel', 'Close', { duration: 3000 })
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
