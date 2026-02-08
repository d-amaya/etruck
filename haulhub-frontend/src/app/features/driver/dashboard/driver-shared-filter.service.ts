import { Injectable } from '@angular/core';
import { DriverDashboardStateService, DriverDashboardFilters } from './driver-dashboard-state.service';

@Injectable({
  providedIn: 'root'
})
export class DriverSharedFilterService {
  constructor(private dashboardState: DriverDashboardStateService) {}

  updateFilters(filters: Partial<DriverDashboardFilters>): void {
    this.dashboardState.updateFilters(filters);
  }

  getCurrentFilters(): DriverDashboardFilters {
    return this.dashboardState.getCurrentFilters();
  }

  resetFilters(): void {
    const today = new Date();
    const lastYear = new Date(today);
    lastYear.setFullYear(today.getFullYear() - 1);
    
    this.dashboardState.updateFilters({
      dateRange: {
        startDate: lastYear,
        endDate: today
      },
      status: null,
      truckId: null,
      dispatcherId: null
    });
  }

  getActiveFilterCount(): number {
    const filters = this.getCurrentFilters();
    let count = 0;
    if (filters.status) count++;
    if (filters.truckId) count++;
    if (filters.dispatcherId) count++;
    return count;
  }
}
