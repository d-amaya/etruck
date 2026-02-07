import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CarrierDashboardStateService } from './carrier-dashboard-state.service';

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

  constructor(private dashboardState: CarrierDashboardStateService) {}

  private getDefaultStartDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() - 30); // Last 30 days
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private getDefaultEndDate(): Date {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date;
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

  setPreset(preset: 'week' | 'month' | 'quarter' | 'year'): void {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let startDate: Date;

    switch (preset) {
      case 'week':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'quarter':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 90);
        break;
      case 'year':
        startDate = new Date(today);
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    startDate.setHours(0, 0, 0, 0);
    this.updateDateFilter(startDate, today);
  }

  clearFilter(): void {
    this.updateDateFilter(null, null);
  }
}
