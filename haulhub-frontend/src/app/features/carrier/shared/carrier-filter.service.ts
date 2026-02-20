import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CarrierDashboardStateService } from './carrier-dashboard-state.service';
import { CarrierDashboardFilters, PaginationState } from './carrier-dashboard-state.service';

export type ViewMode = 'table' | 'analytics' | 'payments';

export interface CarrierDateFilter {
  startDate: Date | null;
  endDate: Date | null;
}

@Injectable({
  providedIn: 'root'
})
export class CarrierFilterService {
  private dateFilterSubject = new BehaviorSubject<CarrierDateFilter>({
    startDate: this.getDefaultStartDate(),
    endDate: this.getDefaultEndDate()
  });

  private viewModeSubject = new BehaviorSubject<ViewMode>('table');

  dateFilter$: Observable<CarrierDateFilter> = this.dateFilterSubject.asObservable();
  viewMode$: Observable<ViewMode> = this.viewModeSubject.asObservable();
  activePreset: string | null = 'currentMonth';

  // Response caches with 5-minute TTL
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private analyticsCache: { data: any; startTime: number | null; endTime: number | null; fetchedAt: number } | null = null;
  private paymentCache: { data: any; startTime: number | null; endTime: number | null; fetchedAt: number } | null = null;
  private tripsCache: { data: any; key: string; fetchedAt: number } | null = null;

  constructor(private dashboardState: CarrierDashboardStateService) {}

  private getDefaultStartDate(): Date {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private getDefaultEndDate(): Date {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  getCurrentFilter(): CarrierDateFilter {
    return this.dateFilterSubject.value;
  }

  getCurrentViewMode(): ViewMode {
    return this.viewModeSubject.value;
  }

  setViewMode(mode: ViewMode): void {
    this.viewModeSubject.next(mode);
  }

  updateDateFilter(startDate: Date | null, endDate: Date | null): void {
    this.dateFilterSubject.next({ startDate, endDate });
    this.dashboardState.updateFilters({ dateRange: { startDate, endDate } });
  }

  setPreset(preset: 'lastMonth' | 'currentWeek' | 'currentMonth'): void {
    const today = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (preset) {
      case 'lastMonth':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'currentWeek':
        startDate = new Date(today);
        const day = startDate.getDay();
        const diff = day === 0 ? 6 : day - 1;
        startDate.setDate(startDate.getDate() - diff);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'currentMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
    }

    this.updateDateFilter(startDate, endDate);
  }

  clearFilter(): void {
    this.updateDateFilter(null, null);
  }

  // --- View response caching (5-min TTL) ---

  private dateKey(d: Date | null): number | null {
    return d ? d.getTime() : null;
  }

  private isCacheValid(cache: { startTime: number | null; endTime: number | null; fetchedAt: number }, start: Date | null, end: Date | null): boolean {
    return cache.startTime === this.dateKey(start) &&
           cache.endTime === this.dateKey(end) &&
           (Date.now() - cache.fetchedAt) < this.CACHE_TTL_MS;
  }

  getCachedAnalytics(start: Date | null, end: Date | null): any | null {
    return this.analyticsCache && this.isCacheValid(this.analyticsCache, start, end) ? this.analyticsCache.data : null;
  }

  setCachedAnalytics(start: Date | null, end: Date | null, data: any): void {
    this.analyticsCache = { data, startTime: this.dateKey(start), endTime: this.dateKey(end), fetchedAt: Date.now() };
  }

  getCachedPaymentReport(start: Date | null, end: Date | null): any | null {
    return this.paymentCache && this.isCacheValid(this.paymentCache, start, end) ? this.paymentCache.data : null;
  }

  setCachedPaymentReport(start: Date | null, end: Date | null, data: any): void {
    this.paymentCache = { data, startTime: this.dateKey(start), endTime: this.dateKey(end), fetchedAt: Date.now() };
  }

  getCachedTrips(filters: CarrierDashboardFilters, pagination: PaginationState): any | null {
    if (!this.tripsCache) return null;
    const key = JSON.stringify({
      s: filters.dateRange.startDate?.getTime(), e: filters.dateRange.endDate?.getTime(),
      st: filters.status, t: filters.truckId,
      d: filters.driverId, di: filters.dispatcherId,
      p: pagination.page, ps: pagination.pageSize
    });
    return this.tripsCache.key === key && (Date.now() - this.tripsCache.fetchedAt) < this.CACHE_TTL_MS
      ? this.tripsCache.data : null;
  }

  setCachedTrips(filters: CarrierDashboardFilters, pagination: PaginationState, data: any): void {
    const key = JSON.stringify({
      s: filters.dateRange.startDate?.getTime(), e: filters.dateRange.endDate?.getTime(),
      st: filters.status, t: filters.truckId,
      d: filters.driverId, di: filters.dispatcherId,
      p: pagination.page, ps: pagination.pageSize
    });
    this.tripsCache = { data, key, fetchedAt: Date.now() };
  }

  invalidateViewCaches(): void {
    this.analyticsCache = null;
    this.paymentCache = null;
    this.tripsCache = null;
  }
}
