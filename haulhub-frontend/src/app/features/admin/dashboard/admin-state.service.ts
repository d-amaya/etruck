import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, Subject, of } from 'rxjs';
import { distinctUntilChanged, debounceTime, tap, map, catchError } from 'rxjs/operators';
import { OrderStatus, Broker, Order } from '@haulhub/shared';
import { OrderService } from '../../../core/services/order.service';
import { AuthService } from '../../../core/services/auth.service';

export interface AdminDashboardFilters {
  dateRange: { startDate: Date | null; endDate: Date | null };
  status: OrderStatus | null;
  brokerId: string | null;
  dispatcherId: string | null;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  lastEvaluatedKey?: string;
  pageTokens?: string[];
}

export interface LoadingState {
  isLoading: boolean;
  isInitialLoad: boolean;
  isFilterUpdate: boolean;
  loadingMessage: string;
}

export interface ErrorState {
  hasError: boolean;
  errorMessage: string;
  canRetry: boolean;
  retryCount: number;
}

@Injectable({ providedIn: 'root' })
export class AdminDashboardStateService {
  private filtersSubject = new BehaviorSubject<AdminDashboardFilters>(this.getDefaultFilters());
  private paginationSubject = new BehaviorSubject<PaginationState>({ page: 0, pageSize: 25, pageTokens: [] });
  private loadingSubject = new BehaviorSubject<LoadingState>({
    isLoading: false, isInitialLoad: false, isFilterUpdate: false, loadingMessage: 'Loading...'
  });
  private errorSubject = new BehaviorSubject<ErrorState>({
    hasError: false, errorMessage: '', canRetry: false, retryCount: 0
  });

  public filters$ = this.filtersSubject.asObservable();
  public pagination$ = this.paginationSubject.asObservable();
  public loading$: Observable<LoadingState> = this.loadingSubject.asObservable().pipe(
    distinctUntilChanged((a, b) => a.isLoading === b.isLoading && a.isInitialLoad === b.isInitialLoad && a.isFilterUpdate === b.isFilterUpdate)
  );
  public error$ = this.errorSubject.asObservable();

  public filtersAndPagination$ = combineLatest([this.filters$, this.pagination$]).pipe(
    debounceTime(200),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
  );

  // Brokers
  private brokersCache: Broker[] = [];
  private brokersSubject = new BehaviorSubject<Broker[]>([]);
  public brokers$ = this.brokersSubject.asObservable();

  // Dispatchers derived from order data
  private dispatchersSubject = new BehaviorSubject<{ id: string; name: string }[]>([]);
  public dispatchers$ = this.dispatchersSubject.asObservable();

  // Dashboard data (orders + chartAggregates)
  private dashboardDataSubject = new BehaviorSubject<any>(null);
  public dashboardData$ = this.dashboardDataSubject.asObservable();

  private filteredOrdersSubject = new BehaviorSubject<Order[]>([]);
  public filteredOrders$ = this.filteredOrdersSubject.asObservable();

  private refreshSubject = new Subject<void>();
  public refresh$ = this.refreshSubject.asObservable();

  // View caches
  private ordersCache: { data: any; key: string } | null = null;
  private loadingTimeout: any;

  constructor(private orderService: OrderService, private authService: AuthService) {
    this.loadBrokers();
  }

  updateFilters(filters: Partial<AdminDashboardFilters>): void {
    const current = this.filtersSubject.value;
    Promise.resolve().then(() => {
      this.filtersSubject.next({ ...current, ...filters });
      this.paginationSubject.next({ page: 0, pageSize: this.paginationSubject.value.pageSize, pageTokens: [] });
    });
    this.setLoadingState(true, false, true);
    this.clearError();
  }

  updatePagination(pagination: Partial<PaginationState>): void {
    const current = this.paginationSubject.value;
    if (pagination.pageSize !== undefined && pagination.pageSize !== current.pageSize) {
      this.paginationSubject.next({ ...current, ...pagination, page: 0, pageTokens: [], lastEvaluatedKey: undefined });
    } else {
      this.paginationSubject.next({ ...current, ...pagination });
    }
  }

