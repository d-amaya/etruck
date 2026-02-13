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
  activePreset: string | null = 'currentWeek';

  constructor(private dashboardState: CarrierDashboardStateService) {}

  private getDefaultStartDate(): Date {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(today);
    monday.setDate(monday.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  private getDefaultEndDate(): Date {
    const start = this.getDefaultStartDate();
    const sunday = new Date(start);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return sunday;
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
}
