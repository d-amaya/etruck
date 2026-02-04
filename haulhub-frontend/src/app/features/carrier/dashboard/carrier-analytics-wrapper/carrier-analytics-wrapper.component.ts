import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-carrier-analytics-wrapper',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="analytics-container">
      <p>Carrier Analytics - Coming Soon</p>
      <p>This will display analytics for the carrier organization</p>
    </div>
  `,
  styles: [`
    .analytics-container {
      background: white;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  `]
})
export class CarrierAnalyticsWrapperComponent {}
