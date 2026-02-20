import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SharedFilterService } from '../../dispatcher/dashboard/shared-filter.service';
import { AdminFilterService } from './admin-filter.service';
import { PaymentReportComponent } from '../../dispatcher/payment-report/payment-report.component';

@Component({
  selector: 'app-admin-payments-wrapper',
  standalone: true,
  imports: [CommonModule, PaymentReportComponent],
  template: `
    <div class="payments-wrapper">
      <app-payment-report [isWrapped]="true"></app-payment-report>
    </div>
  `,
  styles: [`
    .payments-wrapper {
      width: 100%;
      ::ng-deep app-payment-report {
        .header-with-back .back-button { display: none !important; }
        .filter-form { display: none !important; }
        .loading-container { display: none !important; }
      }
    }
  `]
})
export class AdminPaymentsWrapperComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(
    private adminFilterService: AdminFilterService,
    private sharedFilterService: SharedFilterService
  ) {}

  ngOnInit(): void {
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
