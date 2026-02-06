import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
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
    CarrierUnifiedFilterCardComponent,
    CarrierTripTableComponent,
    CarrierAnalyticsWrapperComponent,
    CarrierPaymentsWrapperComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class CarrierDashboardComponent implements OnInit, OnDestroy {
  currentViewMode: ViewMode = 'table';
  
  private destroy$ = new Subject<void>();

  constructor(
    private filterService: CarrierFilterService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Subscribe to view mode changes only
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

  onRetry(): void {
    // Trigger reload in child components by resetting filter
    const filter = this.filterService.getCurrentFilter();
    this.filterService.updateDateFilter(filter.startDate, filter.endDate);
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
}
