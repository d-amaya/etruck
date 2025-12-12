import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, switchMap, takeUntil, catchError, of, debounceTime } from 'rxjs';
import { TripStatus } from '@haulhub/shared';
import { TripService } from '../../../../core/services/trip.service';
import { DashboardStateService, DashboardFilters } from '../dashboard-state.service';
import { AccessibilityService } from '../../../../core/services/accessibility.service';

interface SummaryCard {
  status: TripStatus;
  label: string;
  count: number;
  color: string;
  icon: string;
}

interface TripFilters {
  startDate?: string;
  endDate?: string;
  status?: TripStatus;
  brokerId?: string;
  lorryId?: string;
  driverName?: string;
}

@Component({
  selector: 'app-trip-summary-cards',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule],
  templateUrl: './trip-summary-cards.component.html',
  styleUrls: ['./trip-summary-cards.component.scss']
})
export class TripSummaryCardsComponent implements OnInit, OnDestroy {
  summaryCards: SummaryCard[] = [];
  hasError = false;
  private destroy$ = new Subject<void>();

  constructor(
    private tripService: TripService,
    private dashboardState: DashboardStateService,
    private snackBar: MatSnackBar,
    private accessibilityService: AccessibilityService
  ) {}

  ngOnInit(): void {
    // Subscribe to filter changes and reload summary
    this.dashboardState.filters$
      .pipe(
        switchMap(filters => this.loadSummary(filters)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: summary => {
          this.hasError = false;
          this.updateSummaryCards(summary);
        },
        error: error => {
          this.handleError(error);
        }
      });
  }

  private loadSummary(filters: DashboardFilters) {
    return this.tripService.getTripSummaryByStatus(this.buildApiFilters(filters)).pipe(
      catchError(error => {
        // Ignore cancellation errors (they're expected when filters change rapidly)
        if (error.name === 'AbortError' || error.status === 0) {
          console.log('Trip summary request cancelled (expected behavior)');
          return of({
            [TripStatus.Scheduled]: 0,
            [TripStatus.PickedUp]: 0,
            [TripStatus.InTransit]: 0,
            [TripStatus.Delivered]: 0,
            [TripStatus.Paid]: 0
          } as Record<TripStatus, number>);
        }
        
        console.error('Failed to load trip summary:', error);
        this.handleError(error);
        // Return empty summary to gracefully degrade
        return of({
          [TripStatus.Scheduled]: 0,
          [TripStatus.PickedUp]: 0,
          [TripStatus.InTransit]: 0,
          [TripStatus.Delivered]: 0,
          [TripStatus.Paid]: 0,
          [TripStatus.Canceled]: 0
        } as Record<TripStatus, number>);
      })
    );
  }

  private updateSummaryCards(summary: Record<TripStatus, number>): void {
    this.summaryCards = [
      {
        status: TripStatus.Scheduled,
        label: 'Scheduled',
        count: summary[TripStatus.Scheduled] || 0,
        color: '#E3F2FD',
        icon: 'schedule'
      },
      {
        status: TripStatus.PickedUp,
        label: 'Picked Up',
        count: summary[TripStatus.PickedUp] || 0,
        color: '#FFF3E0',
        icon: 'local_shipping'
      },
      {
        status: TripStatus.InTransit,
        label: 'In Transit',
        count: summary[TripStatus.InTransit] || 0,
        color: '#F3E5F5',
        icon: 'directions'
      },
      {
        status: TripStatus.Delivered,
        label: 'Delivered',
        count: summary[TripStatus.Delivered] || 0,
        color: '#E8F5E9',
        icon: 'check_circle'
      },
      {
        status: TripStatus.Paid,
        label: 'Paid',
        count: summary[TripStatus.Paid] || 0,
        color: '#E0F2F1',
        icon: 'payments'
      },
      {
        status: TripStatus.Canceled,
        label: 'Canceled',
        count: summary[TripStatus.Canceled] || 0,
        color: '#FFEBEE',
        icon: 'cancel'
      }
    ];
  }

  filterByStatus(status: TripStatus): void {
    this.dashboardState.updateFilters({ status });
    // Announce filter change to screen readers
    const statusLabel = this.getStatusLabel(status);
    this.accessibilityService.announceToScreenReader(`Filtered trips by ${statusLabel} status`);
  }

  /**
   * Track by function for ngFor performance
   */
  trackByStatus(index: number, card: SummaryCard): TripStatus {
    return card.status;
  }

  /**
   * Get accessible label for summary card
   */
  getSummaryCardAriaLabel(card: SummaryCard): string {
    return `${card.count} trips with ${card.label} status. Click to filter by this status.`;
  }

  /**
   * Get accessible description for summary card
   */
  getSummaryCardDescription(card: SummaryCard): string {
    return this.accessibilityService.getSummaryCardAriaDescription(card.status, card.count);
  }

  /**
   * Get readable status label
   */
  private getStatusLabel(status: TripStatus): string {
    const labels: { [key in TripStatus]: string } = {
      [TripStatus.Scheduled]: 'Scheduled',
      [TripStatus.PickedUp]: 'Picked Up',
      [TripStatus.InTransit]: 'In Transit',
      [TripStatus.Delivered]: 'Delivered',
      [TripStatus.Paid]: 'Paid',
      [TripStatus.Canceled]: 'Canceled'
    };
    return labels[status] || status;
  }

  private buildApiFilters(filters: DashboardFilters): TripFilters {
    const apiFilters: TripFilters = {};

    if (filters.dateRange.startDate) {
      apiFilters.startDate = filters.dateRange.startDate.toISOString();
    }
    if (filters.dateRange.endDate) {
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

  private handleError(error: any): void {
    this.hasError = true;
    let errorMessage = 'Failed to load trip summary';
    
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
    // Trigger reload by emitting current filters
    const currentFilters = this.dashboardState.getCurrentFilters();
    this.loadSummary(currentFilters).subscribe({
      next: summary => {
        this.updateSummaryCards(summary);
      },
      error: error => {
        this.handleError(error);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
