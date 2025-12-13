import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { distinctUntilChanged, debounceTime } from 'rxjs/operators';
import { TripStatus, Broker, Trip } from '@haulhub/shared';
import { TripService } from '../../../core/services/trip.service';
import { AuthService } from '../../../core/services/auth.service';

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
  public loading$: Observable<LoadingState> = this.loadingSubject.asObservable();
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
  private loadingTimeout: any;
  
  // Filtered trips for payment summary calculation
  private filteredTripsSubject = new BehaviorSubject<Trip[]>([]);
  public filteredTrips$: Observable<Trip[]> = this.filteredTripsSubject.asObservable();

  constructor(
    private tripService: TripService,
    private authService: AuthService
  ) {
    this.loadBrokers();
    this.setupLogoutListener();
  }

  updateFilters(filters: Partial<DashboardFilters>): void {
    const currentFilters = this.filtersSubject.value;
    const newFilters = { ...currentFilters, ...filters };
    this.filtersSubject.next(newFilters);
    this.saveFiltersToStorage(newFilters);
    
    // Reset to page 0 when filters change
    const newPagination = { ...this.paginationSubject.value, page: 0 };
    this.paginationSubject.next(newPagination);
    this.savePaginationToStorage(newPagination);
    
    // Show filter update loading state
    this.setLoadingState(true, false, true, 'Updating filters...');
    this.clearError();
  }

  updatePagination(pagination: Partial<PaginationState>): void {
    const currentPagination = this.paginationSubject.value;
    const newPagination = { ...currentPagination, ...pagination };
    this.paginationSubject.next(newPagination);
    this.savePaginationToStorage(newPagination);
  }

  clearFilters(): void {
    const defaultFilters = this.getDefaultFilters();
    const defaultPagination = { page: 0, pageSize: 10 };
    
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

  private getDefaultFilters(): DashboardFilters {
    // Set default date range to last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    return {
      dateRange: { startDate, endDate },
      status: null,
      brokerId: null,
      lorryId: null,
      driverId: null,
      driverName: null
    };
  }

  setLoadingState(isLoading: boolean, isInitialLoad: boolean = false, isFilterUpdate: boolean = false, message: string = 'Loading...'): void {
    this.loadingSubject.next({
      isLoading,
      isInitialLoad,
      isFilterUpdate,
      loadingMessage: message
    });

    // Set timeout for error handling if loading takes too long
    if (isLoading) {
      this.loadingTimeout = setTimeout(() => {
        if (this.loadingSubject.value.isLoading) {
          this.setError('Loading is taking longer than expected. Please check your connection and try again.', true);
          this.setLoadingState(false);
        }
      }, 10000); // 10 second timeout
    } else {
      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
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
    this.tripService.getBrokers().subscribe({
      next: (brokers) => {
        this.brokersCache = brokers.filter(b => b.isActive);
      },
      error: (error) => {
        console.error('Failed to load brokers:', error);
        // Don't show error for broker loading as it's not critical
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
  }

  private saveFiltersToStorage(filters: DashboardFilters): void {
    try {
      sessionStorage.setItem(this.FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch (error) {
      console.warn('Failed to save filters to session storage:', error);
    }
  }

  private loadPaginationFromStorage(): PaginationState {
    try {
      const stored = sessionStorage.getItem(this.PAGINATION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { page: 0, pageSize: 10, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load pagination from session storage:', error);
    }
    return { page: 0, pageSize: 10 };
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
