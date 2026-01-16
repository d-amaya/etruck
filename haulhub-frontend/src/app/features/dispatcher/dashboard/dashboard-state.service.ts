import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, Subject } from 'rxjs';
import { distinctUntilChanged, debounceTime } from 'rxjs/operators';
import { TripStatus, Broker, Trip } from '@haulhub/shared';
import { TripService } from '../../../core/services/trip.service';
import { AuthService } from '../../../core/services/auth.service';
import { SharedFilterService } from './shared-filter.service';

export interface DashboardFilters {
  dateRange: {
    startDate: Date | null;
    endDate: Date | null;
  };
  status: TripStatus | null;
  brokerId: string | null;
  lorryId: string | null;
  driverId: string | null;
  driverName: string | null;
}

export interface PaymentSummary {
  totalBrokerPayments: number;
  totalDriverPayments: number;
  totalLorryOwnerPayments: number;
  totalProfit: number;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  lastEvaluatedKey?: string;
  pageTokens?: string[]; // Store tokens for each page to enable back navigation
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

@Injectable({
  providedIn: 'root'
})
export class DashboardStateService {
  private readonly FILTERS_STORAGE_KEY = 'haulhub_dispatcher_filters';
  private readonly PAGINATION_STORAGE_KEY = 'haulhub_dispatcher_pagination';

  private filtersSubject = new BehaviorSubject<DashboardFilters>(this.loadFiltersFromStorage());
  private paginationSubject = new BehaviorSubject<PaginationState>(this.loadPaginationFromStorage());
  private loadingSubject = new BehaviorSubject<LoadingState>({
    isLoading: false,
    isInitialLoad: false,
    isFilterUpdate: false,
    loadingMessage: 'Loading...'
  });
  private errorSubject = new BehaviorSubject<ErrorState>({
    hasError: false,
    errorMessage: '',
    canRetry: false,
    retryCount: 0
  });

  public filters$: Observable<DashboardFilters> = this.filtersSubject.asObservable();
  public pagination$: Observable<PaginationState> = this.paginationSubject.asObservable();
  public loading$: Observable<LoadingState> = this.loadingSubject.asObservable().pipe(
    distinctUntilChanged((prev, curr) => 
      prev.isLoading === curr.isLoading && 
      prev.isInitialLoad === curr.isInitialLoad && 
      prev.isFilterUpdate === curr.isFilterUpdate &&
      prev.loadingMessage === curr.loadingMessage
    )
  );
  public error$: Observable<ErrorState> = this.errorSubject.asObservable();

  // Combined observable that debounces and deduplicates filter/pagination changes
  public filtersAndPagination$: Observable<[DashboardFilters, PaginationState]> = combineLatest([
    this.filters$,
    this.pagination$
  ]).pipe(
    debounceTime(100), // Small debounce to handle rapid updates
    distinctUntilChanged((prev, curr) => 
      JSON.stringify(prev) === JSON.stringify(curr)
    )
  );

  // Cached data
  private brokersCache: Broker[] = [];
  private brokersSubject = new BehaviorSubject<Broker[]>([]);
  public brokers$: Observable<Broker[]> = this.brokersSubject.asObservable();
  private loadingTimeout: any;
  
  // Filtered trips for payment summary calculation
  private filteredTripsSubject = new BehaviorSubject<Trip[]>([]);
  public filteredTrips$: Observable<Trip[]> = this.filteredTripsSubject.asObservable();

  // Trigger for refreshing payment summary after data mutations (delete, create, update)
  private refreshPaymentSummarySubject = new Subject<void>();
  public refreshPaymentSummary$: Observable<void> = this.refreshPaymentSummarySubject.asObservable();

  constructor(
    private tripService: TripService,
    private authService: AuthService,
    private sharedFilterService: SharedFilterService
  ) {
    // Register this service with SharedFilterService so it can notify us of filter changes
    this.sharedFilterService.setDashboardStateService(this);
    this.loadBrokers();
    this.setupLogoutListener();
  }

  updateFilters(filters: Partial<DashboardFilters>): void {
    const currentFilters = this.filtersSubject.value;
    const newFilters = { ...currentFilters, ...filters };
    this.filtersSubject.next(newFilters);
    this.saveFiltersToStorage(newFilters);
    
    // Reset to page 0 and clear pagination tokens when filters change
    const newPagination = { page: 0, pageSize: this.paginationSubject.value.pageSize, pageTokens: [] };
    this.paginationSubject.next(newPagination);
    this.savePaginationToStorage(newPagination);
    
    // Show filter update loading state with simple message
    this.setLoadingState(true, false, true);
    this.clearError();
  }

  updatePagination(pagination: Partial<PaginationState>): void {
    const currentPagination = this.paginationSubject.value;
    
    // If page size changed, reset to page 0 and clear pagination tokens
    if (pagination.pageSize !== undefined && pagination.pageSize !== currentPagination.pageSize) {
      const newPagination = {
        ...currentPagination,
        ...pagination,
        page: 0,
        pageTokens: [],
        lastEvaluatedKey: undefined
      };
      this.paginationSubject.next(newPagination);
      this.savePaginationToStorage(newPagination);
    } else {
      const newPagination = { ...currentPagination, ...pagination };
      this.paginationSubject.next(newPagination);
      this.savePaginationToStorage(newPagination);
    }
  }

  clearFilters(): void {
    const defaultFilters = this.getDefaultFilters();
    const defaultPagination = { page: 0, pageSize: 10, pageTokens: [] };
    
    this.filtersSubject.next(defaultFilters);
    this.paginationSubject.next(defaultPagination);
    
    this.saveFiltersToStorage(defaultFilters);
    this.savePaginationToStorage(defaultPagination);
  }

