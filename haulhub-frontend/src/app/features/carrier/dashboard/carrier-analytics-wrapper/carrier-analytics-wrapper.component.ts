import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CarrierAnalyticsComponent } from '../../analytics/analytics.component';

@Component({
  selector: 'app-carrier-analytics-wrapper',
  standalone: true,
  imports: [CommonModule, CarrierAnalyticsComponent],
  template: `
    <div class="analytics-wrapper">
      <app-carrier-analytics [isWrapped]="true"></app-carrier-analytics>
    </div>
  `,
  styles: [`
    .analytics-wrapper {
      width: 100%;
      
      // Hide duplicate filters and back button
      ::ng-deep app-carrier-analytics {
        app-carrier-unified-filter-card {
          display: none !important;
        }
        
        .back-button {
          display: none !important;
        }
      }
    }
  `]
})
export class CarrierAnalyticsWrapperComponent {}
