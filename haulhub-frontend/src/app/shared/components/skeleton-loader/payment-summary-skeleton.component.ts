import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonLoaderComponent } from './skeleton-loader.component';

@Component({
  selector: 'app-payment-summary-skeleton',
  standalone: true,
  imports: [CommonModule, SkeletonLoaderComponent],
  template: `
    <div class="payment-summary-skeleton">
      <div class="skeleton-card">
        <app-skeleton-loader type="text" width="50%" height="1.25rem"></app-skeleton-loader>
        <div class="skeleton-metrics">
          <div class="skeleton-metric" *ngFor="let metric of metrics">
            <app-skeleton-loader type="text" width="70%" height="0.875rem"></app-skeleton-loader>
            <app-skeleton-loader type="text" width="50%" height="1.5rem" style="margin-top: 4px;"></app-skeleton-loader>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./payment-summary-skeleton.component.scss']
})
export class PaymentSummarySkeletonComponent {
  metrics = Array(4).fill(0); // Broker, Driver, Lorry Owner, Profit
}