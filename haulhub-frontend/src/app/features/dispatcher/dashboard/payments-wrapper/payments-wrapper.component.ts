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
      <app-payment-report [isWrapped]="true"></app-payment-report>
    </div>
  `,
  styles: [`
    .payments-wrapper {
      width: 100%;
      
      // Hide duplicate back button, filters, and loading spinner
      ::ng-deep app-payment-report {
        .header-with-back .back-button {
          display: none !important;
        }
        
        .filter-form {
          display: none !important;
        }
        
        .loading-container {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          z-index: -1 !important;
          position: absolute !important;
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
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