  getActiveFilterCount(): number {
    const filters = this.filtersSubject.value;
    let count = 0;
    if (filters.dateRange.startDate || filters.dateRange.endDate) count++;
    if (filters.status) count++;
    if (filters.brokerId) count++;
    if (filters.lorryId) count++;
    if (filters.driverId || filters.driverName) count++;
    return count;
  }

  getBrokers(): Broker[] {
    return this.brokersCache;
  }

  getCurrentFilters(): DashboardFilters {
    return this.filtersSubject.value;
  }

  updateFilteredTrips(trips: Trip[]): void {
    this.filteredTripsSubject.next(trips);
  }

  /**
   * Trigger payment summary refresh after data mutations (delete, create, update)
   */
  triggerPaymentSummaryRefresh(): void {
    this.refreshPaymentSummarySubject.next();
  }

  private getDefaultFilters(): DashboardFilters {
    // Set default date range to last 30 days
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999); // End of today
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0); // Start of day 30 days ago
    
    return {
      dateRange: { startDate, endDate },
      status: null,
      brokerId: null,
      lorryId: null,
      driverId: null,
      driverName: null
    };
  }

  setLoadingState(isLoading: boolean, isInitialLoad: boolean = false, isFilterUpdate: boolean = false, message?: string): void {
    // When turning off loading, preserve the existing message if no new message provided
    const loadingMessage = message !== undefined ? message : (isLoading ? 'Loading...' : this.loadingSubject.value.loadingMessage);
    
    // Clear any existing timeout when state changes
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
    
    this.loadingSubject.next({
      isLoading,
      isInitialLoad,
      isFilterUpdate,
      loadingMessage
    });

    // Set timeout for error handling if loading takes too long
    if (isLoading) {
      this.loadingTimeout = setTimeout(() => {
        if (this.loadingSubject.value.isLoading) {
          this.setError('Loading is taking longer than expected. Please check your connection and try again.', true);
          this.setLoadingState(false);
        }
      }, 30000); // 30 second timeout for large datasets
    }
  }

  setError(message: string, canRetry: boolean = true): void {
    const currentError = this.errorSubject.value;
    this.errorSubject.next({
      hasError: true,
      errorMessage: message,
      canRetry,
      retryCount: currentError.retryCount + 1
    });
  }

  clearError(): void {
    this.errorSubject.next({
      hasError: false,
      errorMessage: '',
      canRetry: false,
      retryCount: 0
    });
  }

  startInitialLoad(): void {
    this.setLoadingState(true, true, false, 'Loading dashboard...');
    this.clearError();
  }

  completeLoad(): void {
    this.setLoadingState(false);
  }

  private loadBrokers(): void {
    console.log('Loading brokers from API...');
    this.tripService.getBrokers().subscribe({
      next: (brokers) => {
        console.log('Brokers loaded from API:', brokers);
        this.brokersCache = brokers.filter(b => b.isActive);
        this.brokersSubject.next(this.brokersCache);
        console.log('Active brokers cached:', this.brokersCache);
      },
      error: (error) => {
        console.error('Failed to load brokers:', error);
        // Emit empty array on error so subscribers still get notified
        this.brokersSubject.next([]);
      }
    });
  }

  private setupLogoutListener(): void {
    this.authService.currentUser$.subscribe(user => {
      if (!user) {
        // User logged out, clear session storage
        this.clearSessionStorage();
      }
    });
  }

  private loadFiltersFromStorage(): DashboardFilters {
    // Always start fresh - don't load from storage
    // This ensures hard refresh clears all filters
    return this.getDefaultFilters();
    
    /* Original code that persisted filters:
    try {
      const stored = sessionStorage.getItem(this.FILTERS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert date strings back to Date objects
        if (parsed.dateRange) {
          if (parsed.dateRange.startDate) {
            parsed.dateRange.startDate = new Date(parsed.dateRange.startDate);
          }
          if (parsed.dateRange.endDate) {
            parsed.dateRange.endDate = new Date(parsed.dateRange.endDate);
          }
        }
        return { ...this.getDefaultFilters(), ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load filters from session storage:', error);
    }
    return this.getDefaultFilters();
    */
  }

  private saveFiltersToStorage(filters: DashboardFilters): void {
    try {
      sessionStorage.setItem(this.FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch (error) {
      console.warn('Failed to save filters to session storage:', error);
    }
  }

  private loadPaginationFromStorage(): PaginationState {
    // Always start fresh - don't load from storage
    // This ensures hard refresh resets pagination
    return { page: 0, pageSize: 10, pageTokens: [] };
    
    /* Original code that persisted pagination:
    try {
      const stored = sessionStorage.getItem(this.PAGINATION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Always reset to page 0 on load to avoid showing stale page numbers
        return { page: 0, pageSize: parsed.pageSize || 10, pageTokens: [] };
      }
    } catch (error) {
      console.warn('Failed to load pagination from session storage:', error);
    }
    return { page: 0, pageSize: 10, pageTokens: [] };
    */
  }

  private savePaginationToStorage(pagination: PaginationState): void {
    try {
      sessionStorage.setItem(this.PAGINATION_STORAGE_KEY, JSON.stringify(pagination));
    } catch (error) {
      console.warn('Failed to save pagination to session storage:', error);
    }
  }

  private clearSessionStorage(): void {
    try {
      sessionStorage.removeItem(this.FILTERS_STORAGE_KEY);
      sessionStorage.removeItem(this.PAGINATION_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear session storage:', error);
    }
  }
}
