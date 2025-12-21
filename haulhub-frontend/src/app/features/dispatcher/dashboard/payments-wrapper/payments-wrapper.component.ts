import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SharedFilterService } from '../shared-filter.service';
import { PaymentReportComponent } from '../../payment-report/payment-report.component';

/**
 * Wrapper component for payment report
 * Integrates with shared filter service
 */
@Component({
  selector: 'app-payments-wrapper',
  standalone: true,
  imports: [
    CommonModule,
    PaymentReportComponent
  ],
  template: `
    <div class="payments-wrapper">
      <app-payment-report></app-payment-report>
    </div>
  `,
  styles: [`
    .payments-wrapper {
      width: 100%;
      
      // Hide duplicate back button and filters
      ::ng-deep app-payment-report {
        .header-with-back .back-button {
          display: none !important;
        }
        
        .filter-form {
          display: none !important;
        }
      }
    }
  `]
})
export class PaymentsWrapperComponent implements OnInit, OnDestroy {
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
