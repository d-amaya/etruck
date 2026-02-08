import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CarrierPaymentReportComponent } from '../../payment-report/payment-report.component';

@Component({
  selector: 'app-carrier-payments-wrapper',
  standalone: true,
  imports: [CommonModule, CarrierPaymentReportComponent],
  template: `
    <div class="payments-wrapper">
      <app-carrier-payment-report [isWrapped]="true"></app-carrier-payment-report>
    </div>
  `,
  styles: [`
    .payments-wrapper {
      width: 100%;
    }
  `]
})
export class CarrierPaymentsWrapperComponent {}
