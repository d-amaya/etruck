import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { OrderStatus } from '@haulhub/shared';
import { AdminDashboardStateService, AdminDashboardFilters } from './admin-state.service';

export type ViewMode = 'table' | 'analytics' | 'payments';

@Injectable({ providedIn: 'root' })
export class AdminFilterService {
  private defaultFilters: AdminDashboardFilters = {
    dateRange: { startDate: this.getDefaultStartDate(), endDate: this.getDefaultEndDate() },
    status: null, brokerId: null, dispatcherId: null
  };

  private filtersSubject = new BehaviorSubject<AdminDashboardFilters>(this.defaultFilters);
  private viewModeSubject = new BehaviorSubject<ViewMode>('table');

  public filters$ = this.filtersSubject.asObservable();
  public viewMode$ = this.viewModeSubject.asObservable();

  private stateService?: AdminDashboardStateService;

  setStateService(service: AdminDashboardStateService): void { this.stateService = service; }

  private getDefaultStartDate(): Date {
    const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1, 0, 0, 0, 0);
  }
  private getDefaultEndDate(): Date {
    const t = new Date(); const e = new Date(t.getFullYear(), t.getMonth() + 1, 0); e.setHours(23, 59, 59, 999); return e;
  }

  getCurrentFilters(): AdminDashboardFilters { return this.filtersSubject.value; }

  updateFilters(filters: Partial<AdminDashboardFilters>, force = false): void {
    const current = this.filtersSubject.value;
    const merged = { ...current, ...filters };
    if (!force && JSON.stringify(current) === JSON.stringify(merged)) return;
    this.filtersSubject.next(merged);
    if (this.stateService) this.stateService.updateFilters(merged);
  }

  resetFilters(): void {
    const fresh = { ...this.defaultFilters, dateRange: { startDate: this.getDefaultStartDate(), endDate: this.getDefaultEndDate() } };
    this.filtersSubject.next(fresh);
    if (this.stateService) this.stateService.clearFilters();
  }

  getActiveFilterCount(): number {
    const f = this.filtersSubject.value;
    let c = 0;
    if (f.status) c++;
    if (f.brokerId) c++;
    if (f.dispatcherId) c++;
    return c;
  }

  getCurrentViewMode(): ViewMode { return this.viewModeSubject.value; }
  setViewMode(mode: ViewMode): void { this.viewModeSubject.next(mode); }
}
