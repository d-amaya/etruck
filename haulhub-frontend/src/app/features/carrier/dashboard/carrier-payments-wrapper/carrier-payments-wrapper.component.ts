import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-carrier-payments-wrapper',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="payments-container">
      <p>Carrier Payments - Coming Soon</p>
      <p>This will display payment information for the carrier</p>
    </div>
  `,
  styles: [`
    .payments-container {
      background: white;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  `]
})
export class CarrierPaymentsWrapperComponent {}
