import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SharedFilterService } from '../shared-filter.service';
import { AnalyticsDashboardComponent } from '../../analytics-dashboard/analytics-dashboard.component';

/**
 * Wrapper component for analytics dashboard
 * Integrates with shared filter service
 */
@Component({
  selector: 'app-analytics-wrapper',
  standalone: true,
  imports: [
    CommonModule,
    AnalyticsDashboardComponent
  ],
  template: `
    <div class="analytics-wrapper">
      <app-analytics-dashboard></app-analytics-dashboard>
    </div>
  `,
  styles: [`
    .analytics-wrapper {
      width: 100%;
      
      // Hide duplicate header, filters, and loading spinner
      ::ng-deep app-analytics-dashboard {
        .page-header {
          display: none !important;
        }
        
        .loading-container {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        
        .error-container {
          display: none !important;
        }
      }
    }
  `]
})
export class AnalyticsWrapperComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(private sharedFilterService: SharedFilterService) {}

  ngOnInit(): void {
    // Component automatically uses shared filters through service injection
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
