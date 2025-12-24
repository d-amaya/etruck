import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TripService, PaymentSummary } from '../../../../core/services/trip.service';
import { DashboardStateService } from '../dashboard-state.service';
import { SharedFilterService } from '../shared-filter.service';

@Component({
  selector: 'app-payment-summary',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule],
  templateUrl: './payment-summary.component.html',
  styleUrls: ['./payment-summary.component.scss']
})
export class PaymentSummaryComponent implements OnInit, OnDestroy {
  paymentSummary: PaymentSummary = {
    totalBrokerPayments: 0,
    totalDriverPayments: 0,
    totalLorryOwnerPayments: 0,
    totalProfit: 0
  };
  hasError = false;

  private destroy$ = new Subject<void>();

  constructor(
    private tripService: TripService,
    private dashboardState: DashboardStateService,
    private sharedFilterService: SharedFilterService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Subscribe to shared filter changes (same as analytics and payment-report)
    this.sharedFilterService.filters$
      .pipe(takeUntil(this.destroy$))
      .subscribe(filters => {
        this.loadPaymentSummary(filters);
      });

    // Subscribe to refresh triggers (after deletions, etc.)
    this.dashboardState.refreshPaymentSummary$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const filters = this.sharedFilterService.getCurrentFilters();
        this.loadPaymentSummary(filters);
      });
  }

  private loadPaymentSummary(filters: any): void {
    const apiFilters = this.buildApiFilters(filters);
    
    console.log('[PaymentSummaryComponent] Loading payment summary with filters:', apiFilters);
    
    this.tripService.getPaymentSummary(apiFilters).subscribe({
      next: (summary) => {
        console.log('[PaymentSummaryComponent] Received payment summary:', summary);
        this.paymentSummary = summary;
        this.hasError = false;
      },
      error: (error) => {
        // Ignore cancellation errors (they're expected when filters change rapidly)
        if (error.name === 'AbortError' || error.status === 0) {
          return;
        }
        console.error('[PaymentSummaryComponent] Error loading payment summary:', error);
        this.handleError(error);
      }
    });
  }

  private buildApiFilters(filters: any): any {
    const apiFilters: any = {};

    if (filters.dateRange?.startDate) {
      apiFilters.startDate = filters.dateRange.startDate.toISOString();
    }
    if (filters.dateRange?.endDate) {
      apiFilters.endDate = filters.dateRange.endDate.toISOString();
    }
    if (filters.status) {
      apiFilters.status = filters.status;
    }
    if (filters.brokerId) {
      apiFilters.brokerId = filters.brokerId;
    }
    if (filters.lorryId) {
      apiFilters.lorryId = filters.lorryId;
    }
    if (filters.driverName) {
      apiFilters.driverName = filters.driverName;
    }

    return apiFilters;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }



  get isProfitPositive(): boolean {
    return this.paymentSummary.totalProfit >= 0;
  }

  get profitClass(): string {
    return this.isProfitPositive ? 'profit-positive' : 'profit-negative';
  }

  private handleError(error: any): void {
    this.hasError = true;
    let errorMessage = 'Failed to load payment summary';
    
    if (error?.status === 0) {
      errorMessage = 'Network connection error. Please check your internet connection.';
    } else if (error?.status >= 500) {
      errorMessage = 'Server error. Please try again later.';
    } else if (error?.status === 401) {
      errorMessage = 'Session expired. Please log in again.';
    } else if (error?.error?.message) {
      errorMessage = error.error.message;
    }

    this.snackBar.open(errorMessage, 'Dismiss', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }

  retryLoad(): void {
    this.hasError = false;
    // The payment summary will automatically recalculate when filtered trips are updated
  }
}
