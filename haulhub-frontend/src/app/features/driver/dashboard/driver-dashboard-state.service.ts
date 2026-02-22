import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';

export interface DriverDashboardFilters {
  dateRange: {
    startDate: Date | null;
    endDate: Date | null;
  };
  status: string | null;
  truckId: string | null;
  dispatcherId: string | null;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  pageTokens: string[];
  lastEvaluatedKey?: string;
}

export interface LoadingState {
  isLoading: boolean;
  isInitialLoad: boolean;
  isFilterUpdate: boolean;
  loadingMessage: string;
}

const now = new Date();
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

const defaultFilters: DriverDashboardFilters = {
  dateRange: {
    startDate: monthStart,
    endDate: monthEnd
  },
  status: null,
  truckId: null,
  dispatcherId: null
};

const defaultPagination: PaginationState = {
  page: 0,
  pageSize: 10,
  pageTokens: []
};

const defaultLoadingState: LoadingState = {
  isLoading: false,
  isInitialLoad: true,
  isFilterUpdate: false,
  loadingMessage: ''
};

@Injectable({
  providedIn: 'root'
})
export class DriverDashboardStateService {
  constructor(private authService: AuthService) {
    this.authService.currentUser$.pipe(filter(u => u === null)).subscribe(() => {
      this.filtersSubject.next(defaultFilters);
      this.paginationSubject.next(defaultPagination);
      this.invalidateViewCaches();
    });
  }
  private filtersSubject = new BehaviorSubject<DriverDashboardFilters>(defaultFilters);
  private paginationSubject = new BehaviorSubject<PaginationState>(defaultPagination);
  private dashboardDataSubject = new BehaviorSubject<any>(null);
  private loadingSubject = new BehaviorSubject<LoadingState>(defaultLoadingState);
  private tripsCache: { data: any; key: string } | null = null;

  public filters$ = this.filtersSubject.asObservable();
  public pagination$ = this.paginationSubject.asObservable();
  public dashboardData$ = this.dashboardDataSubject.asObservable();
  public loading$ = this.loadingSubject.asObservable();

  public filtersAndPagination$: Observable<[DriverDashboardFilters, PaginationState]> = 
    combineLatest([this.filters$, this.pagination$]).pipe(
      debounceTime(200),
      distinctUntilChanged((prev, curr) => {
        // Compare only the values that should trigger a new API call
        // Exclude pageTokens since they're internal state
        const prevStr = JSON.stringify({
          filters: {
            startDate: prev[0].dateRange.startDate?.toISOString(),
            endDate: prev[0].dateRange.endDate?.toISOString(),
            status: prev[0].status,
            truckId: prev[0].truckId,
            dispatcherId: prev[0].dispatcherId
          },
          page: prev[1].page,
          pageSize: prev[1].pageSize
          // Exclude pageTokens and lastEvaluatedKey
        });
        
        const currStr = JSON.stringify({
          filters: {
            startDate: curr[0].dateRange.startDate?.toISOString(),
            endDate: curr[0].dateRange.endDate?.toISOString(),
            status: curr[0].status,
            truckId: curr[0].truckId,
            dispatcherId: curr[0].dispatcherId
          },
          page: curr[1].page,
          pageSize: curr[1].pageSize
          // Exclude pageTokens and lastEvaluatedKey
        });
        
        return prevStr === currStr;
      })
    );

  updateFilters(filters: Partial<DriverDashboardFilters>): void {
    const currentFilters = this.filtersSubject.value;
    const currentPagination = this.paginationSubject.value;
    
    const newFilters = { ...currentFilters, ...filters };
    const newPagination = { 
      page: 0, 
      pageSize: currentPagination.pageSize, 
      pageTokens: [] 
    };
    
    this.invalidateViewCaches();
    this.filtersSubject.next(newFilters);
    this.paginationSubject.next(newPagination);
  }

  updatePagination(pagination: Partial<PaginationState>): void {
    const current = this.paginationSubject.value;
    
    if (pagination.pageSize !== undefined && pagination.pageSize !== current.pageSize) {
      const newPagination = {
        ...current,
        ...pagination,
        page: 0,
        pageTokens: [],
        lastEvaluatedKey: undefined
      };
      this.paginationSubject.next(newPagination);
    } else {
      this.paginationSubject.next({ ...current, ...pagination });
    }
  }

  updatePaginationSilent(pagination: Partial<PaginationState>): void {
    const current = this.paginationSubject.value;
    (this.paginationSubject as any)._value = { ...current, ...pagination };
  }

  updateDashboardData(data: any): void {
    this.dashboardDataSubject.next(data);
  }

  setLoadingState(isLoading: boolean, isInitialLoad: boolean, isFilterUpdate: boolean): void {
    const loadingMessage = this.getLoadingMessage(isLoading, isInitialLoad, isFilterUpdate);
    this.loadingSubject.next({
      isLoading,
      isInitialLoad,
      isFilterUpdate,
      loadingMessage
    });
  }

  getCurrentFilters(): DriverDashboardFilters {
    return this.filtersSubject.value;
  }

  getCurrentPagination(): PaginationState {
    return this.paginationSubject.value;
  }

  private tripsKey(filters: DriverDashboardFilters, pagination: PaginationState): string {
    return JSON.stringify({
      s: filters.dateRange?.startDate?.getTime(), e: filters.dateRange?.endDate?.getTime(),
      st: filters.status, t: filters.truckId, d: filters.dispatcherId,
      p: pagination.page, ps: pagination.pageSize
    });
  }

  getCachedTrips(filters: DriverDashboardFilters, pagination: PaginationState): any | null {
    if (!this.tripsCache) return null;
    return this.tripsCache.key === this.tripsKey(filters, pagination) ? this.tripsCache.data : null;
  }

  setCachedTrips(filters: DriverDashboardFilters, pagination: PaginationState, data: any): void {
    this.tripsCache = { data, key: this.tripsKey(filters, pagination) };
  }

  invalidateViewCaches(): void {
    this.tripsCache = null;
  }

  private getLoadingMessage(isLoading: boolean, isInitialLoad: boolean, isFilterUpdate: boolean): string {
    if (!isLoading) return '';
    if (isInitialLoad) return 'Loading dashboard...';
    if (isFilterUpdate) return 'Applying filters...';
    return 'Loading trips...';
  }
}