  updatePaginationSilent(pagination: Partial<PaginationState>): void {
    const current = this.paginationSubject.value;
    (this.paginationSubject as any)._value = { ...current, ...pagination };
  }

  clearFilters(): void {
    this.filtersSubject.next(this.getDefaultFilters());
    this.paginationSubject.next({ page: 0, pageSize: 25, pageTokens: [] });
  }

  getCurrentFilters(): AdminDashboardFilters { return this.filtersSubject.value; }
  getBrokers(): Broker[] { return this.brokersCache; }

  updateFilteredOrders(orders: Order[]): void { this.filteredOrdersSubject.next(orders); }
  updateDashboardData(data: any): void { this.dashboardDataSubject.next(data); }

  updateDispatchers(dispatchers: { id: string; name: string }[]): void {
    this.dispatchersSubject.next(dispatchers);
  }

  triggerRefresh(): void {
    this.invalidateViewCaches();
    this.refreshSubject.next();
  }

  // View caching
  private tripsKey(filters: AdminDashboardFilters, pagination: PaginationState): string {
    return JSON.stringify({ s: filters.dateRange.startDate?.getTime(), e: filters.dateRange.endDate?.getTime(), st: filters.status, b: filters.brokerId, d: filters.dispatcherId, p: pagination.page, ps: pagination.pageSize });
  }
  getCachedTrips(filters: AdminDashboardFilters, pagination: PaginationState): any | null {
    if (!this.ordersCache) return null;
    return this.ordersCache.key === this.tripsKey(filters, pagination) ? this.ordersCache.data : null;
  }
  setCachedTrips(filters: AdminDashboardFilters, pagination: PaginationState, data: any): void {
    this.ordersCache = { data, key: this.tripsKey(filters, pagination) };
  }
  invalidateViewCaches(): void { this.ordersCache = null; }

  getActiveFilterCount(): number {
    const f = this.filtersSubject.value;
    let c = 0;
    if (f.dateRange.startDate || f.dateRange.endDate) c++;
    if (f.status) c++;
    if (f.brokerId) c++;
    if (f.dispatcherId) c++;
    return c;
  }

  setLoadingState(isLoading: boolean, isInitialLoad = false, isFilterUpdate = false, message?: string): void {
    if (this.loadingTimeout) { clearTimeout(this.loadingTimeout); this.loadingTimeout = null; }
    this.loadingSubject.next({ isLoading, isInitialLoad, isFilterUpdate, loadingMessage: message || (isLoading ? 'Loading...' : '') });
    if (isLoading) {
      this.loadingTimeout = setTimeout(() => {
        if (this.loadingSubject.value.isLoading) {
          this.setError('Loading is taking longer than expected.', true);
          this.setLoadingState(false);
        }
      }, 30000);
    }
  }

  setError(message: string, canRetry = true): void {
    this.errorSubject.next({ hasError: true, errorMessage: message, canRetry, retryCount: this.errorSubject.value.retryCount + 1 });
  }
  clearError(): void { this.errorSubject.next({ hasError: false, errorMessage: '', canRetry: false, retryCount: 0 }); }
  startInitialLoad(): void { this.setLoadingState(true, true, false, 'Loading dashboard...'); this.clearError(); }
  completeLoad(): void { this.setLoadingState(false); }

  private getDefaultFilters(): AdminDashboardFilters {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0); endDate.setHours(23, 59, 59, 999);
    return { dateRange: { startDate, endDate }, status: null, brokerId: null, dispatcherId: null };
  }

  private loadBrokers(): void {
    this.orderService.getBrokers().subscribe({
      next: (brokers) => { this.brokersCache = brokers.filter(b => b.isActive); this.brokersSubject.next(this.brokersCache); },
      error: () => this.brokersSubject.next([])
    });
  }
}
