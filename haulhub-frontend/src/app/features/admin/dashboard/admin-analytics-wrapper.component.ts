import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SharedFilterService } from '../../dispatcher/dashboard/shared-filter.service';
import { AdminFilterService } from './admin-filter.service';
import { AnalyticsDashboardComponent } from '../../dispatcher/analytics-dashboard/analytics-dashboard.component';

@Component({
  selector: 'app-admin-analytics-wrapper',
  standalone: true,
  imports: [CommonModule, AnalyticsDashboardComponent],
  template: `
    <div class="analytics-wrapper">
      <app-analytics-dashboard [isWrapped]="true"></app-analytics-dashboard>
    </div>
  `,
  styles: [`
    .analytics-wrapper {
      width: 100%;
      ::ng-deep app-analytics-dashboard {
        .page-header { display: none !important; }
        .loading-container { display: none !important; }
        .error-container { display: none !important; }
      }
    }
  `]
})
export class AdminAnalyticsWrapperComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(
    private adminFilterService: AdminFilterService,
    private sharedFilterService: SharedFilterService
  ) {}

  ngOnInit(): void {
    // Sync admin date range into dispatcher's SharedFilterService
    // so the wrapped AnalyticsDashboardComponent picks it up
    const filters = this.adminFilterService.getCurrentFilters();
    this.sharedFilterService.updateFilters({
      dateRange: filters.dateRange,
      status: null, brokerId: null, truckId: null, driverId: null, carrierId: null
    }, true);

    this.adminFilterService.filters$.pipe(takeUntil(this.destroy$)).subscribe(f => {
      this.sharedFilterService.updateFilters({ dateRange: f.dateRange }, true);
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
