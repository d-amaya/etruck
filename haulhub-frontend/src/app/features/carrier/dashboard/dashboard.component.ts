import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CarrierService, DashboardResponse } from '../../../core/services/carrier.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingOverlayComponent } from '../../../shared/components/loading-overlay/loading-overlay.component';
import { CarrierUnifiedFilterCardComponent } from '../shared/unified-filter-card/unified-filter-card.component';
import { CarrierFilterService, ViewMode } from '../shared/carrier-filter.service';
import { CarrierTripTableComponent } from './carrier-trip-table/carrier-trip-table.component';
import { CarrierAnalyticsWrapperComponent } from './carrier-analytics-wrapper/carrier-analytics-wrapper.component';
import { CarrierPaymentsWrapperComponent } from './carrier-payments-wrapper/carrier-payments-wrapper.component';

@Component({
  selector: 'app-carrier-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    LoadingOverlayComponent,
    CarrierUnifiedFilterCardComponent,
    CarrierTripTableComponent,
    CarrierAnalyticsWrapperComponent,
    CarrierPaymentsWrapperComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class CarrierDashboardComponent implements OnInit, OnDestroy {
  dashboardData: DashboardResponse | null = null;
  loading = false;
  error: string | null = null;
  currentViewMode: ViewMode = 'table';
  
  private destroy$ = new Subject<void>();

  constructor(
    private carrierService: CarrierService,
    private authService: AuthService,
    private filterService: CarrierFilterService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
    
    // Subscribe to date filter changes
    this.filterService.dateFilter$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadDashboard();
      });
    
    // Subscribe to view mode changes
    this.filterService.viewMode$
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

  async loadDashboard(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const filter = this.filterService.getCurrentFilter();
      const result = await this.carrierService.getDashboardMetrics(filter.startDate, filter.endDate).toPromise();
      this.dashboardData = result || null;
    } catch (err: any) {
      console.error('Error loading dashboard:', err);
      this.error = err.message || 'Failed to load dashboard data';
    } finally {
      this.loading = false;
    }
  }

  onRetry(): void {
    this.loadDashboard();
  }

  navigateToUsers(): void {
    this.router.navigate(['/carrier/users']);
  }

  navigateToAssets(): void {
    this.router.navigate(['/carrier/assets']);
  }

  navigateToTrips(): void {
    this.router.navigate(['/carrier/trips']);
  }

  navigateToAnalytics(): void {
    this.router.navigate(['/carrier/analytics']);
  }

  navigateToTripDetails(tripId: string): void {
    this.router.navigate(['/carrier/trips', tripId]);
  }

  get totalActiveUsers(): number {
    if (!this.dashboardData) return 0;
    const users = this.dashboardData.metrics.activeUsers;
    return users.dispatchers + users.drivers + users.truckOwners;
  }

  get totalActiveAssets(): number {
    if (!this.dashboardData) return 0;
    const assets = this.dashboardData.metrics.activeAssets;
    return assets.trucks + assets.trailers;
  }
}
