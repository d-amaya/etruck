import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { distinctUntilChanged, debounceTime } from 'rxjs/operators';
import { OrderStatus } from '@haulhub/shared';

export interface CarrierDashboardFilters {
  dateRange: {
    startDate: Date | null;
    endDate: Date | null;
  };
  status: OrderStatus | null;
  truckId: string | null;
  driverId: string | null;
  dispatcherId: string | null;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  pageTokens: string[];
}

const defaultFilters: CarrierDashboardFilters = {
  dateRange: {
    startDate: (() => { const today = new Date(); const day = today.getDay(); const diff = day === 0 ? 6 : day - 1; const d = new Date(today); d.setDate(d.getDate() - diff); d.setHours(0, 0, 0, 0); return d; })(),
    endDate: (() => { const today = new Date(); const day = today.getDay(); const diff = day === 0 ? 6 : day - 1; const d = new Date(today); d.setDate(d.getDate() - diff + 6); d.setHours(23, 59, 59, 999); return d; })(),
  },
  status: null,
  truckId: null,
  driverId: null,
  dispatcherId: null,
};

const defaultPagination: PaginationState = {
  page: 0,
  pageSize: 10,
  pageTokens: [],
};

@Injectable({ providedIn: 'root' })
export class CarrierDashboardStateService {
  private filtersSubject = new BehaviorSubject<CarrierDashboardFilters>(defaultFilters);
  private paginationSubject = new BehaviorSubject<PaginationState>(defaultPagination);

  public filters$ = this.filtersSubject.asObservable();
  public pagination$ = this.paginationSubject.asObservable();

  public filtersAndPagination$: Observable<[CarrierDashboardFilters, PaginationState]> = 
    combineLatest([this.filters$, this.pagination$]).pipe(
      debounceTime(200),
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr))
    );

  updateFilters(filters: Partial<CarrierDashboardFilters>): void {
    this.filtersSubject.next({ ...this.filtersSubject.value, ...filters });
    this.paginationSubject.next({ ...defaultPagination });
  }

  updatePagination(pagination: Partial<PaginationState>): void {
    const current = this.paginationSubject.value;
    if (pagination.pageSize !== undefined && pagination.pageSize !== current.pageSize) {
      this.paginationSubject.next({ ...current, ...pagination, page: 0, pageTokens: [] });
    } else {
      this.paginationSubject.next({ ...current, ...pagination });
    }
  }

  updatePaginationSilent(pagination: Partial<PaginationState>): void {
    const current = this.paginationSubject.value;
    (this.paginationSubject as any)._value = { ...current, ...pagination };
  }

  getCurrentFilters(): CarrierDashboardFilters { return this.filtersSubject.value; }
  getCurrentPagination(): PaginationState { return this.paginationSubject.value; }

  resetFilters(): void {
    this.filtersSubject.next(defaultFilters);
    this.paginationSubject.next(defaultPagination);
  }
}
