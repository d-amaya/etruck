import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FilterBarComponent } from './filter-bar/filter-bar.component';
import { TripSummaryCardsComponent } from './trip-summary-cards/trip-summary-cards.component';
import { PaymentSummaryComponent } from './payment-summary/payment-summary.component';
import { DashboardChartsComponent } from './dashboard-charts/dashboard-charts.component';
import { TripTableComponent } from './trip-table/trip-table.component';
import { DashboardStateService, LoadingState, ErrorState } from './dashboard-state.service';
import { TripSummarySkeletonComponent } from '../../../shared/components/skeleton-loader/trip-summary-skeleton.component';
import { PaymentSummarySkeletonComponent } from '../../../shared/components/skeleton-loader/payment-summary-skeleton.component';
import { DashboardChartsSkeletonComponent } from '../../../shared/components/skeleton-loader/dashboard-charts-skeleton.component';
import { TripTableSkeletonComponent } from '../../../shared/components/skeleton-loader/trip-table-skeleton.component';
import { LoadingOverlayComponent } from '../../../shared/components/loading-overlay/loading-overlay.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';

@Component({
  selector: 'app-dispatcher-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    FilterBarComponent,
    TripSummaryCardsComponent,
    PaymentSummaryComponent,
    DashboardChartsComponent,
    TripTableComponent,
    TripSummarySkeletonComponent,
    PaymentSummarySkeletonComponent,
    DashboardChartsSkeletonComponent,
    TripTableSkeletonComponent,
    LoadingOverlayComponent,
    ErrorStateComponent
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
  
  private destroy$ = new Subject<void>();

  constructor(private dashboardState: DashboardStateService) {}

  ngOnInit(): void {
    // Start initial load
    this.dashboardState.startInitialLoad();
    
    // Subscribe to loading state
    this.dashboardState.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loadingState => {
        this.loadingState = loadingState;
      });
    
    // Subscribe to error state
    this.dashboardState.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(errorState => {
        this.errorState = errorState;
      });
    
    // Simulate initial load completion after components are ready
    setTimeout(() => {
      this.dashboardState.completeLoad();
    }, 1500);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  onRetry(): void {
    this.dashboardState.clearError();
    this.dashboardState.startInitialLoad();
    
    // Simulate retry
    setTimeout(() => {
      this.dashboardState.completeLoad();
    }, 1500);
  }
}
