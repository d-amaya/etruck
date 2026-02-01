import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { TripStatus } from '@haulhub/shared';
import { DashboardStateService } from './dashboard-state.service';

export interface DashboardFilters {
  dateRange: {
    startDate: Date | null;
    endDate: Date | null;
  };
  status: TripStatus | null;
  brokerId: string | null;
  truckId: string | null;
  driverName: string | null;
  driverId: string | null;
}

export type ViewMode = 'table' | 'analytics' | 'payments';

/**
 * Shared filter service for unified dashboard
 * Manages filter state across all view modes
 */
@Injectable({
  providedIn: 'root'
})
export class SharedFilterService {
  private defaultFilters: DashboardFilters = {
    dateRange: {
      startDate: this.getDefaultStartDate(),
      endDate: this.getDefaultEndDate()
    },
    status: null,
    brokerId: null,
    truckId: null,
    driverName: null,
    driverId: null
  };

  private filtersSubject = new BehaviorSubject<DashboardFilters>(this.defaultFilters);
  private viewModeSubject = new BehaviorSubject<ViewMode>('table');

  public filters$: Observable<DashboardFilters> = this.filtersSubject.asObservable();
  public viewMode$: Observable<ViewMode> = this.viewModeSubject.asObservable();

  private dashboardStateService?: DashboardStateService;

  constructor() {}

  /**
   * Set the dashboard state service reference (called by DashboardStateService)
   */
  setDashboardStateService(service: DashboardStateService): void {
    this.dashboardStateService = service;
  }

  /**
   * Get default start date (30 days ago)
   */
  private getDefaultStartDate(): Date {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);
    return startDate;
  }

  /**
   * Get default end date (today)
   */
  private getDefaultEndDate(): Date {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return today;
  }

  /**
   * Get current filters
   */
  getCurrentFilters(): DashboardFilters {
    return this.filtersSubject.value;
  }

  /**
   * Update filters
   */
  updateFilters(filters: Partial<DashboardFilters>, force: boolean = false): void {
    const currentFilters = this.filtersSubject.value;
    const newFilters = {
      ...currentFilters,
      ...filters
    };
    
    // Check if filters actually changed to avoid unnecessary updates
    // Skip check if force is true (e.g., when user clicks preset buttons)
    if (!force && this.filtersEqual(currentFilters, newFilters)) {
      return;
    }
    
    this.filtersSubject.next(newFilters);
    
    // Notify DashboardStateService to update its filters and reset pagination
    if (this.dashboardStateService) {
      this.dashboardStateService.updateFilters({
        dateRange: filters.dateRange || currentFilters.dateRange,
        status: filters.status !== undefined ? filters.status : currentFilters.status,
        brokerId: filters.brokerId !== undefined ? filters.brokerId : currentFilters.brokerId,
        truckId: filters.truckId !== undefined ? filters.truckId : currentFilters.truckId,
        driverName: filters.driverName !== undefined ? filters.driverName : currentFilters.driverName,
        driverId: filters.driverId !== undefined ? filters.driverId : currentFilters.driverId
      });
    }
  }

  /**
   * Check if two filter objects are equal
   */
  private filtersEqual(filters1: DashboardFilters, filters2: DashboardFilters): boolean {
    // Compare date ranges
    const date1Start = filters1.dateRange.startDate?.getTime();
    const date2Start = filters2.dateRange.startDate?.getTime();
    const date1End = filters1.dateRange.endDate?.getTime();
    const date2End = filters2.dateRange.endDate?.getTime();
    
    if (date1Start !== date2Start || date1End !== date2End) {
      return false;
    }
    
    // Compare other filters
    return filters1.status === filters2.status &&
           filters1.brokerId === filters2.brokerId &&
           filters1.truckId === filters2.truckId &&
           filters1.driverName === filters2.driverName &&
           filters1.driverId === filters2.driverId;
  }

  /**
   * Reset filters to default
   */
  resetFilters(): void {
    const newFilters = {
      ...this.defaultFilters,
      dateRange: {
        startDate: this.getDefaultStartDate(),
        endDate: this.getDefaultEndDate()
      }
    };
    this.filtersSubject.next(newFilters);
    
    // Notify DashboardStateService to clear filters and reset pagination
    if (this.dashboardStateService) {
      this.dashboardStateService.clearFilters();
    }
  }

  /**
   * Get active filter count
   */
  getActiveFilterCount(): number {
    const filters = this.filtersSubject.value;
    let count = 0;

    if (filters.status) count++;
    if (filters.brokerId) count++;
    if (filters.truckId) count++;
    if (filters.driverName) count++;
    if (filters.driverId) count++;

    return count;
  }

  /**
   * Get current view mode
   */
  getCurrentViewMode(): ViewMode {
    return this.viewModeSubject.value;
  }

  /**
   * Set view mode
   */
  setViewMode(mode: ViewMode): void {
    this.viewModeSubject.next(mode);
  }
}
