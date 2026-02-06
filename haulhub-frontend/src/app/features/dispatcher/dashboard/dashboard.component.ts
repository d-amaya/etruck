import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UnifiedFilterCardComponent } from './unified-filter-card/unified-filter-card.component';
import { TripTableComponent } from './trip-table/trip-table.component';
import { DashboardStateService, LoadingState, ErrorState } from './dashboard-state.service';
import { SharedFilterService, ViewMode } from './shared-filter.service';
import { TripTableSkeletonComponent } from '../../../shared/components/skeleton-loader/trip-table-skeleton.component';
import { LoadingOverlayComponent } from '../../../shared/components/loading-overlay/loading-overlay.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { AnalyticsWrapperComponent } from './analytics-wrapper/analytics-wrapper.component';
import { PaymentsWrapperComponent } from './payments-wrapper/payments-wrapper.component';

@Component({
  selector: 'app-dispatcher-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    UnifiedFilterCardComponent,
    TripTableComponent,
    TripTableSkeletonComponent,
    LoadingOverlayComponent,
    ErrorStateComponent,
    AnalyticsWrapperComponent,
    PaymentsWrapperComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  loadingState: LoadingState = {
    isLoading: false,
    isInitialLoad: false,
    isFilterUpdate: false,
    loadingMessage: 'Loading...'
  };
  errorState: ErrorState = {
    hasError: false,
    errorMessage: '',
    canRetry: false,
    retryCount: 0
  };
  
  currentViewMode: ViewMode = 'table';
  
  private destroy$ = new Subject<void>();

  constructor(
    private dashboardState: DashboardStateService,
    private sharedFilterService: SharedFilterService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Subscribe to loading state
    this.dashboardState.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loadingState => {
        this.loadingState = loadingState;
        this.cdr.detectChanges();
      });
    
    // Subscribe to error state
    this.dashboardState.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(errorState => {
        this.errorState = errorState;
        this.cdr.detectChanges();
      });
    
    // Subscribe to view mode changes
    this.sharedFilterService.viewMode$
      .pipe(takeUntil(this.destroy$))
      .subscribe(mode => {
        this.currentViewMode = mode;
        this.cdr.detectChanges();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  onRetry(): void {
    this.dashboardState.clearError();
  }

  onCreateTrip(): void {
    this.router.navigate(['/dispatcher/trips/create']);
  }
}
